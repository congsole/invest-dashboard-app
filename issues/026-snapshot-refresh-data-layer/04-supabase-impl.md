# Supabase 구현 내역

## 마이그레이션

- `/Users/imsi/Documents/WebStormProjects/invest-dashboard/app/supabase/migrations/20260610070000_snapshot_refresh_quotas.sql`

### 주요 내용

1. `snapshot_refresh_quotas` 테이블 신규 생성
   - 복합 PK: `(user_id, quota_date)`
   - `used_count int DEFAULT 0 CHECK (used_count >= 0 AND used_count <= 3)`
   - `last_refreshed_at timestamptz` (nullable)
   - FK: `user_id → auth.users(id) ON DELETE CASCADE`
   - 인덱스: `idx_snapshot_refresh_quotas_user_id_quota_date ON (user_id, quota_date DESC)`
   - RLS: SELECT = 본인 조회 / INSERT = service_role 전용 / UPDATE = service_role 전용 / DELETE = 불허

2. `daily_snapshots` UPDATE RLS 변경
   - 기존 `"daily_snapshots_update_own"` (본인 허용) → DROP
   - 신규 `"daily_snapshots_update_service_role"` (service_role 전용) → CREATE

## Edge Functions

- `/Users/imsi/Documents/WebStormProjects/invest-dashboard/app/supabase/functions/refresh-today-snapshot/index.ts`

### 동작 순서

1. JWT 검증 (`jose` JWKS) → `user_id` 추출
2. 요청 바디 유효성 검사 (`current_prices`, `fx_rate_usd`)
3. `snapshot_refresh_quotas` 에서 오늘자 `used_count` 조회. 3 이상이면 429 즉시 반환 (횟수 미차감)
4. `account_events` 집계 → 이벤트 없으면 422 반환
5. `computeSnapshot()` 으로 스냅샷 값 계산 (`cron-create-snapshots` 와 동일 패턴)
6. `daily_snapshots` upsert (`ON CONFLICT user_id,snapshot_date`)
7. 성공 시에만 `snapshot_refresh_quotas` upsert (used_count + 1)
8. 응답 반환: `{ snapshot, quota }`

### 에러 처리

| 상황 | HTTP 코드 | 횟수 차감 |
|------|-----------|-----------|
| 인증 없음/만료 | 401 | - |
| 잘못된 파라미터 | 400 | - |
| account_events 없음 | 422 | - |
| 일 3회 초과 | 429 | 미차감 |
| 내부 계산/저장 실패 | 502 | 미차감 |

## 클라이언트 유틸

- `/Users/imsi/Documents/WebStormProjects/invest-dashboard/app/services/dashboard.ts` — 기존 파일에 함수 2개 추가
  - `refreshTodaySnapshot(currentPrices, fxRateUsd)` — Edge Function 호출, HTTP 상태 코드 포함 에러 throw
  - `getSnapshotRefreshQuota()` — `snapshot_refresh_quotas` REST 조회. 행 없으면 `{ used_count: 0, remaining: 3, last_refreshed_at: null }` 반환
  - `getTodayKst()` — KST 기준 오늘 날짜 문자열 유틸 (exported)

- `/Users/imsi/Documents/WebStormProjects/invest-dashboard/app/types/dashboard.ts` — 타입 2개 추가
  - `SnapshotRefreshQuota` — `{ used_count, remaining, last_refreshed_at }`
  - `RefreshTodaySnapshotResponse` — `{ snapshot: DailySnapshot, quota: SnapshotRefreshQuota }`

## 사전 의존성 체크리스트

- [ ] Edge Function 배포: `supabase functions deploy refresh-today-snapshot` — Supabase 대시보드 또는 CLI — smoke test: `supabase functions invoke refresh-today-snapshot` 가능
- [ ] 환경변수 `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL` — Edge Function 런타임에 Supabase가 자동 주입 — 별도 설정 불필요 (로컬 `supabase start` 시 자동 주입)

## 특이사항

- `computeSnapshot()` 로직은 `cron-create-snapshots/index.ts` 의 동일 함수를 그대로 복제하여 일관성을 유지했다. 두 함수를 별도 shared module로 추출하는 것이 이상적이나, Supabase Edge Function은 함수 간 파일 공유가 번거로워 (별도 `_shared/` 디렉토리 필요) 현 단계에서는 복제를 선택했다. 추후 리팩토링 시 `supabase/functions/_shared/computeSnapshot.ts` 로 분리 가능.
- `daily_snapshots` INSERT RLS는 기존 `"daily_snapshots_insert_own"` (본인 허용)을 유지한다. cron/수동 새로고침 Edge Function은 service_role 클라이언트를 사용하므로 INSERT도 동작한다. INSERT RLS를 service_role 전용으로 바꾸면 기존 cron도 영향 없지만, 설계 변경 범위 최소화를 위해 UPDATE만 변경했다.
- 마이그레이션 `db reset` 및 `db push` 는 backend-test-agent 단계에서 수행한다.
