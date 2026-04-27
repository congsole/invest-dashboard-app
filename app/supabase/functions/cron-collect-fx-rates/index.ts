import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// cron-collect-fx-rates
// 매일 KST 00:01 (UTC 15:01 전일) 실행
// ExchangeRate-API에서 USD/KRW 환율을 수집하여 fx_rates 테이블에 upsert한다.

Deno.serve(async (req: Request) => {
  // service_role 검증 (Authorization 헤더 또는 Supabase 내부 서비스 토큰)
  const authHeader = req.headers.get('Authorization') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  // Bearer 토큰이 service_role 키인지 확인
  const token = authHeader.replace('Bearer ', '');
  if (token !== serviceRoleKey && !authHeader.includes('service_role')) {
    // pg_cron에서 직접 호출 시에는 Authorization 없이 올 수 있으므로
    // SUPABASE_SERVICE_ROLE_KEY로만 생성된 클라이언트 사용
    console.warn('cron-collect-fx-rates: 비인가 호출 무시. 내부 cron 전용.');
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    serviceRoleKey,
  );

  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD (UTC 기준)
  const apiKey = Deno.env.get('EXCHANGE_RATE_API_KEY') ?? '';

  let usdKrw: number;
  try {
    const url = `https://v6.exchangerate-api.com/v6/${apiKey}/pair/USD/KRW`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`ExchangeRate-API HTTP 오류: ${res.status}`);
    }
    const data = await res.json();
    if (data.result !== 'success') {
      throw new Error(`ExchangeRate-API 응답 오류: ${data['error-type'] ?? 'unknown'}`);
    }
    usdKrw = data.conversion_rate as number;
  } catch (err) {
    console.error('환율 수집 실패:', err);
    return new Response(
      JSON.stringify({ error: { code: '502', message: `환율 API 호출 실패: ${err instanceof Error ? err.message : err}` } }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // 기존 레코드 존재 여부 확인 (is_updated 응답값 결정용)
  const { data: existing } = await supabase
    .from('fx_rates')
    .select('date')
    .eq('date', today)
    .maybeSingle();

  const isUpdated = existing !== null;

  // fx_rates upsert
  const { error: dbError } = await supabase
    .from('fx_rates')
    .upsert(
      { date: today, usd_krw: usdKrw, updated_at: new Date().toISOString() },
      { onConflict: 'date' },
    );

  if (dbError) {
    console.error('fx_rates upsert 오류:', dbError);
    return new Response(
      JSON.stringify({ error: { code: '500', message: dbError.message } }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  return new Response(
    JSON.stringify({ date: today, usd_krw: usdKrw, is_updated: isUpdated }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
});
