# 백엔드 통합 테스트

## 테스트 환경
- 대상: 로컬 Supabase (supabase db reset 후 전체 스위트)
- 테스트 파일: app/tests/integration/026-snapshot-refresh-data-layer.test.ts
- Edge Function 서빙: supabase functions serve refresh-today-snapshot (로컬, http://127.0.0.1:54321/functions/v1/)
- 원격 push: 완료 (20260610070000_snapshot_refresh_quotas.sql)
- Edge Function 배포: 완료 (supabase functions deploy refresh-today-snapshot)

## 테스트 결과

| 테스트 케이스 | 결과 | 비고 |
|-------------|------|------|
| 오늘 사용 기록이 없으면 행이 없다 (maybeSingle → null) | ✅ 통과 | |
| service_role로 직접 행 삽입 후 SELECT 조회 가능 | ✅ 통과 | |
| 유효한 파라미터로 호출 시 200 응답 + snapshot/quota 구조 반환 | ✅ 통과 | |
| 성공 후 daily_snapshots에 행이 upsert된다 | ✅ 통과 | |
| 성공 후 snapshot_refresh_quotas에 used_count가 1 증가한다 | ✅ 통과 | |
| 같은 날 2회 호출 시 used_count가 2로 증가한다 | ✅ 통과 | |
| used_count=3일 때 호출 시 429 반환 | ✅ 통과 | |
| 429 응답 후 used_count가 변하지 않는다 (미차감) | ✅ 통과 | |
| 429 응답에 quota 정보가 포함된다 | ✅ 통과 | |
| current_prices 배열이 비어 있으면 400 반환 | ✅ 통과 | |
| current_prices가 없으면 400 반환 | ✅ 통과 | |
| fx_rate_usd가 0이면 400 반환 | ✅ 통과 | |
| fx_rate_usd가 음수이면 400 반환 | ✅ 통과 | |
| fx_rate_usd가 없으면 400 반환 | ✅ 통과 | |
| Authorization 헤더 없이 호출 시 401 반환 | ✅ 통과 | 로컬 런타임이 { msg: "..." } 형식으로 반환하는 것을 허용하도록 수정 |
| 잘못된 토큰으로 호출 시 401 반환 | ✅ 통과 | 동일 |
| account_events가 없는 유저가 호출 시 422 반환 | ✅ 통과 | |
| 인증된 일반 사용자는 snapshot_refresh_quotas에 직접 INSERT 불가 | ✅ 통과 | |
| 인증된 일반 사용자는 snapshot_refresh_quotas에 직접 UPDATE 불가 | ✅ 통과 | |
| 미인증 사용자는 snapshot_refresh_quotas SELECT 불가 | ✅ 통과 | |
| 다른 유저의 snapshot_refresh_quotas는 SELECT 불가 (RLS 격리) | ✅ 통과 | |
| 인증된 일반 사용자는 daily_snapshots에 직접 UPDATE 불가 | ✅ 통과 | |
| 오늘 행이 없으면 maybeSingle이 null을 반환한다 | ✅ 통과 | |
| 오늘 행이 있으면 used_count와 last_refreshed_at을 반환한다 | ✅ 통과 | |

**이슈 026 테스트: 24개 통과 / 0개 실패**
**전체 스위트: 280개 통과 / 0개 실패 (12개 테스트 파일)**

## 수정 내역

### Cycle 1 (초기 실행 후 수정)
- `026-snapshot-refresh-data-layer.test.ts`: 미인증 401 테스트 2건 수정
  - 원인: 로컬 Supabase Edge Function 런타임이 Authorization 헤더 없음/토큰 형식 오류 시 `{ msg: "Error: Missing authorization header" }` 형식으로 반환 (Edge Function 코드의 `{ error: { code: '401', ... } }` 형식과 다름). 이는 런타임 레이어가 Edge Function 진입 전에 가로채는 정상 동작.
  - 수정: `data?.error?.code === '401'` 외에 `data?.msg` 문자열 포함 여부도 허용하도록 조건 확장

## 회귀 확인
기존 테스트 11개 파일(007~025) 전부 통과 — 이번 마이그레이션(snapshot_refresh_quotas 테이블 추가, daily_snapshots UPDATE RLS 변경)이 기존 기능을 회귀시키지 않음.

## 최종 결과
통과
