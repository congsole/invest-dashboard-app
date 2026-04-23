-- [003] 매매 이벤트 & 예수금 DB 마이그레이션

-- ────────────────────────────────────────────
-- trade_events 테이블
-- ────────────────────────────────────────────

create table if not exists public.trade_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  asset_type text not null check (asset_type in ('korean_stock', 'us_stock', 'crypto')),
  trade_type text not null check (trade_type in ('buy', 'sell')),
  ticker text not null,
  name text not null,
  trade_date date not null,
  quantity numeric not null check (quantity > 0),
  price_per_unit numeric not null check (price_per_unit >= 0),
  currency text not null,
  fee numeric not null default 0 check (fee >= 0),
  fee_currency text not null default 'KRW',
  tax numeric not null default 0 check (tax >= 0),
  settlement_amount numeric not null,
  created_at timestamptz not null default now()
);

-- 인덱스 (존재하지 않을 때만 생성)
create index if not exists idx_trade_events_user_id on public.trade_events(user_id);
create index if not exists idx_trade_events_user_id_trade_date on public.trade_events(user_id, trade_date);
create index if not exists idx_trade_events_user_id_ticker on public.trade_events(user_id, ticker);
create index if not exists idx_trade_events_user_id_asset_type on public.trade_events(user_id, asset_type);

-- RLS 활성화
alter table public.trade_events enable row level security;

-- RLS 정책: 본인 데이터만 SELECT
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'trade_events'
      and policyname = 'trade_events_select_own'
  ) then
    create policy "trade_events_select_own"
      on public.trade_events for select
      using (auth.uid() = user_id);
  end if;
end $$;

-- RLS 정책: 본인 user_id로만 INSERT
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'trade_events'
      and policyname = 'trade_events_insert_own'
  ) then
    create policy "trade_events_insert_own"
      on public.trade_events for insert
      with check (auth.uid() = user_id);
  end if;
end $$;

-- RLS 정책: 본인 데이터만 UPDATE
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'trade_events'
      and policyname = 'trade_events_update_own'
  ) then
    create policy "trade_events_update_own"
      on public.trade_events for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

-- RLS 정책: 본인 데이터만 DELETE
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'trade_events'
      and policyname = 'trade_events_delete_own'
  ) then
    create policy "trade_events_delete_own"
      on public.trade_events for delete
      using (auth.uid() = user_id);
  end if;
end $$;

-- ────────────────────────────────────────────
-- cash_balances 테이블
-- ────────────────────────────────────────────

create table if not exists public.cash_balances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  balance numeric not null,
  currency text not null check (currency in ('KRW', 'USD')),
  recorded_at timestamptz not null default now()
);

-- 인덱스 (존재하지 않을 때만 생성)
create index if not exists idx_cash_balances_user_id on public.cash_balances(user_id);
create index if not exists idx_cash_balances_user_id_currency_recorded_at on public.cash_balances(user_id, currency, recorded_at desc);

-- RLS 활성화
alter table public.cash_balances enable row level security;

-- RLS 정책: 본인 데이터만 SELECT
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'cash_balances'
      and policyname = 'cash_balances_select_own'
  ) then
    create policy "cash_balances_select_own"
      on public.cash_balances for select
      using (auth.uid() = user_id);
  end if;
end $$;

-- RLS 정책: 본인 user_id로만 INSERT
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'cash_balances'
      and policyname = 'cash_balances_insert_own'
  ) then
    create policy "cash_balances_insert_own"
      on public.cash_balances for insert
      with check (auth.uid() = user_id);
  end if;
end $$;

-- RLS 정책: 본인 데이터만 UPDATE
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'cash_balances'
      and policyname = 'cash_balances_update_own'
  ) then
    create policy "cash_balances_update_own"
      on public.cash_balances for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

-- RLS 정책: 본인 데이터만 DELETE
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'cash_balances'
      and policyname = 'cash_balances_delete_own'
  ) then
    create policy "cash_balances_delete_own"
      on public.cash_balances for delete
      using (auth.uid() = user_id);
  end if;
end $$;
