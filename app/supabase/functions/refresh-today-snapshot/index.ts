import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createRemoteJWKSet, jwtVerify } from 'https://deno.land/x/jose@v5.2.3/index.ts';

// refresh-today-snapshot
// 그래프 카드에서 새로고침 버튼을 탭하면 호출한다.
// 클라이언트가 전달한 현재가·환율로 오늘자 daily_snapshots 1행을 재계산·upsert한다.
// 일 3회 제한을 서버에서 강제하며, 갱신 실패 시 횟수를 차감하지 않는다.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type AssetType = 'korean_stock' | 'us_stock' | 'crypto';

interface CurrentPriceItem {
  ticker: string;
  asset_type: AssetType;
  price: number;
  currency: string;
}

interface AccountEventRow {
  event_type: 'buy' | 'sell' | 'deposit' | 'withdraw' | 'dividend';
  ticker: string | null;
  asset_type: string | null;
  quantity: number | null;
  currency: string;
  fee: number;
  tax: number;
  amount: number;
  fx_rate_at_event: number | null;
}

interface SnapshotRow {
  snapshot_date: string;
  user_id: string;
  total_value_krw: number;
  principal_krw: number;
  cash_krw: number;
  cash_usd: number;
  net_profit_krw: number;
  fx_rate_usd: number;
}

/**
 * account_events를 집계하여 스냅샷 값을 계산한다.
 * cron-create-snapshots의 computeSnapshot과 동일한 패턴을 사용하되,
 * priceMap을 클라이언트가 전달한 current_prices로 구성한다.
 */
function computeSnapshot(
  userId: string,
  events: AccountEventRow[],
  priceMap: Map<string, number>,          // key: "asset_type:ticker" → price
  priceCurrencyMap: Map<string, string>,
  fxRateUsd: number,
  snapshotDate: string,
): SnapshotRow {
  let principalKrw = 0;
  let cashKrw = 0;
  let cashUsd = 0;

  for (const ev of events) {
    const fx = ev.fx_rate_at_event ?? fxRateUsd;

    if (ev.event_type === 'deposit' || ev.event_type === 'withdraw') {
      const sign = ev.event_type === 'deposit' ? 1 : -1;
      const amtKrw = ev.currency === 'KRW' ? ev.amount : ev.amount * fx;
      principalKrw += sign * amtKrw;
    }

    if (ev.currency === 'KRW') {
      switch (ev.event_type) {
        case 'deposit':  cashKrw += ev.amount; break;
        case 'withdraw': cashKrw -= ev.amount; break;
        case 'buy':      cashKrw -= ev.amount; break;
        case 'sell':     cashKrw += ev.amount; break;
        case 'dividend': cashKrw += ev.amount - ev.tax; break;
      }
    } else if (ev.currency === 'USD') {
      switch (ev.event_type) {
        case 'deposit':  cashUsd += ev.amount; break;
        case 'withdraw': cashUsd -= ev.amount; break;
        case 'buy':      cashUsd -= ev.amount; break;
        case 'sell':     cashUsd += ev.amount; break;
        case 'dividend': cashUsd += ev.amount - ev.tax; break;
      }
    }
  }

  // 종목별 순 보유 수량 계산
  const netQtyMap = new Map<string, { qty: number; asset_type: string }>();
  for (const ev of events) {
    if ((ev.event_type === 'buy' || ev.event_type === 'sell') && ev.ticker && ev.asset_type) {
      const key = `${ev.asset_type}:${ev.ticker}`;
      const existing = netQtyMap.get(key) ?? { qty: 0, asset_type: ev.asset_type };
      existing.qty += ev.event_type === 'buy' ? (ev.quantity ?? 0) : -(ev.quantity ?? 0);
      netQtyMap.set(key, existing);
    }
  }

  // 종목 평가액 합산
  let holdingsValueKrw = 0;
  for (const [key, v] of netQtyMap) {
    if (v.qty <= 0) continue;
    const price = priceMap.get(key);
    if (price === undefined) continue;
    const currency = priceCurrencyMap.get(key) ?? 'KRW';
    const valueKrw = currency === 'KRW' ? v.qty * price : v.qty * price * fxRateUsd;
    holdingsValueKrw += valueKrw;
  }

  const totalValueKrw = holdingsValueKrw + cashKrw + cashUsd * fxRateUsd;
  const netProfitKrw = totalValueKrw - principalKrw;

  return {
    snapshot_date:    snapshotDate,
    user_id:          userId,
    total_value_krw:  Math.round(totalValueKrw),
    principal_krw:    Math.round(principalKrw),
    cash_krw:         Math.round(cashKrw),
    cash_usd:         Math.round(cashUsd * 100) / 100,
    net_profit_krw:   Math.round(netProfitKrw),
    fx_rate_usd:      fxRateUsd,
  };
}

