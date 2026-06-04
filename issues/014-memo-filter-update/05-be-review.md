# 백엔드 코드 리뷰

## Initial Review
**결과**: 이슈 1건

**이슈 목록**
- [심각도: high] `20260604000000_memo_filter_update.sql`: PostgreSQL `array_length(arr, 1)`은 빈 배열(`'{}'`)에 대해 `0`이 아닌 `null`을 반환하므로 `array_length(p_stock_ids, 1) = 0` 조건이 빈 배열에 대해 false로 평가됨. 클라이언트에서 `p_stock_ids: []` 또는 `p_sector_ids: []`를 전달하면 "필터 없음" 대신 모든 메모가 필터링되어 빈 결과를 반환하는 버그. 카운트 쿼리와 목록 쿼리 각 2곳, 총 4곳 해당.

## Cycle 1
**수정 내용**
- `20260604000000_memo_filter_update.sql`: `array_length(p_stock_ids, 1) = 0` → `cardinality(p_stock_ids) = 0` (카운트 쿼리 line 73)
- `20260604000000_memo_filter_update.sql`: `array_length(p_sector_ids, 1) = 0` → `cardinality(p_sector_ids) = 0` (카운트 쿼리 line 106)
- `20260604000000_memo_filter_update.sql`: `array_length(p_stock_ids, 1) = 0` → `cardinality(p_stock_ids) = 0` (목록 쿼리 line 179)
- `20260604000000_memo_filter_update.sql`: `array_length(p_sector_ids, 1) = 0` → `cardinality(p_sector_ids) = 0` (목록 쿼리 line 207)

`cardinality(arr)`는 PostgreSQL 9.4+ 내장 함수로 빈 배열에 대해 `0`, null 배열에 대해 `null`을 반환하여 의도된 동작을 보장함.

**Confirmation 결과**: 합격

추가 확인 사항:
- `p_no_links` short-circuit 로직: p_no_links=true 시 연결 없는 메모만 반환, 나머지 필터 skip — 올바름
- TypeScript ↔ SQL 시그니처 일치: 파라미터 이름·타입 모두 일치
- 응답 필드 `market` 수정: api-spec.md 및 MemoStock 타입과 일치
- security definer + auth.uid() 내부 검증: RLS 우회 없이 동등 보안 구현
- SQL injection: 동적 SQL 미사용, 파라미터 바인딩만 사용
- 매매이벤트 경유 종목 조인 로직: p_stock_ids null/빈배열 케이스 상위 OR에서 선처리되어 올바름

## 최종 결과
합격
