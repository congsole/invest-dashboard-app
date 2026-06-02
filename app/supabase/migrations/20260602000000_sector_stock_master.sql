-- [009] 섹터 마스터 및 종목 마스터 데이터 레이어

-- ────────────────────────────────────────────
-- sectors 테이블
-- ────────────────────────────────────────────

create table if not exists sectors (
  id   int  primary key,
  code text not null unique,
  name text not null
);

alter table sectors enable row level security;

-- SELECT: 모든 인증 사용자 공개
create policy "sectors_select_authenticated"
  on sectors for select
  to authenticated
  using (true);

-- INSERT/UPDATE/DELETE: service_role만 (고정 시드, 앱에서 수정 불가)
-- service_role은 RLS를 우회하므로 별도 정책 불필요.
-- anon 및 authenticated 역할에 대해 쓰기 정책을 부여하지 않는 것으로 충분.

-- 시드 데이터 (GICS 11 + 가상자산 1 = 12개)
insert into sectors (id, code, name) values
  (1,  'IT',            '정보기술'),
  (2,  'HEALTHCARE',    '헬스케어'),
  (3,  'FINANCIALS',    '금융'),
  (4,  'CONS_DISC',     '경기소비재'),
  (5,  'CONS_STAPLES',  '필수소비재'),
  (6,  'COMM',          '커뮤니케이션서비스'),
  (7,  'INDUSTRIALS',   '산업재'),
  (8,  'MATERIALS',     '소재'),
  (9,  'ENERGY',        '에너지'),
  (10, 'UTILITIES',     '유틸리티'),
  (11, 'REAL_ESTATE',   '부동산'),
  (12, 'CRYPTO',        '가상자산')
on conflict (id) do nothing;

-- ────────────────────────────────────────────
-- stocks 테이블
-- ────────────────────────────────────────────

create table if not exists stocks (
  id         uuid        primary key default gen_random_uuid(),
  ticker     text        not null,
  asset_type text        not null check (asset_type in ('korean_stock', 'us_stock', 'crypto')),
  name       text        not null,
  sector_id  int         references sectors(id),
  created_at timestamptz not null default now(),
  constraint uq_stocks_ticker_asset_type unique (ticker, asset_type)
);

alter table stocks enable row level security;

-- SELECT: 모든 인증 사용자 공개
create policy "stocks_select_authenticated"
  on stocks for select
  to authenticated
  using (true);

-- INSERT: 인증 사용자 허용
create policy "stocks_insert_authenticated"
  on stocks for insert
  to authenticated
  with check (true);

-- UPDATE: 인증 사용자 허용 (sector_id 수동 보정 포함)
create policy "stocks_update_authenticated"
  on stocks for update
  to authenticated
  using (true)
  with check (true);

-- DELETE: service_role만 (별도 정책 불필요 — authenticated에 부여 안 함)

-- 인덱스
create index if not exists idx_stocks_ticker_asset_type on stocks (ticker, asset_type);
create index if not exists idx_stocks_sector_id         on stocks (sector_id);

-- ────────────────────────────────────────────
-- kr_sector_map 테이블
-- ────────────────────────────────────────────

create table if not exists kr_sector_map (
  naver_industry text primary key,
  sector_id      int  not null references sectors(id)
);

alter table kr_sector_map enable row level security;

-- SELECT: 모든 인증 사용자 공개
create policy "kr_sector_map_select_authenticated"
  on kr_sector_map for select
  to authenticated
  using (true);

-- INSERT/UPDATE/DELETE: service_role만 (별도 정책 불필요)

