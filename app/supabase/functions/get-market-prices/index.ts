import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
}

// 메모리 캐시 (Edge Function 인스턴스 수명 내에서만 유효)
const priceCache = new Map<string, { price: number; currency: string; fetched_at: string }>();
const CACHE_TTL_MS = 60 * 1000; // 1분 캐시
const cacheTimes = new Map<string, number>();

function isCacheValid(key: string): boolean {
  const t = cacheTimes.get(key);
  return t !== undefined && Date.now() - t < CACHE_TTL_MS;
}

// Twelve Data API로 주식 현재가 조회 (한국주식 + 미국주식)
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
        currency: t.asset_type === 'korean_stock' ? 'KRW' : 'USD',
        fetched_at: fetchedAt,
      });
    }
  } else {
    for (const t of tickers) {
      const entry = data[t.ticker];
      if (entry && entry.price && !isNaN(parseFloat(entry.price))) {
        result.set(t.ticker, {
          price: parseFloat(entry.price),
          currency: t.asset_type === 'korean_stock' ? 'KRW' : 'USD',
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

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // 인증 확인
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: { code: '401', message: '인증 토큰이 없습니다.' } }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(
      JSON.stringify({ error: { code: '401', message: '유효하지 않은 토큰입니다.' } }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  let body: { tickers?: TickerRequest[] };
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: { code: '400', message: 'JSON 형식 오류입니다.' } }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const { tickers } = body;
  if (!Array.isArray(tickers) || tickers.length === 0) {
    return new Response(
      JSON.stringify({ error: { code: '400', message: 'tickers 배열이 비어 있거나 형식이 올바르지 않습니다.' } }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const twelveDataApiKey = Deno.env.get('TWELVE_DATA_API_KEY') ?? '';
  const coinGeckoApiKey = Deno.env.get('COINGECKO_API_KEY') ?? '';

  // 캐시에서 먼저 확인
  const prices: PriceResult[] = [];
  const needFetchStock: TickerRequest[] = [];
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
      });
    } else if (t.asset_type === 'crypto') {
      needFetchCrypto.push(t);
    } else {
      needFetchStock.push(t);
    }
  }

  // 주식 현재가 조회
  if (needFetchStock.length > 0) {
    try {
      const stockPrices = await fetchStockPrices(needFetchStock, twelveDataApiKey);
      for (const t of needFetchStock) {
        const entry = stockPrices.get(t.ticker);
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
          });
        } else {
          // 조회 실패: 캐시 값이 있으면 그것으로 대체
          const cached = priceCache.get(cacheKey);
          if (cached) {
            prices.push({
              ticker: t.ticker,
              asset_type: t.asset_type,
              price: cached.price,
              currency: cached.currency,
              fetched_at: cached.fetched_at,
              is_cached: true,
            });
          }
        }
      }
    } catch (err) {
      // 외부 API 실패 시 캐시 값으로 대체
      for (const t of needFetchStock) {
        const cacheKey = `${t.asset_type}:${t.ticker}`;
        const cached = priceCache.get(cacheKey);
        if (cached) {
          prices.push({
            ticker: t.ticker,
            asset_type: t.asset_type,
            price: cached.price,
            currency: cached.currency,
            fetched_at: cached.fetched_at,
            is_cached: true,
          });
        }
      }
      console.error('Twelve Data API 오류:', err);
    }
  }

  // 코인 현재가 조회
  if (needFetchCrypto.length > 0) {
    try {
      const cryptoPrices = await fetchCryptoPrices(needFetchCrypto, coinGeckoApiKey);
      for (const t of needFetchCrypto) {
        const entry = cryptoPrices.get(t.ticker);
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
          });
        } else {
          const cached = priceCache.get(cacheKey);
          if (cached) {
            prices.push({
              ticker: t.ticker,
              asset_type: t.asset_type,
              price: cached.price,
              currency: cached.currency,
              fetched_at: cached.fetched_at,
              is_cached: true,
            });
          }
        }
      }
    } catch (err) {
      for (const t of needFetchCrypto) {
        const cacheKey = `${t.asset_type}:${t.ticker}`;
        const cached = priceCache.get(cacheKey);
        if (cached) {
          prices.push({
            ticker: t.ticker,
            asset_type: t.asset_type,
            price: cached.price,
            currency: cached.currency,
            fetched_at: cached.fetched_at,
            is_cached: true,
          });
        }
      }
      console.error('CoinGecko API 오류:', err);
    }
  }

  return new Response(
    JSON.stringify({ prices }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
