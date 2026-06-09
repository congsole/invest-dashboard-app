-- [024] 사용자 카테고리 CRUD + 종목 관리
--
-- 신규 테이블:
--   user_categories        — 사용자 정의 카테고리 마스터 (플랫 구조)
--   user_category_stocks   — 카테고리-종목 N:M junction
--   memo_categories        — 메모-카테고리 N:M junction (이슈 025 연동 대비 선행 생성)

-- ────────────────────────────────────────────
-- user_categories
-- ────────────────────────────────────────────

create table if not exists user_categories (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  name       text        not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 같은 사용자 내 카테고리명 중복 불가
alter table user_categories
  add constraint uq_user_categories_user_id_name unique (user_id, name);

-- 사용자별 카테고리 목록 조회
create index if not exists idx_user_categories_user_id
  on user_categories (user_id);

-- RLS 활성화
alter table user_categories enable row level security;

-- SELECT: 본인 카테고리만 조회
create policy "user_categories_select_own"
  on user_categories for select
  using (auth.uid() = user_id);

-- INSERT: 본인 user_id로만 삽입
create policy "user_categories_insert_own"
  on user_categories for insert
  with check (auth.uid() = user_id);

-- UPDATE: 본인 레코드만 수정
create policy "user_categories_update_own"
  on user_categories for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- DELETE: 본인 레코드만 삭제
create policy "user_categories_delete_own"
  on user_categories for delete
  using (auth.uid() = user_id);

-- ────────────────────────────────────────────
-- user_category_stocks
-- ────────────────────────────────────────────

create table if not exists user_category_stocks (
  category_id uuid        not null references user_categories(id) on delete cascade,
  stock_id    uuid        not null references stocks(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (category_id, stock_id)
);

-- 종목별 소속 카테고리 역방향 조회
create index if not exists idx_user_category_stocks_stock_id
  on user_category_stocks (stock_id);

-- RLS 활성화
alter table user_category_stocks enable row level security;

-- SELECT: category_id 경유 user_categories.user_id = auth.uid() 검증
create policy "user_category_stocks_select_own"
  on user_category_stocks for select
  using (
    exists (
      select 1 from user_categories uc
       where uc.id = category_id
         and uc.user_id = auth.uid()
    )
  );

-- INSERT: category_id가 본인 카테고리인 경우만 허용
create policy "user_category_stocks_insert_own"
  on user_category_stocks for insert
  with check (
    exists (
      select 1 from user_categories uc
       where uc.id = category_id
         and uc.user_id = auth.uid()
    )
  );

-- DELETE: category_id가 본인 카테고리인 경우만 허용
create policy "user_category_stocks_delete_own"
  on user_category_stocks for delete
  using (
    exists (
      select 1 from user_categories uc
       where uc.id = category_id
         and uc.user_id = auth.uid()
    )
  );

-- ────────────────────────────────────────────
-- memo_categories
-- ────────────────────────────────────────────

create table if not exists memo_categories (
  memo_id     uuid not null references memos(id) on delete cascade,
  category_id uuid not null references user_categories(id) on delete cascade,
  primary key (memo_id, category_id)
);

-- 카테고리별 연결 메모 역방향 조회
create index if not exists idx_memo_categories_category_id
  on memo_categories (category_id);

-- RLS 활성화
alter table memo_categories enable row level security;

-- SELECT: memo_id를 통해 memos.user_id = auth.uid() 검증
create policy "memo_categories_select_own"
  on memo_categories for select
  using (
    exists (
      select 1 from memos m
       where m.id = memo_id
         and m.user_id = auth.uid()
    )
  );

-- INSERT: memo_id가 본인 메모인 경우만 허용
create policy "memo_categories_insert_own"
  on memo_categories for insert
  with check (
    exists (
      select 1 from memos m
       where m.id = memo_id
         and m.user_id = auth.uid()
    )
  );

-- DELETE: memo_id가 본인 메모인 경우만 허용
create policy "memo_categories_delete_own"
  on memo_categories for delete
  using (
    exists (
      select 1 from memos m
       where m.id = memo_id
         and m.user_id = auth.uid()
    )
  );
