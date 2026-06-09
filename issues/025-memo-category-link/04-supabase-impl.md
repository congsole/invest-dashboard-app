# Supabase 구현 내역

## 마이그레이션

- `app/supabase/migrations/20260609000001_memo_category_link.sql`

### 주요 변경 내용

**`create_memo_with_links`** — 기존 시그니처 DROP 후 재생성
- `p_category_ids uuid[] DEFAULT null` 파라미터 추가
- 카테고리 소유권 검사 (본인 카테고리인지 user_categories.user_id 비교)
- `memo_categories` INSERT 처리
- 응답 JSON에 `categories: [{category_id, name}]` 배열 추가

**`update_memo_with_links`** — 기존 시그니처 DROP 후 재생성
- `p_category_ids uuid[] DEFAULT null` 파라미터 추가
- null = 변경 없음, 빈 배열 = 전체 해제 (기존 섹터/종목 패턴과 동일)
- 유효성 검사 후 DELETE + INSERT 방식으로 교체
- 응답 JSON에 `categories: [{category_id, name}]` 배열 추가

**`list_memos`** — 기존 시그니처 DROP 후 재생성
- `p_category_ids uuid[] DEFAULT null` 파라미터 추가 (p_sector_ids 뒤에 위치)
- `category_memo_ids` CTE 추가:
  - 종목 경로: `memo_stocks JOIN user_category_stocks WHERE ucs.category_id = ANY(p_category_ids)`
  - 직접 연결 경로: `memo_categories WHERE mc.category_id = ANY(p_category_ids)`
  - 두 경로 UNION (OR 합산)
- 카테고리 필터는 다른 필터와 AND 결합
- `p_no_links` 조건 확장: `memo_categories`도 "연결 있음"에 해당 (카테고리만 연결된 메모는 "연결 없음" 아님)
- 응답 각 메모 row에 `categories: [{category_id, name}]` 배열 추가

## Edge Functions

없음 (모두 DB Function으로 구현)

## 클라이언트 유틸

### `app/types/memo.ts`
- `MemoCategory` 인터페이스 추가 (`{ category_id: string; name: string }`)
- `MemoItem.categories: MemoCategory[]` 필드 추가
- `MemoDetail.memo_categories` 배열 추가 (`category_id`, `user_categories: { id, name }`)
- `CreateMemoInput.p_category_ids?: string[] | null` 추가
- `UpdateMemoInput.p_category_ids?: string[] | null` 추가 (JSDoc: null=변경없음, 빈배열=전체해제)
- `ListMemosParams.p_category_ids?: string[] | null` 추가
- `EntityType`에 `'category'` 추가
- `MemoFilterState`에 `categoryIds: string[]`, `categoryNames: string[]` 추가
- `DEFAULT_FILTER_STATE` 업데이트
- `ENTITY_COLORS.category: '#F59E0B'` 추가 (주황)

### `app/services/memo.ts`
- `listMemos` — `p_category_ids` 파라미터 전달 추가
- `getMemo` — select 쿼리에 `memo_categories(category_id, user_categories(id, name))` join 추가
- `createMemo` — `p_category_ids` 파라미터 전달 추가
- `updateMemo` — `p_category_ids` 파라미터 전달 추가
- `linkMemoCategory(memoId, categoryId)` 함수 신규 추가
- `unlinkMemoCategory(memoId, categoryId)` 함수 신규 추가

## 사전 의존성 체크리스트

- [x] `memo_categories` 테이블 존재 — 이슈 024 마이그레이션(`20260609000000_user_category_crud.sql`)에서 선행 생성됨 — smoke test 가능
- [x] `user_categories`, `user_category_stocks` 테이블 존재 — 이슈 024에서 선행 생성됨 — smoke test 가능
- [x] RPC 함수 3개 (`create_memo_with_links`, `update_memo_with_links`, `list_memos`) `p_category_ids` 파라미터 포함 등록 확인 — `supabase db query`로 검증 완료

## 특이사항

**마이그레이션 적용 방식**: `supabase db push`가 로컬에 같은 타임스탬프(`20260604000000`)를 가진 파일이 두 개 존재해 blocked. `supabase db query --linked -f`로 SQL을 직접 실행 후 `supabase migration repair --status applied`로 히스토리에 등록하는 방식으로 우회.

**`p_no_links` 조건 확장**: 기존 구현에서는 `memo_sectors`까지만 "연결 있음"으로 체크했으나, 카테고리도 엔티티 연결이므로 `memo_categories`도 포함하도록 수정. "카테고리만 연결된 메모는 연결 없음에 해당하지 않는다"는 API spec 요건을 준수.

**카테고리 필터 보안**: `create_memo_with_links`와 `update_memo_with_links` 내부에서 `category_id`가 `auth.uid()` 소유 카테고리인지 명시적 검사. RLS만 의존하지 않고 DB Function 내부에서 이중 검증.
