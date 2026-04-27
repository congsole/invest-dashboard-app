import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// cron-create-snapshots
// 매일 KST 00:05 실행
// 모든 활성 사용자의 daily_snapshots 1행을 생성한다.
//
// 계산 방식:
//   - principal_krw: 입금 − 출금 KRW 환산 누적
//   - cash_krw / cash_usd: 예수금
//   - total_value_krw: 종목 평가액(prices 테이블 최신 종가) + 예수금
//   - net_profit_krw: total_value_krw − principal_krw
//   - fx_rate_usd: fx_rates 테이블에서 당일 환율 (없으면 가장 최근 날짜 사용)

type EventType = 'buy' | 'sell' | 'deposit' | 'withdraw' | 'dividend';

interface AccountEventRow {
  user_id: string;
  event_type: EventType;
  event_date: string;
  asset_type: string | null;
  ticker: string | null;
  quantity: number | null;
  price_per_unit: number | null;
  currency: string;
  fee: number;
  tax: number;
  amount: number;
  fx_rate_at_event: number | null;
}

interface FailedUser {
  user_id: string;
  reason: string;
}

async function computeSnapshot(
  userId: string,
  events: AccountEventRow[],
  priceMap: Map<string, number>,   // key: "asset_type:ticker" → close (USD or KRW)
  priceCurrencyMap: Map<string, string>,
  fxRateUsd: number,
  snapshotDate: string,
): Promise<{
  snapshot_date: string;
  user_id: string;
  total_value_krw: number;
  principal_krw: number;
  cash_krw: number;
  cash_usd: number;
  net_profit_krw: number;
  fx_rate_usd: number;
}> {
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

    // 예수금 계산
    if (ev.currency === 'KRW') {
      switch (ev.event_type) {
        case 'deposit':   cashKrw += ev.amount; break;
        case 'withdraw':  cashKrw -= ev.amount; break;
        case 'buy':       cashKrw -= ev.amount; break;
        case 'sell':      cashKrw += ev.amount; break;
        case 'dividend':  cashKrw += ev.amount - ev.tax; break;
      }
    } else if (ev.currency === 'USD') {
      switch (ev.event_type) {
        case 'deposit':   cashUsd += ev.amount; break;
        case 'withdraw':  cashUsd -= ev.amount; break;
        case 'buy':       cashUsd -= ev.amount; break;
        case 'sell':      cashUsd += ev.amount; break;
        case 'dividend':  cashUsd += ev.amount - ev.tax; break;
      }
    }
  }

  // 종목별 순 보유 수량 계산 (간단 가중평균 없이 수량만 합산)
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
    const close = priceMap.get(key);
    if (close === undefined) continue;
    const currency = priceCurrencyMap.get(key) ?? 'KRW';
    const valueKrw = currency === 'KRW' ? v.qty * close : v.qty * close * fxRateUsd;
    holdingsValueKrw += valueKrw;
  }

  const totalValueKrw = holdingsValueKrw + cashKrw + cashUsd * fxRateUsd;
  const netProfitKrw = totalValueKrw - principalKrw;

  return {
    snapshot_date:   snapshotDate,
    user_id:         userId,
    total_value_krw: Math.round(totalValueKrw),
    principal_krw:   Math.round(principalKrw),
    cash_krw:        Math.round(cashKrw),
    cash_usd:        Math.round(cashUsd * 100) / 100,
    net_profit_krw:  Math.round(netProfitKrw),
    fx_rate_usd:     fxRateUsd,
  };
}

Deno.serve(async (_req: Request) => {
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey);

  const today = new Date().toISOString().split('T')[0];

  // 1. 오늘 환율 조회 (없으면 가장 최근 날짜)
  const { data: fxData } = await supabase
    .from('fx_rates')
    .select('usd_krw')
    .lte('date', today)
    .order('date', { ascending: false })
    .limit(1)
    .single();

  const fxRateUsd: number = fxData?.usd_krw ?? 1300;

  // 2. 모든 활성 사용자 목록 조회 (account_events에 1건 이상 있는 사용자)
  const { data: userRows, error: userError } = await supabase
    .from('account_events')
    .select('user_id')
    .limit(10000);

  if (userError) {
    return new Response(
      JSON.stringify({ error: { code: '500', message: userError.message } }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const uniqueUserIds = [...new Set((userRows ?? []).map((r: { user_id: string }) => r.user_id))];

  if (uniqueUserIds.length === 0) {
    return new Response(
      JSON.stringify({ processed_users: 0, inserted: 0, updated: 0, failed_users: [] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // 3. 오늘 prices 테이블에서 종가 맵 로드
  const { data: priceRows } = await supabase
    .from('prices')
    .select('ticker, asset_type, close, currency')
    .eq('date', today);

  const priceMap = new Map<string, number>();
  const priceCurrencyMap = new Map<string, string>();
  for (const p of priceRows ?? []) {
    const key = `${p.asset_type}:${p.ticker}`;
    priceMap.set(key, p.close);
    priceCurrencyMap.set(key, p.currency);
  }

  // 4. 사용자별 처리
  let insertedCount = 0;
  let updatedCount = 0;
  const failedUsers: FailedUser[] = [];

  for (const userId of uniqueUserIds) {
    try {
      // 사용자의 전체 account_events 조회
      const { data: events, error: evErr } = await supabase
        .from('account_events')
        .select('user_id, event_type, event_date, asset_type, ticker, quantity, price_per_unit, currency, fee, tax, amount, fx_rate_at_event')
        .eq('user_id', userId)
        .lte('event_date', today)
        .order('event_date', { ascending: true });

      if (evErr) {
        failedUsers.push({ user_id: userId, reason: evErr.message });
        continue;
      }

      const snapshot = await computeSnapshot(
        userId,
        (events ?? []) as AccountEventRow[],
        priceMap,
        priceCurrencyMap,
        fxRateUsd,
        today,
      );

      // 기존 스냅샷 존재 여부 확인
      const { data: existing } = await supabase
        .from('daily_snapshots')
        .select('id')
        .eq('user_id', userId)
        .eq('snapshot_date', today)
        .maybeSingle();

      const { error: upsertErr } = await supabase
        .from('daily_snapshots')
        .upsert(snapshot, { onConflict: 'user_id,snapshot_date' });

      if (upsertErr) {
        failedUsers.push({ user_id: userId, reason: upsertErr.message });
        continue;
      }

      if (existing) {
        updatedCount++;
      } else {
        insertedCount++;
      }
    } catch (err) {
      failedUsers.push({ user_id: userId, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  return new Response(
    JSON.stringify({
      processed_users: uniqueUserIds.length,
      inserted:        insertedCount,
      updated:         updatedCount,
      failed_users:    failedUsers,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
});
