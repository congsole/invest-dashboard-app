import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// cron-collect-prices
// 트리거 스케줄:
//   한국주식: KST 16:30 (장 마감 30분 후)
//   미국주식: KST 익일 07:00 (EST 17:00, 장 마감 30분 후)
//   코인:     KST 00:05 (daily_snapshots cron 전)
//
// 동작:
//   1. account_events에서 보유 중인 ticker 목록 추출
//   2. Twelve Data (주식) / CoinGecko (코인)에서 해당일 종가 수집
//   3. prices 테이블에 upsert (ticker, asset_type, date 기준 중복 시 무시)

type AssetType = 'korean_stock' | 'us_stock' | 'crypto';

interface HoldingTicker {
  ticker: string;
  asset_type: AssetType;
}

interface PriceRow {
  ticker: string;
  asset_type: AssetType;
  date: string;
  close: number;
  currency: string;
}

interface FailedTicker {
  ticker: string;
  reason: string;
}

// CoinGecko: ticker → coin_id 매핑 (주요 코인)
const COIN_ID_MAP: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  XRP: 'ripple',
  ADA: 'cardano',
  SOL: 'solana',
  DOGE: 'dogecoin',
  DOT: 'polkadot',
  MATIC: 'matic-network',
  AVAX: 'avalanche-2',
  LINK: 'chainlink',
};

async function fetchStockClose(
  tickers: HoldingTicker[],
  apiKey: string,
  date: string,
): Promise<{ prices: PriceRow[]; failed: FailedTicker[] }> {
  const prices: PriceRow[] = [];
  const failed: FailedTicker[] = [];

  if (tickers.length === 0) return { prices, failed };

  // Twelve Data: 단일 요청으로 여러 ticker 조회
  const symbols = tickers.map((t) => t.ticker).join(',');
  const url = `https://api.twelvedata.com/eod?symbol=${encodeURIComponent(symbols)}&date=${date}&apikey=${apiKey}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Twelve Data HTTP 오류: ${res.status}`);
    const data = await res.json();

    for (const t of tickers) {
      const entry = tickers.length === 1 ? data : data[t.ticker];
      if (!entry || entry.status === 'error' || !entry.close) {
        failed.push({ ticker: t.ticker, reason: entry?.message ?? '종가 데이터 없음' });
        continue;
      }
      prices.push({
        ticker:     t.ticker,
        asset_type: t.asset_type,
        date,
        close:      parseFloat(entry.close),
        currency:   t.asset_type === 'korean_stock' ? 'KRW' : 'USD',
      });
    }
  } catch (err) {
    for (const t of tickers) {
      failed.push({ ticker: t.ticker, reason: `Twelve Data 오류: ${err instanceof Error ? err.message : err}` });
    }
  }

  return { prices, failed };
}

