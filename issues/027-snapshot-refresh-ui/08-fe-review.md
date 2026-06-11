# 프론트엔드 코드 리뷰

## Initial Review

**결과**: 이슈 2건

**이슈 목록**
- [심각도: mid] `app/screens/DashboardScreen.tsx`: `refetch()` 호출 시 `refreshedTodaySnapshot` 미초기화 — 풀다운 새로고침, 에러 재시도, 이벤트 등록 후 `refetch()`가 실행되어 서버에서 최신 `baseSnapshots`를 로드해도 로컬에 남아있는 `refreshedTodaySnapshot`이 오늘 날짜 행을 이전 값으로 덮어쓰는 stale 오버라이드 발생
- [심각도: low] `app/hooks/useSnapshotRefresh.ts` / `app/components/AssetHistoryChart.tsx`: `MAX_QUOTA = 3` 상수가 두 파일에 각각 중복 선언되어 있어 값 변경 시 두 파일을 모두 수정해야 함

## Cycle 1

**수정 내용**
- `app/screens/DashboardScreen.tsx`: `refetch()` 직접 사용 대신 `handleRefetchAll` 래퍼 콜백을 도입. 콜백 내에서 `setRefreshedTodaySnapshot(null)`을 먼저 호출하여 로컬 오버라이드를 초기화한 뒤 `refetch()`를 실행한다. `RefreshControl.onRefresh`, 에러 배너 재시도, `handleEventSuccess` 세 곳을 모두 `handleRefetchAll`로 교체.
- `app/hooks/useSnapshotRefresh.ts`: `MAX_QUOTA`를 `export const MAX_SNAPSHOT_QUOTA = 3`으로 이름 변경 후 export.
- `app/components/AssetHistoryChart.tsx`: 중복 선언된 `const MAX_QUOTA = 3` 제거, `useSnapshotRefresh`에서 `MAX_SNAPSHOT_QUOTA`를 import하여 사용.

**Confirmation 결과**: 합격

## 최종 결과

합격
