# [027] 당일 스냅샷 수동 새로고침 — UI

<!-- PM-agent 작성 -->
## 개요
당일 스냅샷 수동 새로고침 기능의 FE 트랙. 자산 히스토리 그래프 카드 헤더에 새로고침 버튼과 남은 횟수(예: `↻ 2/3`)를 표시한다. 버튼 탭 시 이슈 026의 `refresh-today-snapshot` Edge Function을 호출하고, 응답받은 스냅샷으로 그래프를 즉시 갱신한다. 횟수 소진 시 버튼 비활성화 및 안내 문구를 표시한다. 이슈 026(BE) 선행 필요.

## 참조 문서
- 커밋: 8a659849418a437862f6c82f82bf3354b16d9d58 — [Docs] 기획 업데이트 (당일 스냅샷 수동 새로고침, 일 3회 제한)
- 기획서: docs/planning/PRD-002-dashboard.md
- 선행 이슈: [026] 당일 스냅샷 수동 새로고침 — 데이터/API 레이어 (`issues/026-snapshot-refresh-data-layer/`)

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
- [추가] SnapshotRefreshQuota 엔터티 — UI에서 남은 횟수(3 − used_count) 표시 및 버튼 비활성화 판단에 사용.
- [수정] DailySnapshot 엔터티 — 수동 새로고침 upsert로 갱신된 당일 값은 잠정치. UI에서 별도 표시 불필요(자정 cron이 최종 확정).

### db-schema.md
- [추가] snapshot_refresh_quotas 테이블 — 클라이언트가 quota_date=오늘로 SELECT하여 used_count 조회 및 헤더 초기화.

### api-spec.md
- [추가] DailySnapshot — `refresh-today-snapshot` Edge Function 호출 (버튼 탭 시). 응답의 `quota.remaining`으로 버튼 상태 갱신.
- [추가] DailySnapshot — 스냅샷 새로고침 쿼터 조회 REST API (앱 포그라운드 복귀 시 및 초기 마운트 시 남은 횟수 동기화).

<!-- 구현 단계에서 업데이트 -->
## 구현 현황
- [x] 프론트엔드 구현
- [x] 수동 테스트
