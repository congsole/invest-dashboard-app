# 백엔드 코드 리뷰

## Initial Review
**결과**: 합격 (이슈 0건)

### 검토 항목별 결과

**SQL — 타입, 제약조건, 인덱스**
- `memo_categories` 테이블은 이슈 024(`20260609000000_user_category_crud.sql`)에서 선행 생성되었으며, `(memo_id, category_id)` 복합 PK, cascade FK, `idx_memo_categories_category_id` 인덱스가 db-schema.md와 정확히 일치한다.
- 3개 RPC 모두 기존 시그니처를 `DROP IF EXISTS`로 제거 후 재생성. DROP 타입 시그니처가 이전 마이그레이션(`20260605000001`)의 실제 시그니처와 일치함을 확인.

**RLS**
- `memo_categories`: `memo_id` 경유 `memos.user_id = auth.uid()` 검증. SELECT / INSERT / DELETE 정책 모두 적용됨.
- `user_categories`, `user_category_stocks`: 이슈 024에서 기 적용. 이번 이슈 범위 내 신규 테이블 없음.

**API 명세 일치 여부**
- `create_memo_with_links`: `p_category_ids uuid[] DEFAULT null` 파라미터 추가, 응답 JSON에 `categories: [{category_id, name}]` 포함. api-spec.md와 완전 일치.
- `update_memo_with_links`: `p_category_ids uuid[] DEFAULT null` 파라미터 추가, null=변경없음 / `'{}'`=전체해제 패턴 구현, 응답에 `categories` 포함. api-spec.md와 완전 일치.
- `list_memos`: `p_category_ids uuid[] DEFAULT null` 추가, `category_memo_ids` CTE(종목 경로 + 직접 연결 경로 UNION), `p_no_links` 조건에 `memo_categories` 포함, 응답에 `categories` 포함. api-spec.md와 완전 일치.
- `getMemo` REST select: `memo_categories(category_id, user_categories(id, name))` join 추가. api-spec.md 호출 문자열과 일치.
- `linkMemoCategory` / `unlinkMemoCategory` 신규 추가. api-spec.md의 "메모 엔티티 연결 추가/해제" 섹션과 일치.

**TypeScript 타입**
- `MemoCategory { category_id: string; name: string }` — SQL 응답 필드와 일치.
- `MemoItem.categories: MemoCategory[]` — list_memos / create / update 응답과 일치.
- `MemoDetail.memo_categories: Array<{ category_id: string; user_categories: { id: string; name: string } }>` — REST select join 결과와 일치.
- `CreateMemoInput.p_category_ids?: string[] | null`, `UpdateMemoInput.p_category_ids?: string[] | null` — JSDoc 포함, 타입 정확.
- `EntityType`에 `'category'` 추가, `ENTITY_COLORS.category: '#F59E0B'` 추가 — PRD 색상 스펙(#F59E0B 주황) 일치.
- `MemoFilterState`에 `categoryIds: string[]`, `categoryNames: string[]` 추가, `DEFAULT_FILTER_STATE` 업데이트. `any` 사용 없음.

**에러 처리**
- 모든 Supabase 호출(`rpc`, `from().select`, `from().insert`, `from().delete`)에서 `if (error) throw error` 패턴 일관 적용.

**보안**
- `create_memo_with_links`: 메모 INSERT 이전에 `category_ids` 소유권 사전 검사. 유효하지 않은 category_id 시 메모 자체가 생성되지 않아 롤백 필요 없음.
- `update_memo_with_links`: `p_category_ids is not null` 블록 내에서 DELETE 전 소유권 검사. 타인 카테고리로 덮어쓰기 방지.
- 두 RPC 모두 `security definer`이며 `set search_path = public`으로 검색 경로 고정. SQL 인젝션 취약점 없음.

**카테고리 필터 로직 (`list_memos`)**
- `category_memo_ids` CTE가 카운트 쿼리와 목록 쿼리 양쪽에 동일하게 정의되어 있어 카운트와 실제 결과 간 불일치 위험 없음.
- `p_category_ids is null` / `cardinality(p_category_ids) = 0` 두 경우 모두 필터 통과(전체 반환). null 전달 시 `= any(null)`이 CTE 내에서 빈 결과를 반환하지만, 상위 WHERE 절의 `p_category_ids is null` 단락으로 보호되어 동작 정확.
- 종목 경로(`memo_stocks JOIN user_category_stocks WHERE ucs.category_id = ANY(p_category_ids)`)와 직접 연결 경로(`memo_categories WHERE category_id = ANY(p_category_ids)`) UNION — db-schema.md 필터 쿼리 패턴과 일치.

**`p_no_links` 확장**
- `memo_categories`가 "연결 있음"에 해당하도록 NOT EXISTS 조건에 추가됨. api-spec.md "카테고리만 연결된 메모는 연결 없음에 해당하지 않는다" 요건 충족.

**사전 의존성**
- `memo_categories` 테이블: 이슈 024 마이그레이션에서 선행 생성 확인.
- `user_categories`, `user_category_stocks` 테이블: 이슈 024에서 선행 생성 확인.
- RPC 3개 등록: 04-supabase-impl.md에 `supabase db query` 검증 완료로 기록됨.
- 코드 외부 설정(OAuth, Redirect URL 등) 해당 없음.

**패키지 의존성**
- 신규 패키지 추가 없음. 이슈 범위 해당 없음.

## 최종 결과
합격
