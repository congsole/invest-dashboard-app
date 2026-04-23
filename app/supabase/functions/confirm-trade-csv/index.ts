import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type AssetType = 'korean_stock' | 'us_stock' | 'crypto';
type TradeType = 'buy' | 'sell';

interface TradeEventInput {
  row?: number;
  asset_type: AssetType;
  trade_type: TradeType;
  ticker: string;
  name: string;
  trade_date: string;
  quantity: number;
  price_per_unit: number;
  currency: string;
  fee?: number;
  fee_currency?: string;
  tax?: number;
  settlement_amount: number;
}

interface FailedRow {
  row: number;
  reason: string;
}

function validateEvent(event: TradeEventInput, index: number): string | null {
  const validAssetTypes: AssetType[] = ['korean_stock', 'us_stock', 'crypto'];
  const validTradeTypes: TradeType[] = ['buy', 'sell'];

  if (!validAssetTypes.includes(event.asset_type)) {
    return `asset_type 값 오류: "${event.asset_type}"`;
  }
  if (!validTradeTypes.includes(event.trade_type)) {
    return `trade_type 값 오류: "${event.trade_type}"`;
  }
  if (!event.ticker?.trim()) {
    return 'ticker 누락';
  }
  if (!event.name?.trim()) {
    return 'name 누락';
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(event.trade_date)) {
    return `trade_date 형식 오류: "${event.trade_date}"`;
  }
  if (typeof event.quantity !== 'number' || event.quantity <= 0) {
    return `quantity 오류: ${event.quantity}`;
  }
  if (typeof event.price_per_unit !== 'number' || event.price_per_unit < 0) {
    return `price_per_unit 오류: ${event.price_per_unit}`;
  }
  if (typeof event.settlement_amount !== 'number') {
    return `settlement_amount 오류: ${event.settlement_amount}`;
  }
  return null;
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

  let body: { events?: TradeEventInput[] };
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

  const toInsert: Array<Record<string, unknown>> = [];
  const failed: FailedRow[] = [];

  events.forEach((event, idx) => {
    const rowNum = event.row ?? idx + 1;
    const validationError = validateEvent(event, idx);
    if (validationError) {
      failed.push({ row: rowNum, reason: validationError });
      return;
    }
    toInsert.push({
      user_id: user.id,
      asset_type: event.asset_type,
      trade_type: event.trade_type,
      ticker: event.ticker.trim(),
      name: event.name.trim(),
      trade_date: event.trade_date,
      quantity: event.quantity,
      price_per_unit: event.price_per_unit,
      currency: event.currency || 'KRW',
      fee: event.fee ?? 0,
      fee_currency: event.fee_currency || 'KRW',
      tax: event.tax ?? 0,
      settlement_amount: event.settlement_amount,
    });
  });

  let inserted = 0;
  if (toInsert.length > 0) {
    const { error: insertError } = await supabase
      .from('trade_events')
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
    JSON.stringify({ inserted, failed }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
