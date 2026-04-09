-- [001] 사용자 인증

-- profiles 테이블 생성
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  nickname text not null check (char_length(nickname) >= 2 and char_length(nickname) <= 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS 활성화
alter table public.profiles enable row level security;

-- RLS 정책: 본인 데이터만 SELECT
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = user_id);

-- RLS 정책: 본인 user_id로만 INSERT
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = user_id);

-- RLS 정책: 본인 데이터만 UPDATE
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 인덱스: user_id 조회용
create index idx_profiles_user_id on public.profiles(user_id);

-- updated_at 자동 갱신 트리거 함수
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- updated_at 트리거 연결
create trigger profiles_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();
