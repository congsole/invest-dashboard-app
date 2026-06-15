import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createRemoteJWKSet, jwtVerify } from 'https://deno.land/x/jose@v5.2.3/index.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type AssetType = 'korean_stock' | 'us_stock' | 'crypto';

interface TickerRequest {
  ticker: string;
  asset_type: AssetType;
}

interface PriceResult {
  ticker: string;
  asset_type: AssetType;
  price: number;
  currency: string;
  fetched_at: string;
  is_cached: boolean;
  /** 'realtime': 외부 API 성공, 'cached': 내부 캐시 사용 */
  source: 'realtime' | 'cached';
}

interface FailedResult {
  ticker: string;
  asset_type: AssetType;
  reason: string;
}

// 메모리 캐시 (Edge Function 인스턴스 수명 내에서만 유효)
const priceCache = new Map<string, { price: number; currency: string; fetched_at: string }>();
const CACHE_TTL_MS = 60 * 1000; // 1분 캐시
const cacheTimes = new Map<string, number>();

function isCacheValid(key: string): boolean {
  const t = cacheTimes.get(key);
  return t !== undefined && Date.now() - t < CACHE_TTL_MS;
}

// 네이버 폴링 API로 한국주식 현재가 조회
// (Twelve Data 무료 플랜이 KRX 심볼 미지원 — cron-collect-prices와 동일 사유로 네이버 사용)
async function fetchKoreanStockPrices(
  tickers: TickerRequest[],
): Promise<Map<string, { price: number; currency: string; fetched_at: string }>> {
  const result = new Map<string, { price: number; currency: string; fetched_at: string }>();
  if (tickers.length === 0) return result;

  // SERVICE_ITEM:코드1,코드2,... 형식으로 복수 종목 동시 조회 가능
  const symbols = tickers.map((t) => t.ticker).join(',');
  const url = `https://polling.finance.naver.com/api/realtime?query=SERVICE_ITEM:${encodeURIComponent(symbols)}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`네이버 폴링 API 오류: ${res.status}`);
  }

  const data = await res.json();
  const fetchedAt = new Date().toISOString();
  const datas: { cd?: string; nv?: number }[] = data?.result?.areas?.[0]?.datas ?? [];

  for (const d of datas) {
    if (d.cd && typeof d.nv === 'number' && d.nv > 0) {
      result.set(d.cd, { price: d.nv, currency: 'KRW', fetched_at: fetchedAt });
    }
  }

  return result;
}

// Twelve Data API로 미국주식 현재가 조회
async function fetchStockPrices(
  tickers: TickerRequest[],
  apiKey: string,
): Promise<Map<string, { price: number; currency: string; fetched_at: string }>> {
  const result = new Map<string, { price: number; currency: string; fetched_at: string }>();
  if (tickers.length === 0) return result;

  // Twelve Data는 콤마로 여러 ticker 동시 조회 가능
  const tickerSymbols = tickers.map((t) => t.ticker).join(',');
  const url = `https://api.twelvedata.com/price?symbol=${encodeURIComponent(tickerSymbols)}&apikey=${apiKey}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Twelve Data API 오류: ${res.status}`);
  }

  const data = await res.json();
  const fetchedAt = new Date().toISOString();

  // 단일 ticker 응답과 복수 ticker 응답 구조가 다름
  if (tickers.length === 1) {
    const t = tickers[0];
    if (data.price && !isNaN(parseFloat(data.price))) {
      result.set(t.ticker, {
        price: parseFloat(data.price),
        currency: 'USD',
        fetched_at: fetchedAt,
      });
    }
  } else {
    for (const t of tickers) {
      const entry = data[t.ticker];
      if (entry && entry.price && !isNaN(parseFloat(entry.price))) {
        result.set(t.ticker, {
          price: parseFloat(entry.price),
          currency: 'USD',
          fetched_at: fetchedAt,
        });
      }
    }
  }

  return result;
}

