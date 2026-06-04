-- [014] 메모 필터 기능 수정 — 구 list_memos 함수 DROP
-- CREATE OR REPLACE는 시그니처(파라미터명/타입) 변경 시 기존 함수를 교체하지 못함
-- 구 시그니처(p_stock_id, p_sector_id, p_include_trade_events)를 명시적으로 DROP하여 제거

drop function if exists public.list_memos(
  date,        -- p_from
  date,        -- p_to
  uuid,        -- p_stock_id
  boolean,     -- p_include_trade_events
  boolean,     -- p_trade_events_only
  boolean,     -- p_news_only
  int,         -- p_sector_id
  boolean,     -- p_no_links
  int,         -- p_limit
  int          -- p_offset
);
