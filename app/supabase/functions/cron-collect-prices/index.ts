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

// Twelve Data 무료 플랜: 분당 8크레딧 (심볼 1개 = 1크레딧)
// 8개씩 나눠 요청하고 청크 사이 60초 대기. 429는 60초 후 1회 재시도.
const TWELVE_DATA_CHUNK_SIZE = 8;
const RATE_LIMIT_WAIT_MS = 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchStockChunk(
  chunk: HoldingTicker[],
  apiKey: string,
  fallbackDate: string,
): Promise<{ prices: PriceRow[]; failed: FailedTicker[] }> {
  const prices: PriceRow[] = [];
  const failed: FailedTicker[] = [];

  // date 파라미터 없이 호출하면 가장 최근 거래일 종가를 반환한다.
  // 실행 시각에 따라 당일 장이 안 끝났을 수 있으므로 응답의 datetime(실제 거래일)으로 저장.
  const symbols = chunk.map((t) => t.ticker).join(',');
  const url = `https://api.twelvedata.com/eod?symbol=${encodeURIComponent(symbols)}&apikey=${apiKey}`;

  try {
    let res = await fetch(url);
    if (res.status === 429) {
      await sleep(RATE_LIMIT_WAIT_MS);
      res = await fetch(url);
    }
    if (!res.ok) throw new Error(`Twelve Data HTTP 오류: ${res.status}`);
    const data = await res.json();

    for (const t of chunk) {
      const entry = chunk.length === 1 ? data : data[t.ticker];
      if (!entry || entry.status === 'error' || !entry.close) {
        failed.push({ ticker: t.ticker, reason: entry?.message ?? '종가 데이터 없음' });
        continue;
      }
      prices.push({
        ticker:     t.ticker,
        asset_type: t.asset_type,
        date:       typeof entry.datetime === 'string' ? entry.datetime.slice(0, 10) : fallbackDate,
        close:      parseFloat(entry.close),
        currency:   t.asset_type === 'korean_stock' ? 'KRW' : 'USD',
      });
    }
  } catch (err) {
    for (const t of chunk) {
      failed.push({ ticker: t.ticker, reason: `Twelve Data 오류: ${err instanceof Error ? err.message : err}` });
    }
  }

  return { prices, failed };
}

async function fetchStockClose(
  tickers: HoldingTicker[],
  apiKey: string,
  date: string,
): Promise<{ prices: PriceRow[]; failed: FailedTicker[] }> {
  const prices: PriceRow[] = [];
  const failed: FailedTicker[] = [];

  if (tickers.length === 0) return { prices, failed };

  for (let i = 0; i < tickers.length; i += TWELVE_DATA_CHUNK_SIZE) {
    if (i > 0) await sleep(RATE_LIMIT_WAIT_MS);
    const chunk = tickers.slice(i, i + TWELVE_DATA_CHUNK_SIZE);
    const result = await fetchStockChunk(chunk, apiKey, date);
    prices.push(...result.prices);
    failed.push(...result.failed);
  }

  return { prices, failed };
}