// CoinGecko API로 코인 현재가 조회
async function fetchCryptoPrices(
  tickers: TickerRequest[],
  apiKey: string,
): Promise<Map<string, { price: number; currency: string; fetched_at: string }>> {
  const result = new Map<string, { price: number; currency: string; fetched_at: string }>();
  if (tickers.length === 0) return result;

  // CoinGecko는 ticker(BTC, ETH 등)를 코인 ID로 변환 필요
  // 간단한 매핑 (주요 코인)
  const tickerToId: Record<string, string> = {
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

  const ids = tickers.map((t) => tickerToId[t.ticker.toUpperCase()] ?? t.ticker.toLowerCase());
  const idsParam = ids.join(',');

  const headers: Record<string, string> = { 'accept': 'application/json' };
  if (apiKey) {
    headers['x-cg-demo-api-key'] = apiKey;
  }

  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(idsParam)}&vs_currencies=usd,krw`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`CoinGecko API 오류: ${res.status}`);
  }

  const data = await res.json();
  const fetchedAt = new Date().toISOString();

  tickers.forEach((t, i) => {
    const coinId = ids[i];
    const entry = data[coinId];
    if (entry) {
      // USD 가격 반환 (KRW 환산은 클라이언트에서)
      const price = entry.usd ?? entry.krw;
      const currency = entry.usd !== undefined ? 'USD' : 'KRW';
      if (price !== undefined) {
        result.set(t.ticker, { price, currency, fetched_at: fetchedAt });
      }
    }
  });

  return result;
}

const JWKS = createRemoteJWKSet(
  new URL(`${Deno.env.get('SUPABASE_URL')}/auth/v1/.well-known/jwks.json`),
);

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) {
    return new Response(
      JSON.stringify({ error: { code: '401', message: '인증 토큰이 없습니다.' } }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
  try {
    await jwtVerify(token, JWKS);
  } catch (err) {
    return new Response(
      JSON.stringify({ error: { code: '401', message: `유효하지 않은 토큰입니다: ${err instanceof Error ? err.message : err}` } }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  let body: { tickers?: TickerRequest[]; chunk_index?: number };
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: { code: '400', message: 'JSON 형식 오류입니다.' } }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const { tickers, chunk_index = 0 } = body;
  if (!Array.isArray(tickers) || tickers.length === 0) {
    return new Response(
      JSON.stringify({ error: { code: '400', message: 'tickers 배열이 비어 있거나 형식이 올바르지 않습니다.' } }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // 미국주식 8개 초과 검증
  const usStockCount = tickers.filter((t) => t.asset_type === 'us_stock').length;
  if (usStockCount > 8) {
    return new Response(
      JSON.stringify({
        error: {
          code: '400',
          message: `us_stock 종목이 ${usStockCount}개로 최대 8개를 초과합니다. 청크를 분할하여 호출하세요.`,
        },
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  console.log(`[get-market-prices] chunk_index=${chunk_index} tickers=${tickers.length}개 (us_stock=${usStockCount}개)`);

  const twelveDataApiKey = Deno.env.get('TWELVE_DATA_API_KEY') ?? '';
  const coinGeckoApiKey = Deno.env.get('COINGECKO_API_KEY') ?? '';

  // 캐시에서 먼저 확인
  const prices: PriceResult[] = [];
  const failed: FailedResult[] = [];
  const needFetchUs: TickerRequest[] = [];
  const needFetchKr: TickerRequest[] = [];
  const needFetchCrypto: TickerRequest[] = [];

  for (const t of tickers) {
    const cacheKey = `${t.asset_type}:${t.ticker}`;
    if (isCacheValid(cacheKey) && priceCache.has(cacheKey)) {
      const cached = priceCache.get(cacheKey)!;
      prices.push({
        ticker: t.ticker,
        asset_type: t.asset_type,
        price: cached.price,
        currency: cached.currency,
        fetched_at: cached.fetched_at,
        is_cached: true,
        source: 'cached',
      });
    } else if (t.asset_type === 'crypto') {
      needFetchCrypto.push(t);
    } else if (t.asset_type === 'korean_stock') {
      needFetchKr.push(t);
    } else {
      needFetchUs.push(t);
    }
  }

  // 조회 성공 시 캐시 갱신, 실패 시 만료된 캐시 값으로 대체하거나 failed에 추가
  async function fetchAndMerge(
    reqs: TickerRequest[],
    fetcher: (reqs: TickerRequest[]) => Promise<Map<string, { price: number; currency: string; fetched_at: string }>>,
    label: string,
  ) {
    if (reqs.length === 0) return;
    let fetched = new Map<string, { price: number; currency: string; fetched_at: string }>();
    let fetchError: string | null = null;
    try {
      fetched = await fetcher(reqs);
    } catch (err) {
      fetchError = err instanceof Error ? err.message : String(err);
      console.error(`[get-market-prices] ${label} 오류:`, err);
    }
    for (const t of reqs) {
      const entry = fetched.get(t.ticker);
      const cacheKey = `${t.asset_type}:${t.ticker}`;
      if (entry) {
        priceCache.set(cacheKey, entry);
        cacheTimes.set(cacheKey, Date.now());
        prices.push({
          ticker: t.ticker,
          asset_type: t.asset_type,
          price: entry.price,
          currency: entry.currency,
          fetched_at: entry.fetched_at,
          is_cached: false,
          source: 'realtime',
        });
      } else {
        // 만료된 캐시라도 있으면 사용 (source: 'cached')
        const stale = priceCache.get(cacheKey);
        if (stale) {
          prices.push({
            ticker: t.ticker,
            asset_type: t.asset_type,
            price: stale.price,
            currency: stale.currency,
            fetched_at: stale.fetched_at,
            is_cached: true,
            source: 'cached',
          });
        } else {
          // 캐시도 없으면 failed에 추가
          failed.push({
            ticker: t.ticker,
            asset_type: t.asset_type,
            reason: fetchError
              ? `${label} 조회 실패: ${fetchError}`
              : `${label} 응답에 ${t.ticker} 누락`,
          });
        }
      }
    }
  }

  await Promise.all([
    fetchAndMerge(needFetchUs, (reqs) => fetchStockPrices(reqs, twelveDataApiKey), 'Twelve Data API').catch((err) => {
      console.error('[get-market-prices] fetchAndMerge(us) 예상치 못한 오류:', err);
    }),
    fetchAndMerge(needFetchKr, (reqs) => fetchKoreanStockPrices(reqs), '네이버 폴링 API').catch((err) => {
      console.error('[get-market-prices] fetchAndMerge(kr) 예상치 못한 오류:', err);
    }),
    fetchAndMerge(needFetchCrypto, (reqs) => fetchCryptoPrices(reqs, coinGeckoApiKey), 'CoinGecko API').catch((err) => {
      console.error('[get-market-prices] fetchAndMerge(crypto) 예상치 못한 오류:', err);
    }),
  ]);

  console.log(`[get-market-prices] chunk_index=${chunk_index} 완료: prices=${prices.length}개, failed=${failed.length}개`);

  return new Response(
    JSON.stringify({ prices, failed }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
