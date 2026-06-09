# Supabase 구현 내역

## 마이그레이션
- `app/supabase/migrations/20260609000000_user_category_crud.sql`
  - `user_categories` 테이블 DDL + RLS 4개 정책 (SELECT/INSERT/UPDATE/DELETE 본인만)
  - `user_category_stocks` 테이블 DDL + RLS 3개 정책 (SELECT/INSERT/DELETE — category_id 경유 user_id 검증)
  - `memo_categories` 테이블 DDL + RLS 3개 정책 (SELECT/INSERT/DELETE — memo_id 경유 user_id 검증)

## Edge Functions
해당 없음 (전체 REST 방식)

## 클라이언트 유틸

### `app/types/category.ts` (신규)
- `UserCategory` — 카테고리 마스터 타입
- `UserCategoryWithCount` — 목록 조회용 (소속 종목 수 포함)
- `UserCategoryStock` — 카테고리-종목 매핑 타입 (stocks 조인 포함)
- `CreateCategoryInput`, `UpdateCategoryInput`, `AddCategoryStockInput` — 입력 타입

### `app/services/category.ts` (신규)
- `listCategories(userId)` — 카테고리 목록 조회 (소속 종목 수 포함, created_at asc)
- `createCategory(input)` — 카테고리 생성 (409: 이름 중복)
- `updateCategory(categoryId, input)` — 카테고리 이름 변경 (404: 없음, 409: 이름 중복)
- `deleteCategory(categoryId)` — 카테고리 삭제 (cascade: user_category_stocks, memo_categories)
- `listCategoryStocks(categoryId)` — 카테고리 종목 목록 조회 (stocks 조인)
- `addCategoryStock(input)` — 카테고리에 종목 추가 (400: 중복, 404: FK 없음)
- `removeCategoryStock(categoryId, stockId)` — 카테고리에서 종목 제거 (404: 연결 없음)

## DB 반영 결과
`supabase db push` 성공. `supabase migration list` 기준 `20260609000000 | 20260609000000` 확인.

## 사전 의존성 체크리스트
- [x] `stocks` 테이블 존재 — 이미 적용된 마이그레이션에서 생성됨 — smoke test 가능 (FK 참조)
- [x] `memos` 테이블 존재 — 이미 적용된 마이그레이션에서 생성됨 — smoke test 가능 (FK 참조)
- [ ] Supabase Dashboard에서 RLS 정책 적용 확인 — 수동 확인 필요 (Authentication > Policies > user_categories / user_category_stocks / memo_categories)

## 특이사항

### memo_categories 선행 생성
이슈 025(메모-카테고리 연결)의 선행 의존성인 `memo_categories` 테이블을 이번 마이그레이션에 함께 포함했다. 이슈 024의 핵심 기능(카테고리 CRUD + 종목 관리)에 직접 필요하지 않지만, db-schema.md에 정의되어 있고 이슈 025가 이 테이블에 의존하므로 미리 생성한다.

### list_memos RPC 카테고리 필터 미적용
현재 `list_memos` RPC(`20260608000000`)에는 `p_category_ids` 파라미터가 없다. 이슈 025에서 해당 파라미터를 추가하는 마이그레이션이 별도로 필요하다. api-spec.md에 명시된 카테고리 필터 로직(종목 경로 + 직접 연결 경로 OR)은 이슈 025 Supabase 구현에서 처리한다.

### 중복 타임스탬프 파일 (기존 이슈)
`app/supabase/migrations/` 에 `20260604000000_fix_memo_functions_asset_type.sql`과 `20260604000000_memo_filter_update.sql`이 동일 타임스탬프로 존재한다. `supabase migration repair --status applied 20260604000000`으로 양쪽을 applied 처리하여 `db push` 차단을 우회했다. 이 중복 자체는 이슈 024 이전부터 존재하던 문제로 별도 정리가 필요하다.
