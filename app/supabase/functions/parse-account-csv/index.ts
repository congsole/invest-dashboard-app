import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type EventType = 'buy' | 'sell' | 'deposit' | 'withdraw' | 'dividend';
type AssetType = 'korean_stock' | 'us_stock' | 'crypto' | 'cash';

interface ParsedRow {
  row: number;
  event_type: EventType;
  event_date: string;
  asset_type: AssetType | null;
  ticker: string | null;
  name: string | null;
  quantity: number | null;
  price_per_unit: number | null;
  currency: string;
  fee: number;
  fee_currency: string | null;
  tax: number;
  amount: number;
  fx_rate_at_event: number | null;
  external_ref: string | null;
}

interface ParseError {
  row: number;
  reason: string;
}

// CSV 텍스트를 2D 배열로 파싱 (RFC 4180 호환)
function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (line.trim() === '') continue;
    const cols: string[] = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuote) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') {
          inQuote = false;
        } else {
          cur += ch;
        }
      } else {
        if (ch === '"') {
          inQuote = true;
        } else if (ch === ',') {
          cols.push(cur.trim());
          cur = '';
        } else {
          cur += ch;
        }
      }
    }
    cols.push(cur.trim());
    rows.push(cols);
  }
  return rows;
}

function buildHeaderMap(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headers.forEach((h, i) => {
    map[h.toLowerCase().replace(/\s+/g, '_')] = i;
  });
  return map;
}

// SHA-256 기반 external_ref 해시 생성
async function hashRow(cols: string[], rowNum: number): Promise<string> {
  const raw = `${rowNum}:${cols.join('|')}`;
  const encoded = new TextEncoder().encode(raw);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

const VALID_EVENT_TYPES: EventType[] = ['buy', 'sell', 'deposit', 'withdraw', 'dividend'];
const VALID_ASSET_TYPES: AssetType[] = ['korean_stock', 'us_stock', 'crypto', 'cash'];

function parseRow(
  cols: string[],
  headerMap: Record<string, number>,
  rowNum: number,
  externalRef: string,
): { parsed: ParsedRow | null; error: ParseError | null } {
  const get = (key: string): string => (cols[headerMap[key]] ?? '').trim();

  const eventTypeRaw = get('event_type');
  const eventDateRaw = get('event_date');
  const assetTypeRaw = get('asset_type');
  const ticker = get('ticker') || null;
  const name = get('name') || null;
  const quantityRaw = get('quantity');
  const priceRaw = get('price_per_unit');
  const currency = get('currency') || 'KRW';
  const feeRaw = get('fee');
  const feeCurrency = get('fee_currency') || null;
  const taxRaw = get('tax');
  const amountRaw = get('amount');
  const fxRateRaw = get('fx_rate_at_event');

  if (!VALID_EVENT_TYPES.includes(eventTypeRaw as EventType)) {
    return { parsed: null, error: { row: rowNum, reason: `event_type 값 오류: "${eventTypeRaw}"` } };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDateRaw)) {
    return { parsed: null, error: { row: rowNum, reason: `event_date 형식 오류: "${eventDateRaw}"` } };
  }

  const eventType = eventTypeRaw as EventType;
  const assetType: AssetType | null = assetTypeRaw
    ? (VALID_ASSET_TYPES.includes(assetTypeRaw as AssetType) ? (assetTypeRaw as AssetType) : null)
    : null;

  if (assetTypeRaw && !VALID_ASSET_TYPES.includes(assetTypeRaw as AssetType)) {
    return { parsed: null, error: { row: rowNum, reason: `asset_type 값 오류: "${assetTypeRaw}"` } };
  }

  // buy/sell 필수 필드 검증
  if (eventType === 'buy' || eventType === 'sell') {
    if (!ticker) return { parsed: null, error: { row: rowNum, reason: 'buy/sell: ticker 누락' } };
    if (!name) return { parsed: null, error: { row: rowNum, reason: 'buy/sell: name 누락' } };
  }

  const quantity = quantityRaw ? parseFloat(quantityRaw) : null;
  const pricePerUnit = priceRaw ? parseFloat(priceRaw) : null;
  const fee = parseFloat(feeRaw) || 0;
  const tax = parseFloat(taxRaw) || 0;
  const amount = parseFloat(amountRaw);
  const fxRate = fxRateRaw ? parseFloat(fxRateRaw) : null;

  if ((eventType === 'buy' || eventType === 'sell') && (quantity === null || isNaN(quantity) || quantity <= 0)) {
    return { parsed: null, error: { row: rowNum, reason: `buy/sell: quantity 오류: "${quantityRaw}"` } };
  }
  if ((eventType === 'buy' || eventType === 'sell') && (pricePerUnit === null || isNaN(pricePerUnit) || pricePerUnit < 0)) {
    return { parsed: null, error: { row: rowNum, reason: `buy/sell: price_per_unit 오류: "${priceRaw}"` } };
  }
  if (isNaN(amount)) {
    return { parsed: null, error: { row: rowNum, reason: `amount 오류: "${amountRaw}"` } };
  }

  return {
    parsed: {
      row: rowNum,
      event_type: eventType,
      event_date: eventDateRaw,
      asset_type: assetType,
      ticker,
      name,
      quantity: (eventType === 'buy' || eventType === 'sell') ? quantity : null,
      price_per_unit: (eventType === 'buy' || eventType === 'sell') ? pricePerUnit : null,
      currency,
      fee,
      fee_currency: feeCurrency || null,
      tax,
      amount,
      fx_rate_at_event: fxRate && !isNaN(fxRate) ? fxRate : null,
      external_ref: externalRef,
    },
    error: null,
  };
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

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return new Response(
      JSON.stringify({ error: { code: '400', message: 'multipart/form-data 형식이 아닙니다.' } }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const file = formData.get('file');
  if (!file || !(file instanceof File)) {
    return new Response(
      JSON.stringify({ error: { code: '400', message: 'file 필드가 없습니다.' } }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const MAX_SIZE = 10 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    return new Response(
      JSON.stringify({ error: { code: '413', message: '파일 크기가 10MB를 초과합니다.' } }),
      { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const text = await file.text();
  const rows = parseCsvText(text);

  if (rows.length < 2) {
    return new Response(
      JSON.stringify({ error: { code: '400', message: 'CSV에 데이터 행이 없습니다.' } }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const [headerRow, ...dataRows] = rows;
  const headerMap = buildHeaderMap(headerRow);

  // 필수 헤더 확인 (event_type, event_date, currency, amount는 항상 필요)
  const requiredHeaders = ['event_type', 'event_date', 'currency', 'amount'];
  const missingHeaders = requiredHeaders.filter((h) => !(h in headerMap));
  if (missingHeaders.length > 0) {
    return new Response(
      JSON.stringify({ error: { code: '400', message: `CSV 헤더 누락: ${missingHeaders.join(', ')}` } }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const preview: ParsedRow[] = [];
  const errors: ParseError[] = [];

  for (let idx = 0; idx < dataRows.length; idx++) {
    const cols = dataRows[idx];
    const rowNum = idx + 2;
    const externalRef = await hashRow(cols, rowNum);
    const { parsed, error } = parseRow(cols, headerMap, rowNum, externalRef);
    if (parsed) {
      preview.push(parsed);
    } else if (error) {
      errors.push(error);
    }
  }

  return new Response(
    JSON.stringify({
      preview,
      errors,
      total_rows: dataRows.length,
      parsed_rows: preview.length,
      failed_rows: errors.length,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
