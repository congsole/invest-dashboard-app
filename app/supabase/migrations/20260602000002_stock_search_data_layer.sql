-- [012] 종목 검색 — 데이터/API 레이어
--
-- stocks 테이블을 공개 마스터로 재설계:
--   - asset_type 제거 → market(KR/US/CRYPTO), currency, is_active 추가
--   - UNIQUE 제약 (ticker, asset_type) → (ticker, market)
--   - 인덱스 변경 및 idx_stocks_name 추가
--   - RLS 쓰기 정책: 인증 사용자 허용 → service_role 전용
--
-- 기존 stocks 테이블이 이슈 009 마이그레이션에서 생성됨.

-- ────────────────────────────────────────────
-- 1. stocks 테이블 컬럼 변경
-- ────────────────────────────────────────────

-- asset_type 컬럼 제거 (기존 CHECK 제약 포함)
alter table stocks drop column if exists asset_type;

-- market 컬럼 추가 (KR / US / CRYPTO)
alter table stocks
  add column if not exists market text not null default 'KR'
  check (market in ('KR', 'US', 'CRYPTO'));

-- DEFAULT 제거 (마이그레이션용 임시 기본값이므로)
alter table stocks alter column market drop default;

-- currency 컬럼 추가
alter table stocks
  add column if not exists currency text not null default 'KRW';

alter table stocks alter column currency drop default;

-- is_active 컬럼 추가
alter table stocks
  add column if not exists is_active boolean not null default true;

-- ────────────────────────────────────────────
-- 2. UNIQUE 제약 변경
--    (ticker, asset_type) → (ticker, market)
-- ────────────────────────────────────────────

-- 기존 UNIQUE 제약 제거
alter table stocks
  drop constraint if exists uq_stocks_ticker_asset_type;

-- 신규 UNIQUE 제약 추가
alter table stocks
  add constraint uq_stocks_ticker_market unique (ticker, market);

-- ────────────────────────────────────────────
-- 3. 인덱스 변경
-- ────────────────────────────────────────────

-- 기존 인덱스 제거
drop index if exists idx_stocks_ticker_asset_type;

-- 신규 인덱스: ticker + market 조합 조회
create index if not exists idx_stocks_ticker_market on stocks (ticker, market);

-- 신규 인덱스: 종목명 ilike 검색 지원
create index if not exists idx_stocks_name on stocks (name);

-- sector_id 인덱스는 기존 유지
-- create index if not exists idx_stocks_sector_id on stocks (sector_id);  -- 이미 존재

-- ────────────────────────────────────────────
-- 4. RLS 쓰기 정책 변경
--    인증 사용자 허용 → service_role 전용
-- ────────────────────────────────────────────

-- 기존 쓰기 정책 제거
drop policy if exists "stocks_insert_authenticated" on stocks;
drop policy if exists "stocks_update_authenticated" on stocks;

-- service_role은 RLS를 자동 우회하므로 별도 쓰기 정책 불필요.
-- authenticated 역할에 INSERT/UPDATE 정책을 부여하지 않으면 차단됨.
-- SELECT 정책은 기존 "stocks_select_authenticated" 유지.

-- ────────────────────────────────────────────
-- 5. get_or_recommend_stock_sector DB Function
--    (기존 upsert_stock_with_sector 대체)
--
--    NOTE: 이 함수는 stocks 읽기 전용 RPC.
--    실제 upsert는 FastAPI(service_role)가 수행.
--    함수는 종목 조회 + 섹터 자동 추천 결과만 반환.
-- ────────────────────────────────────────────

create or replace function get_or_recommend_stock_sector(
  p_ticker          text,
  p_market          text,
  p_name            text,
  p_currency        text,
  p_naver_industry  text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stock_id        uuid;
  v_sector_id       int;
  v_sector_code     text;
  v_sector_name     text;
  v_stock_name      text;
  v_currency        text;
  v_is_active       boolean;
  v_is_new          boolean := false;
  v_created_at      timestamptz;
  v_rec_sector_id   int;
  v_rec_sector_code text;
  v_rec_sector_name text;
begin
  -- 인증 확인
  if auth.uid() is null then
    raise exception 'authentication required'
      using errcode = 'insufficient_privilege';
  end if;

  -- market 유효성 검사
  if p_market not in ('KR', 'US', 'CRYPTO') then
    raise exception 'invalid market: %', p_market
      using errcode = 'check_violation';
  end if;

  -- 기존 종목 조회
  select id, sector_id, name, currency, is_active, created_at
    into v_stock_id, v_sector_id, v_stock_name, v_currency, v_is_active, v_created_at
    from stocks
   where ticker = p_ticker
     and market = p_market;

  if v_stock_id is null then
    -- 신규 등록이 필요한 경우: is_new = true, 섹터만 추천하여 반환
    -- (실제 INSERT는 FastAPI service_role 경유)
    v_is_new     := true;
    v_stock_name := p_name;
    v_currency   := p_currency;
    v_is_active  := true;
    v_created_at := now();
  end if;

  -- 섹터 자동 추천 (신규/기존 모두 추천 결과 반환)
  if p_market = 'CRYPTO' then
    select id into v_rec_sector_id from sectors where code = 'CRYPTO';

  elsif p_market = 'KR' then
    if p_naver_industry is not null then
      select sector_id into v_rec_sector_id
        from kr_sector_map
       where naver_industry = p_naver_industry;
    end if;
    -- 매핑 없으면 null (미분류)

  elsif p_market = 'US' then
    -- 클라이언트가 p_naver_industry에 GICS code 전달 시 매핑
    if p_naver_industry is not null then
      select id into v_rec_sector_id
        from sectors
       where code = p_naver_industry;
    end if;
  end if;

  -- 기존 종목에 sector_id가 없고 추천 가능하면 추천 섹터 사용
  if v_sector_id is null then
    v_sector_id := v_rec_sector_id;
  end if;

  -- 기존(또는 확정) 섹터 정보 조회
  if v_sector_id is not null then
    select code, name into v_sector_code, v_sector_name
      from sectors
     where id = v_sector_id;
  end if;

  -- 추천 섹터 정보 조회
  -- v_rec_sector_id가 v_sector_id와 동일하면 이미 조회된 값을 재사용,
  -- 다른 경우(기존 종목에 별도 섹터가 있을 때)는 별도 조회한다.
  if v_rec_sector_id is not null then
    if v_rec_sector_id = v_sector_id then
      v_rec_sector_code := v_sector_code;
      v_rec_sector_name := v_sector_name;
    else
      select code, name into v_rec_sector_code, v_rec_sector_name
        from sectors
       where id = v_rec_sector_id;
    end if;
  end if;

  return json_build_object(
    'id',           coalesce(v_stock_id, gen_random_uuid()),
    'ticker',       p_ticker,
    'name',         v_stock_name,
    'market',       p_market,
    'currency',     v_currency,
    'is_active',    v_is_active,
    'sector_id',    v_sector_id,
    'recommended_sector',
      case when v_rec_sector_id is not null then
        json_build_object(
          'id',   v_rec_sector_id,
          'code', v_rec_sector_code,
          'name', v_rec_sector_name
        )
      else null end,
    'is_new',       v_is_new,
    'created_at',   v_created_at
  );
end;
$$;
