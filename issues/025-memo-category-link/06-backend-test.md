# 백엔드 통합 테스트

## 테스트 환경
- Supabase URL: wxznscebhpkfspwphbdv.supabase.co
- 테스트 파일: app/tests/integration/025-memo-category-link.test.ts

## 테스트 결과

| # | 테스트 케이스 | 결과 |
|---|-------------|------|
| 1-1 | create_memo_with_links — p_category_ids 없이 메모 생성 시 categories는 빈 배열 | ✅ 통과 |
| 1-2 | create_memo_with_links — p_category_ids 1개 연결 시 응답 categories에 포함 | ✅ 통과 |
| 1-3 | create_memo_with_links — p_category_ids 2개 연결 시 응답 categories에 모두 포함 | ✅ 통과 |
| 1-4 | create_memo_with_links — 빈 배열 전달 시 categories는 빈 배열 | ✅ 통과 |
| 2-1 | 타인 카테고리 연결 시도 시 에러 반환 | ✅ 통과 |
| 2-2 | 타인 카테고리 연결 실패 시 메모 본체도 생성되지 않음 (롤백) | ✅ 통과 |
| 3-1 | update_memo_with_links — p_category_ids로 카테고리 교체 시 새 카테고리만 포함 | ✅ 통과 |
| 3-2 | update_memo_with_links — 1개만 전달 시 나머지 제거 | ✅ 통과 |
| 4-1 | update_memo_with_links — p_category_ids=null 시 기존 연결 유지 | ✅ 통과 |
| 4-2 | update_memo_with_links — p_category_ids=[] 시 모든 카테고리 연결 해제 | ✅ 통과 |
| 5-1 | list_memos — p_category_ids 직접 연결 경로 필터: 해당 카테고리 연결 메모만 반환 | ✅ 통과 |
| 5-2 | list_memos — 필터된 메모 응답에 categories 배열 포함 확인 | ✅ 통과 |
| 5-3 | list_memos — p_category_ids=null 시 카테고리 필터 미적용 (전체 반환) | ✅ 통과 |
| 6-1 | list_memos — 종목 경로 (user_category_stocks → memo_stocks) 필터: 두 경로 OR 합산 | ✅ 통과 |
| 6-2 | list_memos — OR 합산 시 중복 없이 반환 | ✅ 통과 |
| 7-1 | list_memos — p_no_links=true 시 카테고리만 연결된 메모는 제외 | ✅ 통과 |
| 8-1 | 메모 상세 조회 시 memo_categories join에 category_id + user_categories(id, name) 포함 | ✅ 통과 |
| 8-2 | 카테고리 미연결 메모 상세 조회 시 memo_categories는 빈 배열 | ✅ 통과 |
| 9-1 | CASCADE — 카테고리 삭제 시 memo_categories 연쇄 삭제, 메모 본체 유지 | ✅ 통과 |

**전체: 19개 통과 / 0개 실패**

## 수정 내역

없음 (첫 실행 전 통과)

## 최종 결과
통과
