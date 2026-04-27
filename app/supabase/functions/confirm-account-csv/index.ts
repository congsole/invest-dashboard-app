import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type EventType = 'buy' | 'sell' | 'deposit' | 'withdraw' | 'dividend';
type AssetType = 'korean_stock' | 'us_stock' | 'crypto' | 'cash';

interface AccountEventInput {
  row?: number;
  event_type: EventType;
  event_date: string;
  asset_type: AssetType | null;
  ticker: string | null;
  name: string | null;
  quantity: number | null;
  price_per_unit: number | null;
  currency: string;
  fee?: number;
  fee_currency?: string | null;
  tax?: number;
  amount: number;
  fx_rate_at_event?: number | null;
  external_ref?: string | null;
}

interface FailedRow {
  row: number;
  reason: string;
}

const VALID_EVENT_TYPES: EventType[] = ['buy', 'sell', 'deposit', 'withdraw', 'dividend'];

function validateEvent(event: AccountEventInput, rowNum: number): string | null {
  if (!VALID_EVENT_TYPES.includes(event.event_type)) {
    return `event_type 값 오류: "${event.event_type}"`;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(event.event_date)) {
    return `event_date 형식 오류: "${event.event_date}"`;
  }
  if (!event.currency?.trim()) {
    return 'currency 누락';
  }
  if (typeof event.amount !== 'number') {
    return `amount 오류: ${event.amount}`;
  }

  // buy/sell 필수 필드
  if (event.event_type === 'buy' || event.event_type === 'sell') {
    if (!event.ticker?.trim()) return 'buy/sell: ticker 누락';
    if (!event.name?.trim()) return 'buy/sell: name 누락';
    if (typeof event.quantity !== 'number' || event.quantity <= 0) {
      return `buy/sell: quantity 오류: ${event.quantity}`;
    }
    if (typeof event.price_per_unit !== 'number' || event.price_per_unit < 0) {
      return `buy/sell: price_per_unit 오류: ${event.price_per_unit}`;
    }
  }

  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

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

  let body: { events?: AccountEventInput[] };
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: { code: '400', message: 'JSON 형식 오류입니다.' } }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const { events } = body;
  if (!Array.isArray(events) || events.length === 0) {
    return new Response(
      JSON.stringify({ error: { code: '400', message: 'events 배열이 비어 있습니다.' } }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // external_ref 기반 중복 검출: 이미 저장된 external_ref 목록 조회
  const externalRefs = events
    .map((e) => e.external_ref)
    .filter((r): r is string => typeof r === 'string' && r.length > 0);

  let existingRefs = new Set<string>();
  if (externalRefs.length > 0) {
    const { data: existingRows, error: refError } = await supabase
      .from('account_events')
      .select('external_ref')
      .eq('user_id', user.id)
      .in('external_ref', externalRefs);

    if (refError) {
      return new Response(
        JSON.stringify({ error: { code: '400', message: `중복 검출 오류: ${refError.message}` } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    existingRefs = new Set(
      (existingRows ?? []).map((r: { external_ref: string | null }) => r.external_ref).filter(Boolean) as string[]
    );
  }

  const toInsert: Array<Record<string, unknown>> = [];
  const failed: FailedRow[] = [];
  let skipped = 0;

  events.forEach((event, idx) => {
    const rowNum = event.row ?? idx + 1;

    // 중복 검출
    if (event.external_ref && existingRefs.has(event.external_ref)) {
      skipped++;
      return;
    }

    const validationError = validateEvent(event, rowNum);
    if (validationError) {
      failed.push({ row: rowNum, reason: validationError });
      return;
    }

    toInsert.push({
      user_id:          user.id,
      event_type:       event.event_type,
      event_date:       event.event_date,
      asset_type:       event.asset_type ?? null,
      ticker:           event.ticker?.trim() ?? null,
      name:             event.name?.trim() ?? null,
      quantity:         event.quantity ?? null,
      price_per_unit:   event.price_per_unit ?? null,
      currency:         event.currency,
      fee:              event.fee ?? 0,
      fee_currency:     event.fee_currency ?? null,
      tax:              event.tax ?? 0,
      amount:           event.amount,
      fx_rate_at_event: event.fx_rate_at_event ?? null,
      source:           'csv',
      external_ref:     event.external_ref ?? null,
    });
  });

  let inserted = 0;
  if (toInsert.length > 0) {
    const { error: insertError } = await supabase
      .from('account_events')
      .insert(toInsert);

    if (insertError) {
      return new Response(
        JSON.stringify({ error: { code: '400', message: insertError.message } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    inserted = toInsert.length;
  }

  return new Response(
    JSON.stringify({ inserted, skipped, failed }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
