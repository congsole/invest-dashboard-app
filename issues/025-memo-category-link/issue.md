# [025] 메모-카테고리 연결

## 개요
메모에 사용자 정의 카테고리를 연결하고, 카테고리 기반으로 메모를 필터링하는 기능을 구현한다. 이슈 024에서 생성된 카테고리 테이블을 기반으로 한다.

- `memo_categories` 테이블 (메모-카테고리 N:M junction) DDL + RLS 적용
- `create_memo_with_links` RPC에 `p_category_ids` 파라미터 추가
- `update_memo_with_links` RPC에 `p_category_ids` 파라미터 추가
- `list_memos` RPC에 `p_category_ids` 필터 파라미터 추가 (종목 경로 + 직접 연결 경로 OR 합산)
- 메모 상세 조회 REST select에 `memo_categories` join 추가
- 메모 작성/편집 화면에 카테고리 연결 UI 추가 (칩 형태 선택/해제, 인라인 신규 생성)
- 메모 필터에 카테고리 행 추가 (복수 선택 OR, 다른 행과 AND)
- 메모 리스트에 카테고리 칩 표시 (주황 #F59E0B)
- 달력형 메모에 카테고리 색상 점 추가

선행 이슈: [024] 사용자 카테고리 CRUD + 종목 관리

## 참조 문서
- 커밋: 5872267 — [Docs] 기획 업데이트 (카테고리 기능 추가)
- 기획서: docs/planning/PRD-006-user-categories.md

## docs 변경 내역

### domain-model.md
- [추가] MemoCategory junction 엔터티 — 메모-카테고리 N:M 연결 (memo_id PK+FK, category_id PK+FK). 카테고리 필터링 규칙: 종목 경로 + 직접 연결 경로 OR 합산 (섹터 필터와 동일 패턴).
- [추가] 관계 1건: Memo N:M UserCategory

### db-schema.md
- [추가] memo_categories 테이블 — 메모-카테고리 N:M junction. 복합 PK (memo_id, category_id), 각각 cascade FK, 인덱스 idx_memo_categories_category_id. RLS: memo_id 경유 memos.user_id 검증. 카테고리 필터 쿼리 패턴 기록.
- [추가] ERD 관계 2건: memos→memo_categories, memo_categories→user_categories

### api-spec.md
- [수정] Memo — 메모 생성 RPC(`create_memo_with_links`) `p_category_ids` 파라미터 추가, 응답에 `categories` 배열 추가
- [수정] Memo — 메모 수정 RPC(`update_memo_with_links`) `p_category_ids` 파라미터 추가(null=변경 없음, 빈 배열=전체 해제), 응답에 `categories` 배열 추가
- [수정] Memo — 메모 목록 조회 RPC(`list_memos`) `p_category_ids` 파라미터 추가, 응답 memos 배열 내 `categories` 배열 추가, 필터 결합 규칙에 카테고리 행 추가
- [수정] Memo — 메모 상세 조회 REST select에 `memo_categories(category_id, user_categories(id, name))` join 추가, 응답에 `memo_categories` 배열 추가
- [추가] Memo — 메모 엔티티 연결 추가에 카테고리 연결 추가(`memo_categories.insert`)
- [추가] Memo — 메모 엔티티 연결 해제에 카테고리 연결 해제(`memo_categories.delete`)

## 구현 현황
- [x] Supabase 구현
- [x] 백엔드 테스트
- [x] 프론트엔드 구현
