/**
 * memo.ts — 메모 / Sector / Stock 서비스 함수
 *
 * API 명세 참조: docs/api/api-spec.md — Memo / Sector / Stock 섹션
 * 이슈 011: 메모 화면 UI
 * [012] stocks 재설계 반영: asset_type → market, currency/is_active 추가
 */

import { supabase } from '../utils/supabase';
import {
  Sector,
  Stock,
  MemoItem,
  MemoDetail,
  ListMemosResult,
  ListMemosParams,
  CreateMemoInput,
  UpdateMemoInput,
} from '../types/memo';

// ────────────────────────────────────────────
// Sector
// ────────────────────────────────────────────

export async function getSectors(): Promise<Sector[]> {
  const { data, error } = await supabase
    .from('sectors')
    .select('id, code, name, name_en, parent_id, level')
    .order('id', { ascending: true });

  if (error) throw error;
  return (data ?? []) as Sector[];
}

// ────────────────────────────────────────────
// Stock
// ────────────────────────────────────────────

export async function getStock(
  ticker: string,
  market: 'KR' | 'US' | 'CRYPTO',
): Promise<Stock | null> {
  const { data, error } = await supabase
    .from('stocks')
    .select('*, sectors(id, code, name, name_en, parent_id, level)')
    .eq('ticker', ticker)
    .eq('market', market)
    .maybeSingle();

  if (error) throw error;
  return data as Stock | null;
}

export async function searchStocks(query: string): Promise<Stock[]> {
  const { data, error } = await supabase
    .from('stocks')
    .select('*, sectors(id, code, name, name_en, parent_id, level)')
    .or(`ticker.ilike.%${query}%,name.ilike.%${query}%`)
    .eq('is_active', true)
    .order('name', { ascending: true })
    .limit(20);

  if (error) throw error;
  return (data ?? []) as Stock[];
}

// ────────────────────────────────────────────
// Memo — 목록 조회 (list_memos RPC)
// ────────────────────────────────────────────

export async function listMemos(
  params: ListMemosParams = {},
): Promise<ListMemosResult> {
  const { data, error } = await supabase.rpc('list_memos', {
    p_from: params.p_from ?? null,
    p_to: params.p_to ?? null,
    p_stock_ids: params.p_stock_ids ?? null,
    p_trade_events_only: params.p_trade_events_only ?? false,
    p_news_only: params.p_news_only ?? false,
    p_sector_ids: params.p_sector_ids ?? null,
    p_no_links: params.p_no_links ?? false,
    p_limit: params.p_limit ?? 20,
    p_offset: params.p_offset ?? 0,
  });

  if (error) throw error;
  return data as ListMemosResult;
}

// ────────────────────────────────────────────
// Memo — 상세 조회
// ────────────────────────────────────────────

export async function getMemo(memoId: string): Promise<MemoDetail> {
  const { data, error } = await supabase
    .from('memos')
    .select(
      '*, memo_stocks(stock_id, goal_price, stocks(id, ticker, name, market, currency, is_active)), memo_trade_events(event_id, account_events(id, event_type, event_date, ticker, name)), memo_news(news_id), memo_sectors(sector_id, sectors(id, code, name, level))',
    )
    .eq('id', memoId)
    .single();

  if (error) throw error;
  return data as MemoDetail;
}

// ────────────────────────────────────────────
// Memo — 생성 (create_memo_with_links RPC)
// ────────────────────────────────────────────

export async function createMemo(input: CreateMemoInput): Promise<MemoItem> {
  const { data, error } = await supabase.rpc('create_memo_with_links', {
    p_body: input.p_body,
    p_stocks: input.p_stocks ?? [],
    p_trade_event_ids: input.p_trade_event_ids ?? [],
    p_news_ids: input.p_news_ids ?? [],
    p_sector_ids: input.p_sector_ids ?? [],
  });

  if (error) throw error;
  return data as MemoItem;
}

// ────────────────────────────────────────────
// Memo — 수정 (update_memo_with_links RPC)
// ────────────────────────────────────────────

export async function updateMemo(input: UpdateMemoInput): Promise<MemoItem> {
  const { data, error } = await supabase.rpc('update_memo_with_links', {
    p_memo_id: input.p_memo_id,
    p_body: input.p_body ?? null,
    p_stocks: input.p_stocks ?? null,
    p_trade_event_ids: input.p_trade_event_ids ?? null,
    p_news_ids: input.p_news_ids ?? null,
    p_sector_ids: input.p_sector_ids ?? null,
  });

  if (error) throw error;
  return data as MemoItem;
}

// ────────────────────────────────────────────
// Memo — 삭제
// ────────────────────────────────────────────

export async function deleteMemo(memoId: string): Promise<void> {
  const { error } = await supabase
    .from('memos')
    .delete()
    .eq('id', memoId);

  if (error) throw error;
}

// ────────────────────────────────────────────
// 매매이벤트 + 메모 동시 생성 (create_trade_event_with_memo RPC)
// ────────────────────────────────────────────

