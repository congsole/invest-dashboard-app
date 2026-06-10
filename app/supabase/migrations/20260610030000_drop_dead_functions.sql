-- [cleanup] 죽은 함수 제거
--
-- 아래 함수들은 이후 마이그레이션에서 삭제된 테이블/컬럼을 참조하여 호출 시 항상 에러가 난다.
-- 앱(services/)은 어디서도 호출하지 않음을 확인했다 (2026-06-10).
--
--   upsert_stock_with_sector  — kr_sector_map([016]에서 폐기)·stocks.asset_type([012]에서 market으로 개명) 참조.
--                               get_or_recommend_stock_sector로 대체됨.
--   get_holdings              — trade_events([007]에서 account_events로 대체) 참조.
--   get_portfolio_history     — 〃 (구 대시보드 데이터 레이어, 현행은 get_kpi_summary/get_history_markers)
--   get_positions             — 〃
--
-- asset_type enum은 price_cache 테이블이 사용 중이므로 유지한다.

drop function if exists public.upsert_stock_with_sector(p_ticker text, p_asset_type text, p_name text, p_naver_industry text);
drop function if exists public.get_holdings(p_asset_type text);
drop function if exists public.get_portfolio_history(p_user_id uuid, p_period text, p_asset_type asset_type);
drop function if exists public.get_positions(p_user_id uuid, p_asset_type asset_type);
