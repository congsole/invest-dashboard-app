# 백엔드 통합 테스트

## 테스트 환경
- Supabase URL: wxznscebhpkfspwphbdv.supabase.co
- 테스트 파일: app/tests/integration/014-memo-filter.test.ts

## 테스트 결과

| 테스트 케이스 | 결과 | 비고 |
|-------------|------|------|
| a. p_stock_ids=[] 빈 배열 → 전체 메모 반환 (null과 동일) | 통과 | cardinality() 수정 핵심 검증 |
| b. p_stock_ids=[단일 ID] → 해당 종목 메모만 반환 | 통과 | 직접 연결 + 매매이벤트 경유 포함 |
| c. p_stock_ids=[복수 ID] → OR 동작 | 통과 | 합집합 반환 확인 |
| d. p_sector_ids=[1, 2] → OR 동작 | 통과 | 각 섹터 메모 합집합 |
| d-2. p_sector_ids=[] 빈 배열 → 전체 반환 | 통과 | cardinality() 수정 검증 |
| e. p_stock_ids + p_trade_events_only → AND 동작 | 통과 | 교집합만 반환 |
| f. p_no_links=true → 연결 없는 메모만, 다른 필터 무시 | 통과 | short-circuit 동작 확인 |
| g. 매매이벤트 경유 종목 연결 메모 포함 | 통과 | ticker 매칭 경유 연결 확인 |
| 응답 stocks 배열에 market 필드, asset_type 없음 | 통과 | 필드명 수정 검증 |

**전체: 9개 통과 / 0개 실패**

## 수정 내역

### Cycle 1 (테스트 실행 전)
- `app/supabase/migrations/20260604000001_memo_filter_drop_old.sql` 추가:
  구 `list_memos` 함수(`p_stock_id uuid`, `p_sector_id int`, `p_include_trade_events boolean`) DROP.
  원인: `CREATE OR REPLACE`는 파라미터 시그니처가 다를 경우 교체가 아닌 오버로드로 처리되어 PostgREST 스키마 캐시에서 새 함수를 인식하지 못하는 문제 발생.

- `app/supabase/migrations/20260604000002_memo_filter_recreate.sql` 추가:
  혹시 남아있을 변형 시그니처 DROP 후 새 시그니처로 `CREATE OR REPLACE` 재실행하여 PostgREST 스키마 캐시 갱신 보장.

### Cycle 1 (테스트 재실행)
- 마이그레이션 적용 후 PostgREST 스키마 캐시 자동 갱신 확인
- 모든 9개 테스트 통과

## 최종 결과
통과