// 네이버 금융 일별 시세 — KRX는 Twelve Data 무료 플랜 미지원이라 네이버 사용
// 응답이 표준 JSON이 아니므로 행 단위 정규식으로 파싱한다.
async function fetchKoreanStockClose(
  tickers: HoldingTicker[],
  date: string,
): Promise<{ prices: PriceRow[]; failed: FailedTicker[] }> {
  const prices: PriceRow[] = [];
  const failed: FailedTicker[] = [];

  if (tickers.length === 0) return { prices, failed };

  const endTime = date.replaceAll('-', '');
  const start = new Date(date);
  start.setDate(start.getDate() - 7);
  const startTime = start.toISOString().slice(0, 10).replaceAll('-', '');

  for (const t of tickers) {
    try {
      const url = `https://api.finance.naver.com/siseJson.naver?symbol=${encodeURIComponent(t.ticker)}&requestType=1&startTime=${startTime}&endTime=${endTime}&timeframe=day`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`네이버 금융 HTTP 오류: ${res.status}`);
      const text = await res.text();

      // ["20260610", 시가, 고가, 저가, 종가, 거래량, ...] 행 추출
      const rows = [...text.matchAll(/\["(\d{8})",\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),/g)];
      if (rows.length === 0) {
        failed.push({ ticker: t.ticker, reason: '네이버 금융 시세 데이터 없음' });
        continue;
      }

      // endTime 이하 가장 최근 거래일 사용 (휴장일 대비)
      const last = rows[rows.length - 1];
      const rowDate = `${last[1].slice(0, 4)}-${last[1].slice(4, 6)}-${last[1].slice(6, 8)}`;
      prices.push({
        ticker:     t.ticker,
        asset_type: t.asset_type,
        date:       rowDate,
        close:      parseFloat(last[5]),
        currency:   'KRW',
      });
    } catch (err) {
      failed.push({ ticker: t.ticker, reason: `네이버 금융 오류: ${err instanceof Error ? err.message : err}` });
    }
    await sleep(500); // 비공식 API — 0.5초 간격으로 조회
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

interface CollectResult {
  collected: number;
  skipped: number;
  failed: FailedTicker[];
}

async function collectPrices(): Promise<CollectResult> {
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
    throw new Error(`account_events 조회 오류: ${eventsError.message}`);
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
    return { collected: 0, skipped: 0, failed: [] };
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
    return { collected: 0, skipped, failed: [] };
  }

  const usStockTickers = toFetch.filter((t) => t.asset_type === 'us_stock');
  const krStockTickers = toFetch.filter((t) => t.asset_type === 'korean_stock');
  const cryptoTickers = toFetch.filter((t) => t.asset_type === 'crypto');

  const twelveDataApiKey = Deno.env.get('TWELVE_DATA_API_KEY') ?? '';
  const coinGeckoApiKey = Deno.env.get('COINGECKO_API_KEY') ?? '';

  const [usResult, krResult, cryptoResult] = await Promise.all([
    fetchStockClose(usStockTickers, twelveDataApiKey, today).catch((err) => ({
      prices: [] as PriceRow[],
      failed: usStockTickers.map((t) => ({ ticker: t.ticker, reason: String(err) })),
    })),
    fetchKoreanStockClose(krStockTickers, today).catch((err) => ({
      prices: [] as PriceRow[],
      failed: krStockTickers.map((t) => ({ ticker: t.ticker, reason: String(err) })),
    })),
    fetchCryptoClose(cryptoTickers, coinGeckoApiKey).catch((err) => ({
      prices: [] as PriceRow[],
      failed: cryptoTickers.map((t) => ({ ticker: t.ticker, reason: String(err) })),
    })),
  ]);

  const allPrices: PriceRow[] = [...usResult.prices, ...krResult.prices, ...cryptoResult.prices];
  const allFailed: FailedTicker[] = [...usResult.failed, ...krResult.failed, ...cryptoResult.failed];

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
      throw new Error(`prices upsert 오류: ${upsertError.message}`);
    }
    collected = allPrices.length;
  }

  return { collected, skipped, failed: allFailed };
}

// Twelve Data 분당 한도 대기 때문에 전체 수집이 1분을 넘을 수 있다.
// cron(pg_net)의 HTTP timeout은 수 초라, 기본 동작은 즉시 202를 반환하고
// 수집은 EdgeRuntime.waitUntil 백그라운드로 계속한다 (결과는 함수 로그로 확인).
// 수동 검증 시에는 ?sync=1로 호출하면 완료까지 기다렸다가 결과를 반환한다.
Deno.serve(async (req: Request) => {
  const sync = new URL(req.url).searchParams.get('sync') === '1';

  if (sync) {
    try {
      const result = await collectPrices();
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('cron-collect-prices 실패:', message);
      return new Response(
        JSON.stringify({ error: { code: '500', message } }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }
  }

  const task = collectPrices()
    .then((r) => console.log('cron-collect-prices 완료:', JSON.stringify(r)))
    .catch((err) => console.error('cron-collect-prices 실패:', err instanceof Error ? err.message : err));

  // @ts-ignore: EdgeRuntime은 Supabase Edge Runtime 전역
  if (typeof EdgeRuntime !== 'undefined') {
    // @ts-ignore
    EdgeRuntime.waitUntil(task);
  } else {
    await task; // waitUntil 미지원 환경 (로컬 단독 실행 등)
  }

  return new Response(JSON.stringify({ status: 'accepted' }), {
    status: 202,
    headers: { 'Content-Type': 'application/json' },
  });
});
