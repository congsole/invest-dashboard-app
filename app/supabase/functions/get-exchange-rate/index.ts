import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 메모리 캐시 (Edge Function 인스턴스 수명 내에서만 유효, DB 캐시 미사용)
interface CacheEntry {
  from: string;
  to: string;
  rate: number;
  fetched_at: string;
  cached_at: number;
}

const rateCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1시간

function isCacheValid(key: string): boolean {
  const entry = rateCache.get(key);
  return entry !== undefined && Date.now() - entry.cached_at < CACHE_TTL_MS;
}

// ExchangeRate-API 호출 (지원 통화쌍: from → to)
async function fetchExchangeRate(from: string, to: string, apiKey: string): Promise<number> {
  const url = `https://v6.exchangerate-api.com/v6/${apiKey}/pair/${from}/${to}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`ExchangeRate-API 오류: ${res.status}`);
  }
  const data = await res.json();
  if (data.result !== 'success') {
    throw new Error(`ExchangeRate-API 응답 오류: ${data['error-type'] ?? 'unknown'}`);
  }
  return data.conversion_rate as number;
}

// 지원 통화쌍 검증 (USD/KRW 위주이나 확장 가능)
const SUPPORTED_CURRENCIES = ['USD', 'KRW', 'EUR', 'JPY', 'GBP'];

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

  let body: { from?: string; to?: string } = {};
  try {
    const text = await req.text();
    if (text.trim()) {
      body = JSON.parse(text);
    }
  } catch {
    return new Response(
      JSON.stringify({ error: { code: '400', message: 'JSON 형식 오류입니다.' } }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const from = (body.from ?? 'USD').toUpperCase();
  const to = (body.to ?? 'KRW').toUpperCase();

  if (!SUPPORTED_CURRENCIES.includes(from) || !SUPPORTED_CURRENCIES.includes(to)) {
    return new Response(
      JSON.stringify({ error: { code: '400', message: `지원하지 않는 통화쌍: ${from}/${to}` } }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  if (from === to) {
    // 동일 통화: 항상 1
    return new Response(
      JSON.stringify({
        from,
        to,
        rate: 1,
        fetched_at: new Date().toISOString(),
        is_cached: false,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const cacheKey = `${from}:${to}`;

  // 캐시 유효한 경우 바로 반환
  if (isCacheValid(cacheKey)) {
    const cached = rateCache.get(cacheKey)!;
    return new Response(
      JSON.stringify({
        from: cached.from,
        to: cached.to,
        rate: cached.rate,
        fetched_at: cached.fetched_at,
        is_cached: true,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const apiKey = Deno.env.get('EXCHANGE_RATE_API_KEY') ?? '';

  try {
    const rate = await fetchExchangeRate(from, to, apiKey);
    const fetchedAt = new Date().toISOString();

    rateCache.set(cacheKey, { from, to, rate, fetched_at: fetchedAt, cached_at: Date.now() });

    return new Response(
      JSON.stringify({ from, to, rate, fetched_at: fetchedAt, is_cached: false }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('ExchangeRate-API 오류:', err);

    // 캐시(만료됐어도) 있으면 대체
    const stale = rateCache.get(cacheKey);
    if (stale) {
      return new Response(
        JSON.stringify({
          from: stale.from,
          to: stale.to,
          rate: stale.rate,
          fetched_at: stale.fetched_at,
          is_cached: true,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ error: { code: '502', message: '환율 API 호출에 실패했습니다.' } }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
