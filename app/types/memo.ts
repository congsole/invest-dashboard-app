// memo.ts — 메모 도메인 공통 타입 정의
// api-spec.md Memo / Sector / Stock 도메인 기반

export interface Sector {
  id: number;
  code: string;
  name: string;
}

export interface Stock {
  id: string;
  ticker: string;
  name: string;
  market: 'KR' | 'US' | 'CRYPTO';
  currency: string;
  sector_id: number | null;
  is_active: boolean;
  sectors: Sector | null;
  created_at: string;
}

// ── 메모 엔티티 연결 타입 ──

export interface MemoStock {
  stock_id: string;
  ticker: string;
  name: string;
  market: 'KR' | 'US' | 'CRYPTO';
  goal_price: number | null;
}

export interface MemoTradeEvent {
  event_id: string;
  event_type: 'buy' | 'sell';
  event_date: string;
  ticker: string | null;
  name: string | null;
}

export interface MemoNews {
  news_id: string;
}

export interface MemoSector {
  sector_id: number;
  code: string;
  name: string;
}

// ── 메모 목록 아이템 ──

export interface MemoItem {
  id: string;
  body: string;
  created_at: string;
  updated_at: string;
  stocks: MemoStock[];
  trade_events: MemoTradeEvent[];
  news: MemoNews[];
  sectors: MemoSector[];
}

// ── 메모 상세 (REST 조회) ──

export interface MemoDetail {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  memo_stocks: Array<{
    stock_id: string;
    goal_price: number | null;
    stocks: {
      id: string;
      ticker: string;
      name: string;
      market: 'KR' | 'US' | 'CRYPTO';
      currency: string;
      is_active: boolean;
    };
  }>;
  memo_trade_events: Array<{
    event_id: string;
    account_events: {
      id: string;
      event_type: 'buy' | 'sell';
      event_date: string;
      ticker: string | null;
      name: string | null;
    };
  }>;
  memo_news: Array<{ news_id: string }>;
  memo_sectors: Array<{
    sector_id: number;
    sectors: {
      id: number;
      code: string;
      name: string;
    };
  }>;
}

// ── list_memos 응답 ──

export interface ListMemosResult {
  memos: MemoItem[];
  total_count: number;
}

// ── 메모 생성/수정 파라미터 ──

export interface MemoStockInput {
  stock_id: string;
  goal_price: number | null;
}

export interface CreateMemoInput {
  p_body: string;
  p_stocks?: MemoStockInput[];
  p_trade_event_ids?: string[];
  p_news_ids?: string[];
  p_sector_ids?: number[];
}

export interface UpdateMemoInput {
  p_memo_id: string;
  p_body?: string | null;
  p_stocks?: MemoStockInput[] | null;
  p_trade_event_ids?: string[] | null;
  p_news_ids?: string[] | null;
  p_sector_ids?: number[] | null;
}

// ── list_memos 파라미터 ──

export interface ListMemosParams {
  p_from?: string | null;
  p_to?: string | null;
  p_stock_id?: string | null;
  p_include_trade_events?: boolean;
  p_trade_events_only?: boolean;
  p_news_only?: boolean;
  p_sector_id?: number | null;
  p_no_links?: boolean;
  p_limit?: number;
  p_offset?: number;
}

// ── 달력형 뷰에서 날짜별 엔티티 타입 점 표시 ──

export type EntityType = 'stock' | 'trade_event' | 'news' | 'sector' | 'none';

export interface DayMemoSummary {
  date: string; // YYYY-MM-DD
  entityTypes: EntityType[]; // 중복 제거, 최대 4개
  memoIds: string[];
}

// ── 필터 상태 ──

export interface MemoFilterState {
  stockId: string | null;
  stockName: string | null;
  includeTradeEvents: boolean;
  tradeEventsOnly: boolean;
  newsOnly: boolean;
  sectorId: number | null;
  sectorName: string | null;
  noLinks: boolean;
}

export const DEFAULT_FILTER_STATE: MemoFilterState = {
  stockId: null,
  stockName: null,
  includeTradeEvents: true,
  tradeEventsOnly: false,
  newsOnly: false,
  sectorId: null,
  sectorName: null,
  noLinks: false,
};

// ── 엔티티 타입별 색상 ──

export const ENTITY_COLORS: Record<EntityType, string> = {
  stock: '#3B82F6',
  trade_event: '#22C55E',
  news: '#8B5CF6',
  sector: '#14B8A6',
  none: '#9CA3AF',
};