export interface TradeEventWithMemoInput {
  p_event: {
    event_type: 'buy' | 'sell';
    event_date: string;
    asset_type: 'korean_stock' | 'us_stock' | 'crypto';
    ticker: string;
    name: string;
    quantity: number;
    price_per_unit: number;
    currency: string;
    fee?: number;
    fee_currency?: string;
    tax?: number;
    amount: number;
    source: 'manual';
  };
  p_memo_body: string | null;
  p_goal_price: number | null;
}

export interface TradeEventWithMemoResult {
  event: {
    id: string;
    event_type: 'buy' | 'sell';
    event_date: string;
    ticker: string;
    name: string;
    quantity: number;
    price_per_unit: number;
    currency: string;
    fee: number;
    tax: number;
    amount: number;
    created_at: string;
  };
  memo: {
    id: string;
    body: string;
    created_at: string;
    linked_stock_id: string | null;
    linked_event_id: string;
    goal_price: number | null;
  } | null;
}

export async function createTradeEventWithMemo(
  input: TradeEventWithMemoInput,
): Promise<TradeEventWithMemoResult> {
  const { data, error } = await supabase.rpc('create_trade_event_with_memo', {
    p_event: input.p_event,
    p_memo_body: input.p_memo_body,
    p_goal_price: input.p_goal_price,
  });

  if (error) throw error;
  return data as TradeEventWithMemoResult;
}

// ────────────────────────────────────────────
// 메모 엔티티 연결 추가 (단건)
// ────────────────────────────────────────────

export async function linkMemoStock(
  memoId: string,
  stockId: string,
  goalPrice: number | null = null,
): Promise<void> {
  const { error } = await supabase
    .from('memo_stocks')
    .insert({ memo_id: memoId, stock_id: stockId, goal_price: goalPrice });

  if (error) throw error;
}

export async function linkMemoTradeEvent(
  memoId: string,
  eventId: string,
): Promise<void> {
  const { error } = await supabase
    .from('memo_trade_events')
    .insert({ memo_id: memoId, event_id: eventId });

  if (error) throw error;
}

export async function linkMemoNews(memoId: string, newsId: string): Promise<void> {
  const { error } = await supabase
    .from('memo_news')
    .insert({ memo_id: memoId, news_id: newsId });

  if (error) throw error;
}

export async function linkMemoSector(memoId: string, sectorId: number): Promise<void> {
  const { error } = await supabase
    .from('memo_sectors')
    .insert({ memo_id: memoId, sector_id: sectorId });

  if (error) throw error;
}

// ────────────────────────────────────────────
// 메모 엔티티 연결 해제 (단건)
// ────────────────────────────────────────────

export async function unlinkMemoStock(memoId: string, stockId: string): Promise<void> {
  const { error } = await supabase
    .from('memo_stocks')
    .delete()
    .eq('memo_id', memoId)
    .eq('stock_id', stockId);

  if (error) throw error;
}

export async function unlinkMemoTradeEvent(
  memoId: string,
  eventId: string,
): Promise<void> {
  const { error } = await supabase
    .from('memo_trade_events')
    .delete()
    .eq('memo_id', memoId)
    .eq('event_id', eventId);

  if (error) throw error;
}

export async function unlinkMemoNews(memoId: string, newsId: string): Promise<void> {
  const { error } = await supabase
    .from('memo_news')
    .delete()
    .eq('memo_id', memoId)
    .eq('news_id', newsId);

  if (error) throw error;
}

export async function unlinkMemoSector(memoId: string, sectorId: number): Promise<void> {
  const { error } = await supabase
    .from('memo_sectors')
    .delete()
    .eq('memo_id', memoId)
    .eq('sector_id', sectorId);

  if (error) throw error;
}

// ────────────────────────────────────────────
// 종목 등록 또는 조회 + 섹터 자동 추천 (RPC)
// [012] get_or_recommend_stock_sector RPC로 변경
// [016] p_naver_industry → p_yfinance_sector/p_yfinance_industry 변경
// ────────────────────────────────────────────

export interface GetOrRecommendStockInput {
  p_ticker: string;
  p_market: 'KR' | 'US' | 'CRYPTO';
  p_name: string;
  p_currency: string;
  /** yfinance sector 반환값 (예: "Technology"). L1 추천에 사용. */
  p_yfinance_sector?: string | null;
  /** yfinance industry 반환값 (예: "Semiconductor Manufacturing"). L4 추천에 사용. */
  p_yfinance_industry?: string | null;
}

export interface GetOrRecommendStockResult {
  id: string;
  ticker: string;
  name: string;
  market: 'KR' | 'US' | 'CRYPTO';
  currency: string;
  is_active: boolean;
  sector_id: number | null;
  recommended_sector: {
    id: number;
    code: string;
    name: string;
    name_en: string | null;
    level: number;
  } | null;
  is_new: boolean;
  created_at: string;
}

export async function getOrRecommendStockSector(
  input: GetOrRecommendStockInput,
): Promise<GetOrRecommendStockResult> {
  const { data, error } = await supabase.rpc('get_or_recommend_stock_sector', {
    p_ticker:            input.p_ticker,
    p_market:            input.p_market,
    p_name:              input.p_name,
    p_currency:          input.p_currency,
    p_yfinance_sector:   input.p_yfinance_sector ?? null,
    p_yfinance_industry: input.p_yfinance_industry ?? null,
  });

  if (error) throw error;
  return data as GetOrRecommendStockResult;
}
