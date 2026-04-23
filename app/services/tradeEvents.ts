import { supabase } from '../utils/supabase';
import {
  TradeEvent,
  TradeEventInput,
  TradeEventUpdateInput,
  TradeEventFilters,
  CsvPreviewResult,
  CsvConfirmResult,
} from '../types/tradeEvent';

// ────────────────────────────────────────────
// TradeEvent API
// ────────────────────────────────────────────

/**
 * 매매 이벤트 등록: trade_events 테이블에 단건 삽입한다.
 */
export async function createTradeEvent(data: TradeEventInput): Promise<TradeEvent> {
  const { data: result, error } = await supabase
    .from('trade_events')
    .insert(data)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return result as TradeEvent;
}

/**
 * 매매 이벤트 목록 조회
 */
export async function getTradeEvents(filters?: TradeEventFilters): Promise<TradeEvent[]> {
  let query = supabase
    .from('trade_events')
    .select('*')
    .order('trade_date', { ascending: false });

  if (filters?.asset_type) {
    query = query.eq('asset_type', filters.asset_type);
  }
  if (filters?.trade_type) {
    query = query.eq('trade_type', filters.trade_type);
  }
  if (filters?.ticker) {
    query = query.eq('ticker', filters.ticker);
  }
  if (filters?.from) {
    query = query.gte('trade_date', filters.from);
  }
  if (filters?.to) {
    query = query.lte('trade_date', filters.to);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []) as TradeEvent[];
}

/**
 * 매매 이벤트 수정: 지정한 ID의 레코드를 부분 업데이트한다.
 */
export async function updateTradeEvent(
  id: string,
  data: TradeEventUpdateInput
): Promise<TradeEvent> {
  const { data: result, error } = await supabase
    .from('trade_events')
    .update(data)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw error;
  }

  if (!result) {
    throw new Error('해당 매매 이벤트를 찾을 수 없습니다.');
  }

  return result as TradeEvent;
}

/**
 * 매매 이벤트 삭제: 지정한 ID의 레코드를 삭제한다.
 */
export async function deleteTradeEvent(id: string): Promise<void> {
  const { error } = await supabase
    .from('trade_events')
    .delete()
    .eq('id', id);

  if (error) {
    throw error;
  }
}

/**
 * CSV 업로드 미리보기: parse-trade-csv Edge Function 호출.
 * DB에 저장하지 않고 파싱 결과만 반환한다.
 */
export async function uploadTradeCSV(
  file: { uri: string; name: string; type: string },
  broker?: string
): Promise<CsvPreviewResult> {
  const formData = new FormData();
  // React Native FormData append: { uri, name, type } 형태
  formData.append('file', {
    uri: file.uri,
    name: file.name,
    type: file.type,
  } as unknown as Blob);

  if (broker) {
    formData.append('broker', broker);
  }

  const { data, error } = await supabase.functions.invoke('parse-trade-csv', {
    body: formData,
  });

  if (error) {
    throw error;
  }

  return data as CsvPreviewResult;
}

/**
 * CSV 파싱 결과 확정 저장: confirm-trade-csv Edge Function 호출.
 * 미리보기에서 확인한 데이터를 trade_events 테이블에 일괄 저장한다.
 */
export async function confirmTradeCSV(
  rows: CsvPreviewResult['preview']
): Promise<CsvConfirmResult> {
  const { data, error } = await supabase.functions.invoke('confirm-trade-csv', {
    body: { events: rows },
  });

  if (error) {
    throw error;
  }

  return data as CsvConfirmResult;
}