/** KST 기준 오늘 날짜를 YYYY-MM-DD 문자열로 반환한다. */
function todayKst(): string {
  const now = new Date();
  // KST = UTC+9
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

const JWKS = createRemoteJWKSet(
  new URL(`${Deno.env.get('SUPABASE_URL')}/auth/v1/.well-known/jwks.json`),
);

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // ── 1. JWT 검증 및 user_id 추출 ──────────────────────────────
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token) {
    return new Response(
      JSON.stringify({ error: { code: '401', message: '인증 토큰이 없습니다.' } }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  let userId: string;
  try {
    const { payload } = await jwtVerify(token, JWKS);
    const sub = payload.sub;
    if (!sub) throw new Error('sub claim 없음');
    userId = sub;
  } catch (err) {
    return new Response(
      JSON.stringify({ error: { code: '401', message: `유효하지 않은 토큰입니다: ${err instanceof Error ? err.message : err}` } }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // ── 요청 바디 파싱 ────────────────────────────────────────────
  let body: { current_prices?: CurrentPriceItem[]; fx_rate_usd?: number };
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: { code: '400', message: 'JSON 형식 오류입니다.' } }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const { current_prices, fx_rate_usd } = body;

  if (!Array.isArray(current_prices) || current_prices.length === 0) {
    return new Response(
      JSON.stringify({ error: { code: '400', message: 'current_prices 배열이 비어 있거나 형식이 올바르지 않습니다.' } }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
  if (typeof fx_rate_usd !== 'number' || fx_rate_usd <= 0) {
    return new Response(
      JSON.stringify({ error: { code: '400', message: 'fx_rate_usd는 0보다 큰 숫자여야 합니다.' } }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // service_role 클라이언트 (quota/snapshot 쓰기용)
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const adminClient = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey);

  const today = todayKst();
  const MAX_QUOTA = 3;

  // ── 2. 쿼터 확인 ─────────────────────────────────────────────
  const { data: quotaRow, error: quotaErr } = await adminClient
    .from('snapshot_refresh_quotas')
    .select('used_count, last_refreshed_at')
    .eq('user_id', userId)
    .eq('quota_date', today)
    .maybeSingle();

  if (quotaErr) {
    return new Response(
      JSON.stringify({ error: { code: '502', message: `쿼터 조회 실패: ${quotaErr.message}` } }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const currentUsedCount: number = quotaRow?.used_count ?? 0;

  if (currentUsedCount >= MAX_QUOTA) {
    return new Response(
      JSON.stringify({
        error: {
          code: '429',
          message: `일 ${MAX_QUOTA}회 제한을 초과하였습니다. 자정(KST) 이후 다시 시도하세요.`,
        },
        quota: {
          used_count: currentUsedCount,
          remaining: 0,
          last_refreshed_at: quotaRow?.last_refreshed_at ?? null,
        },
      }),
      { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // ── 3. account_events 집계 ───────────────────────────────────
  const { data: events, error: evErr } = await adminClient
    .from('account_events')
    .select(
      'event_type, ticker, asset_type, quantity, currency, fee, tax, amount, fx_rate_at_event',
    )
    .eq('user_id', userId)
    .lte('event_date', today)
    .order('event_date', { ascending: true });

  if (evErr) {
    return new Response(
      JSON.stringify({ error: { code: '502', message: `이벤트 조회 실패: ${evErr.message}` } }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  if (!events || events.length === 0) {
    return new Response(
      JSON.stringify({
        error: {
          code: '422',
          message: '집계에 필요한 account_events가 없습니다. 거래 이벤트를 먼저 등록하세요.',
        },
      }),
      { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // current_prices → priceMap / priceCurrencyMap
  const priceMap = new Map<string, number>();
  const priceCurrencyMap = new Map<string, string>();
  for (const p of current_prices) {
    const key = `${p.asset_type}:${p.ticker}`;
    priceMap.set(key, p.price);
    priceCurrencyMap.set(key, p.currency);
  }

  // ── 4. 스냅샷 계산 및 upsert ─────────────────────────────────
  let snapshot: SnapshotRow;
  try {
    snapshot = computeSnapshot(
      userId,
      events as AccountEventRow[],
      priceMap,
      priceCurrencyMap,
      fx_rate_usd,
      today,
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: { code: '502', message: `스냅샷 계산 실패: ${err instanceof Error ? err.message : err}` } }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const { error: upsertErr } = await adminClient
    .from('daily_snapshots')
    .upsert(snapshot, { onConflict: 'user_id,snapshot_date' });

  if (upsertErr) {
    return new Response(
      JSON.stringify({ error: { code: '502', message: `스냅샷 저장 실패: ${upsertErr.message}` } }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // ── 5. 쿼터 증가 (스냅샷 upsert 성공 후에만) ──────────────────
  const newUsedCount = currentUsedCount + 1;
  const nowIso = new Date().toISOString();

  const { error: quotaUpsertErr } = await adminClient
    .from('snapshot_refresh_quotas')
    .upsert(
      {
        user_id:           userId,
        quota_date:        today,
        used_count:        newUsedCount,
        last_refreshed_at: nowIso,
      },
      { onConflict: 'user_id,quota_date' },
    );

  if (quotaUpsertErr) {
    // 쿼터 업데이트 실패는 비치명적으로 처리: 스냅샷은 이미 저장됐으므로
    // 에러를 로그만 남기고 200 응답을 반환한다.
    console.error('쿼터 업데이트 실패 (비치명적):', quotaUpsertErr.message);
  }

  // ── 6. 응답 반환 ─────────────────────────────────────────────
  return new Response(
    JSON.stringify({
      snapshot: {
        snapshot_date:    snapshot.snapshot_date,
        total_value_krw:  snapshot.total_value_krw,
        principal_krw:    snapshot.principal_krw,
        cash_krw:         snapshot.cash_krw,
        cash_usd:         snapshot.cash_usd,
        net_profit_krw:   snapshot.net_profit_krw,
        fx_rate_usd:      snapshot.fx_rate_usd,
      },
      quota: {
        used_count:        newUsedCount,
        remaining:         MAX_QUOTA - newUsedCount,
        last_refreshed_at: nowIso,
      },
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
