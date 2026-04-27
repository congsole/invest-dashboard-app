/**
 * accountEvents.ts — 계정 이벤트 서비스 함수
 *
 * API 명세 참조: docs/api/api-spec.md — AccountEvent 섹션
 * 이슈 008: tradeEvents.ts 대체
 */

import { supabase } from '../utils/supabase';
import {
  AccountEvent,
  AccountEventInput,
  AccountEventUpdateInput,
  AccountEventFilters,
  CsvPreviewResult,
  CsvConfirmResult,
} from '../types/accountEvent';

// ────────────────────────────────────────────
// 계정 이벤트 목록 조회
// ────────────────────────────────────────────

export async function getAccountEvents(
  filters?: AccountEventFilters,
): Promise<AccountEvent[]> {
  let query = supabase
    .from('account_events')
    .select('*')
    .order('event_date', { ascending: false });

  if (filters?.event_type) {
    query = query.eq('event_type', filters.event_type);
  }
  if (filters?.asset_type) {
    query = query.eq('asset_type', filters.asset_type);
  }
  if (filters?.ticker) {
    query = query.eq('ticker', filters.ticker);
  }
  if (filters?.from) {
    query = query.gte('event_date', filters.from);
  }
  if (filters?.to) {
    query = query.lte('event_date', filters.to);
  }

  const { data, error } = await query;

  if (error) throw error;
  return (data ?? []) as AccountEvent[];
}

// ────────────────────────────────────────────
// 계정 이벤트 등록
// ────────────────────────────────────────────

export async function createAccountEvent(
  input: AccountEventInput,
): Promise<AccountEvent> {
  const { data, error } = await supabase
    .from('account_events')
    .insert({ ...input })
    .select()
    .single();

  if (error) throw error;
  return data as AccountEvent;
}

// ────────────────────────────────────────────
// 계정 이벤트 수정
// ────────────────────────────────────────────

export async function updateAccountEvent(
  id: string,
  input: AccountEventUpdateInput,
): Promise<AccountEvent> {
  const { data, error } = await supabase
    .from('account_events')
    .update({ ...input })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  if (!data) throw new Error('해당 이벤트를 찾을 수 없습니다.');
  return data as AccountEvent;
}

// ────────────────────────────────────────────
// 계정 이벤트 삭제
// ────────────────────────────────────────────

export async function deleteAccountEvent(id: string): Promise<void> {
  const { error } = await supabase
    .from('account_events')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// ────────────────────────────────────────────
// CSV 업로드 미리보기 (parse-account-csv Edge Function)
// ────────────────────────────────────────────

export async function parseAccountCsv(
  file: { uri: string; name: string; type: string },
  broker?: string,
): Promise<CsvPreviewResult> {
  const formData = new FormData();
  formData.append('file', {
    uri: file.uri,
    name: file.name,
    type: file.type,
  } as unknown as Blob);

  if (broker) {
    formData.append('broker', broker);
  }

  const { data, error } = await supabase.functions.invoke('parse-account-csv', {
    body: formData,
  });

  if (error) throw error;
  return data as CsvPreviewResult;
}

// ────────────────────────────────────────────
// CSV 파싱 결과 확정 저장 (confirm-account-csv Edge Function)
// ────────────────────────────────────────────

export async function confirmAccountCsv(
  events: CsvPreviewResult['preview'],
): Promise<CsvConfirmResult> {
  const { data, error } = await supabase.functions.invoke('confirm-account-csv', {
    body: { events },
  });

  if (error) throw error;
  return data as CsvConfirmResult;
}