async function fetchCryptoClose(
  tickers: HoldingTicker[],
  apiKey: string,
): Promise<{ prices: PriceRow[]; failed: FailedTicker[] }> {
  const prices: PriceRow[] = [];
  const failed: FailedTicker[] = [];

  if (tickers.length === 0) return { prices, failed };

  const ids = tickers.map((t) => COIN_ID_MAP[t.ticker.toUpperCase()] ?? t.ticker.toLowerCase());
  const idsParam = ids.join(',');
  const headers: Record<string, string> = { accept: 'application/json' };
  if (apiKey) headers['x-cg-demo-api-key'] = apiKey;

  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(idsParam)}&vs_currencies=usd`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`CoinGecko HTTP 오류: ${res.status}`);
    const data = await res.json();

    const today = new Date().toISOString().split('T')[0];
    tickers.forEach((t, i) => {
      const coinId = ids[i];
      const entry = data[coinId];
      if (!entry || entry.usd === undefined) {
        failed.push({ ticker: t.ticker, reason: '코인 종가 데이터 없음' });
        return;
      }
      prices.push({
        ticker:     t.ticker,
        asset_type: 'crypto',
        date:       today,
        close:      entry.usd,
        currency:   'USD',
      });
    });
  } catch (err) {
    for (const t of tickers) {
      failed.push({ ticker: t.ticker, reason: `CoinGecko 오류: ${err instanceof Error ? err.message : err}` });
    }
  }

  return { prices, failed };
}

Deno.serve(async (_req: Request) => {
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey);

  const today = new Date().toISOString().split('T')[0];

  // 1. 보유 중인 ticker 목록 추출 (account_events에서 순매수 > 0인 종목)
  const { data: rawEvents, error: eventsError } = await supabase
    .from('account_events')
    .select('ticker, asset_type, event_type, quantity')
    .in('event_type', ['buy', 'sell'])
    .not('ticker', 'is', null)
    .not('asset_type', 'is', null);

  if (eventsError) {
    console.error('account_events 조회 오류:', eventsError);
    return new Response(
      JSON.stringify({ error: { code: '500', message: eventsError.message } }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // ticker별 순수량 계산
  const netQtyMap = new Map<string, { qty: number; asset_type: AssetType }>();
  for (const row of rawEvents ?? []) {
    const key = `${row.asset_type}:${row.ticker}`;
    const existing = netQtyMap.get(key) ?? { qty: 0, asset_type: row.asset_type as AssetType };
    existing.qty += row.event_type === 'buy' ? (row.quantity ?? 0) : -(row.quantity ?? 0);
    netQtyMap.set(key, existing);
  }

  const holdingTickers: HoldingTicker[] = [];
  // rawEvents에서 직접 ticker 정보 집계
  const tickerMap = new Map<string, HoldingTicker>();
  for (const row of rawEvents ?? []) {
    const key = `${row.asset_type}:${row.ticker}`;
    if (!tickerMap.has(key)) {
      tickerMap.set(key, { ticker: row.ticker, asset_type: row.asset_type as AssetType });
    }
  }
  // 순수량 기준으로 보유 종목 필터
  for (const [key, v] of netQtyMap) {
    if (v.qty > 0) {
      const info = tickerMap.get(key);
      if (info) holdingTickers.push(info);
    }
  }

  if (holdingTickers.length === 0) {
    return new Response(
      JSON.stringify({ collected: 0, skipped: 0, failed: [] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // 2. 이미 오늘 수집된 ticker 제외 (skipped)
  const { data: existingPrices } = await supabase
    .from('prices')
    .select('ticker, asset_type')
    .eq('date', today)
    .in('ticker', holdingTickers.map((t) => t.ticker));

  const existingSet = new Set(
    (existingPrices ?? []).map((p: { ticker: string; asset_type: string }) => `${p.asset_type}:${p.ticker}`)
  );

  const toFetch = holdingTickers.filter((t) => !existingSet.has(`${t.asset_type}:${t.ticker}`));
  const skipped = holdingTickers.length - toFetch.length;

  if (toFetch.length === 0) {
    return new Response(
      JSON.stringify({ collected: 0, skipped, failed: [] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const stockTickers = toFetch.filter((t) => t.asset_type !== 'crypto');
  const cryptoTickers = toFetch.filter((t) => t.asset_type === 'crypto');

  const twelveDataApiKey = Deno.env.get('TWELVE_DATA_API_KEY') ?? '';
  const coinGeckoApiKey = Deno.env.get('COINGECKO_API_KEY') ?? '';

  const [stockResult, cryptoResult] = await Promise.all([
    fetchStockClose(stockTickers, twelveDataApiKey, today).catch((err) => ({
      prices: [] as PriceRow[],
      failed: stockTickers.map((t) => ({ ticker: t.ticker, reason: String(err) })),
    })),
    fetchCryptoClose(cryptoTickers, coinGeckoApiKey).catch((err) => ({
      prices: [] as PriceRow[],
      failed: cryptoTickers.map((t) => ({ ticker: t.ticker, reason: String(err) })),
    })),
  ]);

  const allPrices: PriceRow[] = [...stockResult.prices, ...cryptoResult.prices];
  const allFailed: FailedTicker[] = [...stockResult.failed, ...cryptoResult.failed];

  // 3. prices 테이블에 upsert
  let collected = 0;
  if (allPrices.length > 0) {
    const upsertRows = allPrices.map((p) => ({
      ticker:     p.ticker,
      asset_type: p.asset_type,
      date:       p.date,
      close:      p.close,
      currency:   p.currency,
      updated_at: new Date().toISOString(),
    }));

    const { error: upsertError } = await supabase
      .from('prices')
      .upsert(upsertRows, { onConflict: 'ticker,asset_type,date' });

    if (upsertError) {
      console.error('prices upsert 오류:', upsertError);
      return new Response(
        JSON.stringify({ error: { code: '500', message: upsertError.message } }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }
    collected = allPrices.length;
  }

  return new Response(
    JSON.stringify({ collected, skipped, failed: allFailed }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
});
