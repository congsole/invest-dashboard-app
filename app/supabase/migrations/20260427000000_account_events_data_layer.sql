-- [007] AccountEvents 데이터 레이어 구축
-- trade_events → account_events 교체, cash_balances 제거,
-- daily_snapshots / corporate_actions / prices / fx_rates 신규 추가

-- ────────────────────────────────────────────
-- 기존 테이블 및 함수 제거
-- ────────────────────────────────────────────

-- 이전 RPC 함수 제거 (반환 타입 변경 시 replace 불가)
drop function if exists public.get_portfolio_summary(text);
drop function if exists public.get_asset_history(text, text);
drop function if exists public.get_sector_allocation();

-- trade_events, cash_balances 테이블 제거 (이전 이슈 003에서 생성)
drop table if exists public.cash_balances;
drop table if exists public.trade_events;

-- ────────────────────────────────────────────
-- account_events 테이블
-- ────────────────────────────────────────────

create table if not exists public.account_events (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references auth.users(id) on delete cascade,
  event_type       text        not null check (event_type in ('buy', 'sell', 'deposit', 'withdraw', 'dividend')),
  event_date       date        not null,
  asset_type       text        check (asset_type in ('korean_stock', 'us_stock', 'crypto', 'cash') or asset_type is null),
  ticker           text,
  name             text,
  quantity         numeric     check (quantity is null or quantity > 0),
  price_per_unit   numeric     check (price_per_unit is null or price_per_unit >= 0),
  currency         text        not null,
  fee              numeric     not null default 0 check (fee >= 0),
  fee_currency     text,
  tax              numeric     not null default 0 check (tax >= 0),
  amount           numeric     not null,
  fx_rate_at_event numeric     check (fx_rate_at_event is null or fx_rate_at_event > 0),
  source           text        not null check (source in ('csv', 'manual')),
  external_ref     text,
  created_at       timestamptz not null default now()
);

-- 인덱스
create index if not exists idx_account_events_user_id
  on public.account_events(user_id);
create index if not exists idx_account_events_user_id_event_date
  on public.account_events(user_id, event_date);
create index if not exists idx_account_events_user_id_ticker
  on public.account_events(user_id, ticker);
create index if not exists idx_account_events_user_id_asset_type
  on public.account_events(user_id, asset_type);
create index if not exists idx_account_events_user_id_external_ref
  on public.account_events(user_id, external_ref)
  where external_ref is not null;

-- RLS 활성화
alter table public.account_events enable row level security;

-- RLS 정책
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'account_events' and policyname = 'account_events_select_own'
  ) then
    create policy "account_events_select_own"
      on public.account_events for select
      using (auth.uid() = user_id);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'account_events' and policyname = 'account_events_insert_own'
  ) then
    create policy "account_events_insert_own"
      on public.account_events for insert
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'account_events' and policyname = 'account_events_update_own'
  ) then
    create policy "account_events_update_own"
      on public.account_events for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'account_events' and policyname = 'account_events_delete_own'
  ) then
    create policy "account_events_delete_own"
      on public.account_events for delete
      using (auth.uid() = user_id);
  end if;
end $$;

-- ────────────────────────────────────────────
-- daily_snapshots 테이블
-- ────────────────────────────────────────────

create table if not exists public.daily_snapshots (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users(id) on delete cascade,
  snapshot_date   date        not null,
  total_value_krw numeric     not null,
  principal_krw   numeric     not null,
  cash_krw        numeric     not null,
  cash_usd        numeric     not null,
  net_profit_krw  numeric     not null,
  fx_rate_usd     numeric     not null check (fx_rate_usd > 0),
  created_at      timestamptz not null default now(),
  constraint uq_daily_snapshots_user_id_snapshot_date unique (user_id, snapshot_date)
);

-- 인덱스
create index if not exists idx_daily_snapshots_user_id_snapshot_date
  on public.daily_snapshots(user_id, snapshot_date desc);

-- RLS 활성화
alter table public.daily_snapshots enable row level security;

-- RLS 정책
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'daily_snapshots' and policyname = 'daily_snapshots_select_own'
  ) then
    create policy "daily_snapshots_select_own"
      on public.daily_snapshots for select
      using (auth.uid() = user_id);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'daily_snapshots' and policyname = 'daily_snapshots_insert_own'
  ) then
    create policy "daily_snapshots_insert_own"
      on public.daily_snapshots for insert
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'daily_snapshots' and policyname = 'daily_snapshots_update_own'
  ) then
    create policy "daily_snapshots_update_own"
      on public.daily_snapshots for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

-- ────────────────────────────────────────────
-- corporate_actions 테이블
-- ────────────────────────────────────────────

create table if not exists public.corporate_actions (
  id             uuid        primary key default gen_random_uuid(),
  ticker         text        not null,
  asset_type     text        not null check (asset_type in ('korean_stock', 'us_stock')),
  action_type    text        not null check (action_type in ('split', 'reverse_split', 'dividend_stock', 'merger')),
  effective_date date        not null,
  ratio          numeric     not null check (ratio > 0),
  metadata       jsonb,
  created_at     timestamptz not null default now()
);

-- 인덱스
create index if not exists idx_corporate_actions_ticker_asset_type
  on public.corporate_actions(ticker, asset_type);
create index if not exists idx_corporate_actions_ticker_effective_date
  on public.corporate_actions(ticker, effective_date);

-- RLS 활성화
alter table public.corporate_actions enable row level security;

-- RLS 정책: 모든 인증 사용자 SELECT 공개
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'corporate_actions' and policyname = 'corporate_actions_select_all'
  ) then
    create policy "corporate_actions_select_all"
      on public.corporate_actions for select
      using (auth.role() = 'authenticated');
  end if;
end $$;

-- INSERT/UPDATE/DELETE: service_role만 허용 (일반 사용자 차단 — RLS에 정책 없으면 기본 deny)

-- ────────────────────────────────────────────
-- prices 테이블
-- ────────────────────────────────────────────

create table if not exists public.prices (
  ticker      text        not null,
  asset_type  text        not null check (asset_type in ('korean_stock', 'us_stock', 'crypto')),
  date        date        not null,
  close       numeric     not null check (close >= 0),
  currency    text        not null,
  updated_at  timestamptz not null default now(),
  constraint pk_prices primary key (ticker, asset_type, date)
);

-- RLS 활성화
alter table public.prices enable row level security;

-- RLS 정책: 모든 인증 사용자 SELECT 공개
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'prices' and policyname = 'prices_select_all'
  ) then
    create policy "prices_select_all"
      on public.prices for select
      using (auth.role() = 'authenticated');
  end if;
end $$;

-- INSERT/UPDATE: service_role만 허용 (RLS에 정책 없으면 기본 deny)

-- ────────────────────────────────────────────
-- fx_rates 테이블
-- ────────────────────────────────────────────

create table if not exists public.fx_rates (
  date       date        primary key,
  usd_krw    numeric     not null check (usd_krw > 0),
  updated_at timestamptz not null default now()
);

-- RLS 활성화
alter table public.fx_rates enable row level security;

-- RLS 정책: 모든 인증 사용자 SELECT 공개
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'fx_rates' and policyname = 'fx_rates_select_all'
  ) then
    create policy "fx_rates_select_all"
      on public.fx_rates for select
      using (auth.role() = 'authenticated');
  end if;
end $$;

-- INSERT/UPDATE: service_role만 허용 (RLS에 정책 없으면 기본 deny)
