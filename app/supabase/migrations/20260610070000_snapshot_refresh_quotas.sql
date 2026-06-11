-- [026] 당일 스냅샷 수동 새로고침 — 데이터/API 레이어

-- ────────────────────────────────────────────
-- 1. snapshot_refresh_quotas 테이블
-- ────────────────────────────────────────────

create table if not exists public.snapshot_refresh_quotas (
  user_id          uuid        not null references auth.users(id) on delete cascade,
  quota_date       date        not null,
  used_count       int         not null default 0
                               check (used_count >= 0 and used_count <= 3),
  last_refreshed_at timestamptz,
  constraint pk_snapshot_refresh_quotas primary key (user_id, quota_date)
);

-- 인덱스 (복합 PK 와 별도로 정렬 최적화)
create index if not exists idx_snapshot_refresh_quotas_user_id_quota_date
  on public.snapshot_refresh_quotas(user_id, quota_date desc);

-- RLS 활성화
alter table public.snapshot_refresh_quotas enable row level security;

-- RLS 정책: SELECT — 본인 조회만 허용
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'snapshot_refresh_quotas'
      and policyname = 'snapshot_refresh_quotas_select_own'
  ) then
    create policy "snapshot_refresh_quotas_select_own"
      on public.snapshot_refresh_quotas for select
      using (auth.uid() = user_id);
  end if;
end $$;

-- RLS 정책: INSERT — service_role 전용
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'snapshot_refresh_quotas'
      and policyname = 'snapshot_refresh_quotas_insert_service_role'
  ) then
    create policy "snapshot_refresh_quotas_insert_service_role"
      on public.snapshot_refresh_quotas for insert
      with check (auth.role() = 'service_role');
  end if;
end $$;

-- RLS 정책: UPDATE — service_role 전용
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'snapshot_refresh_quotas'
      and policyname = 'snapshot_refresh_quotas_update_service_role'
  ) then
    create policy "snapshot_refresh_quotas_update_service_role"
      on public.snapshot_refresh_quotas for update
      using  (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;
end $$;

-- RLS 정책: DELETE — 허용하지 않음 (날짜별 새 행 삽입 방식으로 자정 리셋)

-- ────────────────────────────────────────────
-- 2. daily_snapshots UPDATE RLS 변경
--    기존: 본인 허용 → 변경: service_role 전용
-- ────────────────────────────────────────────

-- 기존 update 정책 삭제
drop policy if exists "daily_snapshots_update_own" on public.daily_snapshots;

-- 새 정책: service_role 전용
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'daily_snapshots'
      and policyname = 'daily_snapshots_update_service_role'
  ) then
    create policy "daily_snapshots_update_service_role"
      on public.daily_snapshots for update
      using  (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;
end $$;
