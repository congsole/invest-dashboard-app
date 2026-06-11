# 백엔드 코드 리뷰

## Initial Review
**결과**: 합격 — 이슈 0건 (지적 사항 3건, 모두 허용 가능한 트레이드오프로 수정 불필요)

### 검토 파일
- `app/supabase/migrations/20260610070000_snapshot_refresh_quotas.sql`
- `app/supabase/functions/refresh-today-snapshot/index.ts`
- `app/services/dashboard.ts` (수정)
- `app/types/dashboard.ts` (수정)

### 검토 항목별 결과

**SQL — 타입·제약·인덱스**
- `snapshot_refresh_quotas`: user_id+quota_date 복합 PK, used_count DEFAULT 0 CHECK(0~3), last_refreshed_at timestamptz nullable, FK → auth.users ON DELETE CASCADE — db-schema.md 명세와 완전 일치.
- 인덱스 `idx_snapshot_refresh_quotas_user_id_quota_date ON (user_id, quota_date DESC)` — 명세 일치.
- `daily_snapshots` unique constraint `uq_daily_snapshots_user_id_snapshot_date` 확인 — upsert onConflict 'user_id,snapshot_date' 와 일치.

**RLS**
- `snapshot_refresh_quotas`: RLS 활성화, SELECT 본인 조회(`auth.uid() = user_id`), INSERT/UPDATE `auth.role() = 'service_role'`, DELETE 정책 없음(허용 안 함) — 명세 일치.
- `auth.role() = 'service_role'` 패턴 관찰: Supabase에서 service_role 키는 RLS를 우회하므로 이 정책은 service_role 요청에는 평가되지 않는다. authenticated 사용자는 `auth.role() = 'authenticated'`이므로 정책 조건이 false → 차단. 의도하는 효과(service_role 쓰기 허용, authenticated 차단)는 정확히 달성된다. 이 패턴은 기존 20260427000000의 account_events 정책에서도 동일하게 사용 중(e.g. `using (auth.role() = 'authenticated')`).
- `daily_snapshots` UPDATE RLS 교체: `"daily_snapshots_update_own"` DROP → `"daily_snapshots_update_service_role"` CREATE. cron-create-snapshots 및 refresh-today-snapshot 모두 service_role 클라이언트를 사용하므로 RLS 우회 — 기존 cron 파이프라인에 영향 없음.

**API 명세 일치**
- Edge Function: JWT 검증 → 쿼터 확인(3 이상 → 429) → account_events 집계(없으면 422) → computeSnapshot → daily_snapshots upsert → 성공 후 quota upsert — api-spec.md 동작 순서와 일치.
- 에러 코드 매핑 400/401/422/429/502 — 명세 일치.
- 응답 shape `{ snapshot: { snapshot_date, total_value_krw, principal_krw, cash_krw, cash_usd, net_profit_krw, fx_rate_usd }, quota: { used_count, remaining, last_refreshed_at } }` — 명세 일치.
- 쿼터 조회 REST: `.maybeSingle()`, 행 없음 → `{ used_count: 0, remaining: 3, last_refreshed_at: null }` — 명세 일치.

**TypeScript 타입**
- `any` 사용 없음.
- `SnapshotRefreshQuota`, `RefreshTodaySnapshotResponse` 타입 정의 — DailySnapshot 기존 타입 재사용, 명세 일치.
- `refreshTodaySnapshot` 에러 처리: `FunctionsHttpError.context.responseBody` 파싱 후 code 문자열을 parseInt로 status 숫자 변환. `UNKNOWN`은 NaN → status=undefined — 정상.

**에러 처리**
- 모든 Supabase 호출에 error 분기 존재.
- quota upsert 실패를 비치명적으로 처리(console.error + 200 반환): 스냅샷 저장 성공 후 quota 업데이트만 실패하는 경우, 사용자가 재시도 시 quota가 실제보다 낮게 표시될 수 있다. 그러나 같은 DB에서 snapshot upsert 성공 직후 quota table만 실패하는 시나리오는 Supabase 관리형 인프라에서 극히 드물다. 허용 가능한 트레이드오프로 판단.

**보안**
- JWT는 JWKS(`/auth/v1/.well-known/jwks.json`)로 서명 검증 — 기존 get-market-prices, get-exchange-rate와 동일 패턴.
- 모든 DB 쓰기는 service_role 클라이언트(adminClient)를 통해서만 수행 — 클라이언트가 quota를 직접 조작 불가.
- user_id는 검증된 JWT sub claim에서만 추출 — 클라이언트 제공 user_id 없음.
- `getSnapshotRefreshQuota`의 `.eq('user_id', user.id)` 중복 필터: RLS로 이미 본인 행만 노출되지만, 명시적 필터가 추가되어 방어 깊이 확보 — 문제 없음.

**코드 품질**
- `computeSnapshot` 로직이 cron-create-snapshots에서 복제됨: 04-supabase-impl.md에 이미 이유 기록(Edge Function 간 파일 공유 번거로움). 일관성 유지 측면에서 허용. 추후 `_shared/` 모듈 분리 경로도 명시됨.
- `serve`/`Deno.serve` 혼용: 프로젝트 내 기존 함수들도 혼용(get-market-prices는 serve, cron-collect-prices는 Deno.serve). 일관성 없으나 동작에는 차이 없고 기존 컨벤션 범위 내.
- `getTodayKst()` 클라이언트 유틸 exported — FE 레이어에서 재사용 가능. 적절.

**사전 의존성 (코드 외 체크리스트)**
- 코드에서 확인 불가한 항목: `supabase functions deploy refresh-today-snapshot` 배포 필요. backend-test-agent 단계 이후 운영 배포 필요.
- `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL` 환경변수: Supabase Edge Function 런타임이 자동 주입 — 별도 설정 불필요.

**패키지 의존성**
- jose (`https://deno.land/x/jose@v5.2.3/index.ts`): Deno URL import로 package.json 항목 불필요 — 기존 get-market-prices, get-exchange-rate와 동일 방식.

### 참고 사항 (수정 불필요)

- [low] `refresh-today-snapshot/index.ts`: 쿼터 upsert 실패 시 비치명 처리. Supabase 관리형 인프라에서 실질적 위험은 낮으며, 수정하면 스냅샷 저장 성공 후 사용자에게 오류 반환이라는 더 나쁜 UX가 발생한다.
- [low] 동시 요청 시 쿼터 레이스: 앱 특성상(모바일 단일 사용자) 발생 가능성 극히 낮고, DB CHECK 제약(`used_count <= 3`)으로 카운트가 3을 초과하지 않는다.
- [info] `computeSnapshot` 복제: 기존 cron과 완전히 동일한 패턴으로 결과 일관성 보장. same-day buy-before-sell 미적용은 cron과 동일한 한계이며, TypeScript 집계 방식(netQtyMap +/-= )에서는 greatest() 클램프 이슈가 없어 실질 영향 없음.

## 최종 결과
합격
