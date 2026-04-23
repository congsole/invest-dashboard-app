import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type AssetType = 'korean_stock' | 'us_stock' | 'crypto';
type TradeType = 'buy' | 'sell';

interface ParsedRow {
  row: number;
  asset_type: AssetType;
  trade_type: TradeType;
  ticker: string;
  name: string;
  trade_date: string;
  quantity: number;
  price_per_unit: number;
  currency: string;
  fee: number;
  fee_currency: string;
  tax: number;
  settlement_amount: number;
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

// 컬럼 헤더로 인덱스 맵 생성
function buildHeaderMap(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headers.forEach((h, i) => {
    map[h.toLowerCase().replace(/\s+/g, '_')] = i;
  });
  return map;
}

// 일반 CSV 포맷 파싱 (표준 형식 가정)
function parseRow(
  cols: string[],
  headerMap: Record<string, number>,
  rowNum: number,
): { parsed: ParsedRow | null; error: ParseError | null } {
  const get = (key: string): string => (cols[headerMap[key]] ?? '').trim();

  const assetTypeRaw = get('asset_type');
  const tradeTypeRaw = get('trade_type');
  const ticker = get('ticker');
  const name = get('name');
  const tradeDateRaw = get('trade_date');
  const quantityRaw = get('quantity');
  const priceRaw = get('price_per_unit');
  const currency = get('currency') || 'KRW';
  const feeRaw = get('fee');
  const feeCurrency = get('fee_currency') || 'KRW';
  const taxRaw = get('tax');
  const settlementRaw = get('settlement_amount');

  const validAssetTypes: AssetType[] = ['korean_stock', 'us_stock', 'crypto'];
  const validTradeTypes: TradeType[] = ['buy', 'sell'];

  if (!validAssetTypes.includes(assetTypeRaw as AssetType)) {
    return { parsed: null, error: { row: rowNum, reason: `asset_type 값 오류: "${assetTypeRaw}"` } };
  }
  if (!validTradeTypes.includes(tradeTypeRaw as TradeType)) {
    return { parsed: null, error: { row: rowNum, reason: `trade_type 값 오류: "${tradeTypeRaw}"` } };
  }
  if (!ticker) {
    return { parsed: null, error: { row: rowNum, reason: 'ticker 누락' } };
  }
  if (!name) {
    return { parsed: null, error: { row: rowNum, reason: 'name 누락' } };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tradeDateRaw)) {
    return { parsed: null, error: { row: rowNum, reason: `trade_date 형식 오류: "${tradeDateRaw}" (YYYY-MM-DD 필요)` } };
  }

  const quantity = parseFloat(quantityRaw);
  const price = parseFloat(priceRaw);
  const fee = parseFloat(feeRaw) || 0;
  const tax = parseFloat(taxRaw) || 0;
  const settlement = parseFloat(settlementRaw);

  if (isNaN(quantity) || quantity <= 0) {
    return { parsed: null, error: { row: rowNum, reason: `quantity 오류: "${quantityRaw}"` } };
  }
  if (isNaN(price) || price < 0) {
    return { parsed: null, error: { row: rowNum, reason: `price_per_unit 오류: "${priceRaw}"` } };
  }
  if (isNaN(settlement)) {
    return { parsed: null, error: { row: rowNum, reason: `settlement_amount 오류: "${settlementRaw}"` } };
  }

  return {
    parsed: {
      row: rowNum,
      asset_type: assetTypeRaw as AssetType,
      trade_type: tradeTypeRaw as TradeType,
      ticker,
      name,
      trade_date: tradeDateRaw,
      quantity,
      price_per_unit: price,
      currency,
      fee,
      fee_currency: feeCurrency,
      tax,
      settlement_amount: settlement,
    },
    error: null,
  };
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

  // multipart/form-data 파싱
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

  // 파일 크기 제한 (10MB)
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

  // 필수 헤더 존재 여부 확인
  const requiredHeaders = ['asset_type', 'trade_type', 'ticker', 'name', 'trade_date', 'quantity', 'price_per_unit', 'settlement_amount'];
  const missingHeaders = requiredHeaders.filter((h) => !(h in headerMap));
  if (missingHeaders.length > 0) {
    return new Response(
      JSON.stringify({ error: { code: '400', message: `CSV 헤더 누락: ${missingHeaders.join(', ')}` } }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const preview: ParsedRow[] = [];
  const errors: ParseError[] = [];

  dataRows.forEach((cols, idx) => {
    const rowNum = idx + 2; // 헤더가 1행이므로 데이터는 2행부터
    const { parsed, error } = parseRow(cols, headerMap, rowNum);
    if (parsed) {
      preview.push(parsed);
    } else if (error) {
      errors.push(error);
    }
  });

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
