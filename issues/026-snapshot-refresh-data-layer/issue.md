# [026] 당일 스냅샷 수동 새로고침 — 데이터/API 레이어

<!-- PM-agent 작성 -->
## 개요
당일 스냅샷 수동 새로고침 기능의 BE 트랙. 자정 cron 기반 스냅샷이 당일 이벤트를 반영하지 못하는 문제를 보완하기 위해, 사용자가 직접 오늘자 스냅샷을 즉시 재계산·저장할 수 있는 Edge Function을 구현한다. 일 3회 제한을 서버에서 강제하기 위한 `snapshot_refresh_quotas` 테이블 마이그레이션 및 서비스 함수 작성을 포함한다.

## 참조 문서
- 커밋: 8a659849418a437862f6c82f82bf3354b16d9d58 — [Docs] 기획 업데이트 (당일 스냅샷 수동 새로고침, 일 3회 제한)
- 기획서: docs/planning/PRD-002-dashboard.md

## docs 변경 내역

다음 명령으로 설계 에이전트들이 방금 업데이트한 내역을 파악한다:
```bash
git diff HEAD docs/architecture/domain-model.md
git diff HEAD docs/architecture/db-schema.md
git diff HEAD docs/api/api-spec.md
```
(아직 커밋되지 않은 변경 사항이므로 `HEAD` 기준 diff 사용)

변경된 내용을 요약하여 아래 형식으로 채운다:

### domain-model.md
- [추가] SnapshotRefreshQuota 엔터티 — user_id+quota_date 복합 PK, used_count(default 0, ≤3), last_refreshed_at. 일 3회 서버 강제 제한용. KST 날짜 기준 자정 리셋(날짜별 새 행 삽입).
- [수정] DailySnapshot 엔터티 — 설명에 수동 새로고침 upsert 패턴 및 잠정치 개념 추가. 자정 cron이 종가 기준으로 최종 확정.
- [추가] 관계: User 1:N SnapshotRefreshQuota

### db-schema.md
- [추가] snapshot_refresh_quotas 테이블 — user_id+quota_date 복합 PK, used_count int default 0 CHECK(≤3), last_refreshed_at timestamptz nullable. RLS: SELECT 본인 조회 / INSERT·UPDATE service_role 전용. 인덱스: idx_snapshot_refresh_quotas_user_id_quota_date ON (user_id, quota_date DESC).
- [수정] daily_snapshots 테이블 — 설명에 수동 새로고침 upsert 패턴·잠정치 개념 추가. RLS UPDATE를 service_role 전용으로 변경.
- [추가] ERD 관계: auth.users → snapshot_refresh_quotas (1:N)

### api-spec.md
- [추가] DailySnapshot — 당일 스냅샷 수동 새로고침 Edge Function(`refresh-today-snapshot`): current_prices + fx_rate_usd 전달 → account_events 집계 → daily_snapshots upsert → snapshot_refresh_quotas used_count 증가. 갱신 성공 후에만 횟수 차감. 일 3회 초과 시 429(횟수 미차감), 502 실패 시 횟수 미차감.
- [추가] DailySnapshot — 스냅샷 새로고침 쿼터 조회 REST API: `snapshot_refresh_quotas` SELECT (quota_date=KST 오늘). 행 없으면 used_count=0 처리.

<!-- 구현 단계에서 업데이트 -->
## 구현 현황
- [x] Supabase 구현
- [x] 백엔드 테스트
