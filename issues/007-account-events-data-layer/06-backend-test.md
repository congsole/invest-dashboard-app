# [007] Backend Test

## 결과: PASS

## 테스트 환경
- Supabase URL: wxznscebhpkfspwphbdv.supabase.co
- 테스트 파일: app/tests/integration/007-account-events.test.ts

## 테스트 케이스

| # | 테스트명 | 결과 |
|---|---------|------|
| 1 | account_events - buy 이벤트 INSERT 후 SELECT 검증 | PASS |
| 2 | account_events - sell 이벤트 INSERT 후 SELECT 검증 | PASS |
| 3 | account_events - deposit 이벤트 INSERT 후 SELECT 검증 | PASS |
| 4 | account_events - withdraw 이벤트 INSERT 후 SELECT 검증 | PASS |
| 5 | account_events - dividend 이벤트 INSERT 후 SELECT 검증 | PASS |
| 6 | account_events - event_type 필터 조회 (buy만 반환) | PASS |
| 7 | account_events - asset_type 필터 조회 (us_stock만 반환) | PASS |
| 8 | account_events - UPDATE: amount 수정 검증 | PASS |
| 9 | account_events - DELETE: 삭제 후 조회 불가 검증 | PASS |
| 10 | account_events - RLS: 유저1 데이터를 유저2가 SELECT 불가 | PASS |
| 11 | account_events - RLS: 유저1 데이터를 유저2가 UPDATE 불가 | PASS |
| 12 | account_events - RLS: 미인증 사용자는 account_events SELECT 불가 | PASS |
| 13 | daily_snapshots - INSERT 후 SELECT 검증 | PASS |
| 14 | daily_snapshots - UNIQUE 제약 (user_id, snapshot_date): 중복 삽입 시 에러 | PASS |
| 15 | daily_snapshots - 날짜 범위 조회: from/to 필터 정상 동작 | PASS |
| 16 | daily_snapshots - RLS: 미인증 사용자는 daily_snapshots SELECT 불가 | PASS |
| 17 | corporate_actions - 인증된 사용자는 SELECT 가능 | PASS |
| 18 | corporate_actions - 일반 사용자는 INSERT 불가 (RLS 기본 deny) | PASS |
| 19 | corporate_actions - service_role은 INSERT 가능 | PASS |
| 20 | corporate_actions - 미인증 사용자는 SELECT도 불가 | PASS |
| 21 | prices - 인증된 사용자는 SELECT 가능 | PASS |
| 22 | prices - 일반 사용자는 INSERT 불가 | PASS |
| 23 | prices - service_role은 INSERT 가능 | PASS |
| 24 | fx_rates - 인증된 사용자는 SELECT 가능 | PASS |
| 25 | fx_rates - 일반 사용자는 INSERT 불가 | PASS |
| 26 | fx_rates - service_role은 INSERT 가능 | PASS |
| 27 | get_kpi_summary - 미인증 상태에서 호출 시 에러 반환 | PASS |
| 28 | get_kpi_summary - 데이터 없을 때 0값 구조 반환 | PASS |
| 29 | get_kpi_summary - 입금 후 원금 집계 검증 | PASS |
| 30 | get_kpi_summary - 매수/매도 후 holdings 집계 검증 (가중평균 250) | PASS |
| 31 | get_kpi_summary - 전량 매도된 종목은 holdings에서 제외 | PASS |
| 32 | get_kpi_summary - p_fx_rate_usd <= 0 이면 에러 반환 | PASS |
| 33 | get_history_markers - 미인증 상태에서 호출 시 에러 반환 | PASS |
| 34 | get_history_markers - 배당/출금 이벤트 마커 반환 검증 | PASS |
| 35 | get_history_markers - buy 이벤트는 마커에 포함되지 않음 | PASS |
| 36 | get_history_markers - 기간 외 이벤트는 마커에 포함되지 않음 | PASS |

**전체: 36개 통과 / 0개 실패**

## 수정 내역

### Cycle 1
- `app/supabase/migrations/20260427000001_account_events_rpc.sql`: `get_kpi_summary` 함수 내 CTE `running`이 재귀 참조를 포함하므로 `WITH` → `WITH RECURSIVE` 변경. PostgreSQL은 재귀 CTE를 명시적으로 선언해야 하며, 선언 없이 자기 참조 시 `relation "running" does not exist` 에러 발생.

### Cycle 2
- `app/supabase/migrations/20260427000001_account_events_rpc.sql`: `r_price` 변수 타입을 `jsonb` → `record`로 변경, `for r_price in select * from jsonb_array_elements(p_current_prices)` → `select value from jsonb_array_elements(p_current_prices)` 수정. `jsonb` 타입 루프 변수에 레코드를 할당하면 PostgreSQL이 `FROM`절 참조 에러를 발생시킴. `record` 타입으로 변경하면 `r_price.value`가 정상 접근 가능.

## 최종 결과
통과