-- 초기 시드 (보유·관심 종목 업종 위주)
insert into kr_sector_map (naver_industry, sector_id) values
  ('반도체',                    1),   -- IT
  ('소프트웨어',                 1),   -- IT
  ('IT서비스',                  1),   -- IT
  ('전자부품',                  1),   -- IT
  ('디스플레이',                 1),   -- IT
  ('인터넷',                    1),   -- IT
  ('제약',                      2),   -- HEALTHCARE
  ('바이오',                    2),   -- HEALTHCARE
  ('의료기기',                  2),   -- HEALTHCARE
  ('헬스케어',                  2),   -- HEALTHCARE
  ('은행',                      3),   -- FINANCIALS
  ('증권',                      3),   -- FINANCIALS
  ('보험',                      3),   -- FINANCIALS
  ('카드',                      3),   -- FINANCIALS
  ('자동차',                    4),   -- CONS_DISC
  ('의류',                      4),   -- CONS_DISC
  ('유통',                      4),   -- CONS_DISC
  ('호텔/레져',                 4),   -- CONS_DISC
  ('미디어/엔터',               4),   -- CONS_DISC
  ('화장품/의류',               5),   -- CONS_STAPLES
  ('식료품',                    5),   -- CONS_STAPLES
  ('생활용품',                  5),   -- CONS_STAPLES
  ('음식료',                    5),   -- CONS_STAPLES
  ('통신',                      6),   -- COMM
  ('방송',                      6),   -- COMM
  ('기계',                      7),   -- INDUSTRIALS
  ('조선',                      7),   -- INDUSTRIALS
  ('운송',                      7),   -- INDUSTRIALS
  ('항공',                      7),   -- INDUSTRIALS
  ('건설',                      7),   -- INDUSTRIALS
  ('화학',                      8),   -- MATERIALS
  ('철강',                      8),   -- MATERIALS
  ('비철금속',                  8),   -- MATERIALS
  ('에너지',                    9),   -- ENERGY
  ('정유',                      9),   -- ENERGY
  ('전기',                     10),   -- UTILITIES
  ('가스',                     10),   -- UTILITIES
  ('부동산',                   11),   -- REAL_ESTATE
  ('리츠',                     11)    -- REAL_ESTATE
on conflict (naver_industry) do nothing;

-- ────────────────────────────────────────────
-- upsert_stock_with_sector DB Function
-- 종목 등록 + 섹터 자동 추천
-- ────────────────────────────────────────────

create or replace function upsert_stock_with_sector(
  p_ticker       text,
  p_asset_type   text,
  p_name         text,
  p_naver_industry text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stock_id      uuid;
  v_sector_id     int;
  v_sector_code   text;
  v_sector_name   text;
  v_stock_name    text;
  v_is_new        boolean := false;
  v_created_at    timestamptz;
begin
  -- 인증 확인: 비인증 사용자 차단
  if auth.uid() is null then
    raise exception 'authentication required'
      using errcode = 'insufficient_privilege';
  end if;

  -- asset_type 유효성 검사
  if p_asset_type not in ('korean_stock', 'us_stock', 'crypto') then
    raise exception 'invalid asset_type: %', p_asset_type
      using errcode = 'check_violation';
  end if;

  -- 기존 종목 조회
  select id, sector_id, name, created_at
    into v_stock_id, v_sector_id, v_stock_name, v_created_at
    from stocks
   where ticker = p_ticker
     and asset_type = p_asset_type;

  if v_stock_id is null then
    -- 신규 등록: 섹터 자동 추천
    if p_asset_type = 'crypto' then
      -- 암호화폐: CRYPTO 고정
      select id into v_sector_id from sectors where code = 'CRYPTO';

    elsif p_asset_type = 'korean_stock' then
      -- 한국 주식: kr_sector_map 변환
      if p_naver_industry is not null then
        select sector_id into v_sector_id
          from kr_sector_map
         where naver_industry = p_naver_industry;
      end if;
      -- 매핑 없으면 null (미분류)

    elsif p_asset_type = 'us_stock' then
      -- 미국 주식: 섹터 추천 없음 (Yahoo Finance 데이터는 외부 API 의존, DB Function 내에서 처리 불가)
      -- 클라이언트가 p_naver_industry를 us_stock에서도 GICS 코드로 전달하면 매핑 시도
      if p_naver_industry is not null then
        select id into v_sector_id
          from sectors
         where code = p_naver_industry;
      end if;
    end if;

    -- INSERT
    insert into stocks (ticker, asset_type, name, sector_id)
    values (p_ticker, p_asset_type, p_name, v_sector_id)
    returning id, created_at into v_stock_id, v_created_at;

    v_stock_name := p_name;
    v_is_new := true;
  end if;

  -- 추천 섹터 정보 조회
  if v_sector_id is not null then
    select code, name into v_sector_code, v_sector_name
      from sectors
     where id = v_sector_id;
  end if;

  return json_build_object(
    'id',           v_stock_id,
    'ticker',       p_ticker,
    'asset_type',   p_asset_type,
    'name',         v_stock_name,
    'sector_id',    v_sector_id,
    'recommended_sector',
      case when v_sector_id is not null then
        json_build_object(
          'id',   v_sector_id,
          'code', v_sector_code,
          'name', v_sector_name
        )
      else null end,
    'is_new',       v_is_new,
    'created_at',   v_created_at
  );
end;
$$;
