# 프론트엔드 구현 내역

## 새로 만든 컴포넌트/훅

- `app/hooks/useSnapshotRefresh.ts` — 당일 스냅샷 수동 새로고침 전용 훅
  - 초기 마운트 및 앱 포그라운드 복귀(`AppState` 이벤트) 시 쿼터 자동 동기화
  - `handleRefresh(currentPrices, fxRateUsd, onSuccess)` — refreshTodaySnapshot 호출 후 응답 quota로 상태 갱신, 성공 시 onSuccess 콜백으로 갱신 스냅샷 전달
  - 에러 코드(429, 422, 502, 401, 400)별 사용자 친화적 메시지 변환
  - `refreshing` / `refreshError` / `clearRefreshError` 상태 노출

## 수정한 파일

- `app/components/AssetHistoryChart.tsx` — 그래프 카드 헤더에 새로고침 버튼 추가
  - Props 추가: `quota: SnapshotRefreshQuota`, `refreshing: boolean`, `onRefresh: () => void`
  - 헤더 레이아웃을 `titleRow`(제목+버튼) + `periodSelector`(기간 탭)로 재구성
  - 새로고침 버튼: `↻ N/3` 형태 표시, 로딩 중엔 `ActivityIndicator`로 교체
  - `remaining <= 0` 또는 `refreshing || loading`일 때 버튼 비활성화(색상 흐림, `disabled={true}`)
  - 횟수 소진 시 카드 하단에 `exhaustedBanner` 안내 문구 표시

- `app/screens/DashboardScreen.tsx` — useSnapshotRefresh 훅 연결 및 그래프 즉시 갱신
  - `useSnapshotRefresh` 훅 import 및 초기화
  - `refreshedTodaySnapshot` 상태 추가: 새로고침 응답의 당일 스냅샷 보관
  - `snapshots` 파생 값(`useMemo`): `baseSnapshots` + `refreshedTodaySnapshot` 오버레이(오늘 날짜 행 교체 또는 말미 추가)
  - `handleGraphRefresh` 콜백: `allHoldings`에서 MarketPriceItem 재구성 후 `handleSnapshotRefresh` 호출
  - 새로고침 에러 배너(`refreshError`) 별도 추가, 닫기 버튼으로 `clearRefreshError` 연결
  - `AssetHistoryChart`에 `quota`, `refreshing`, `onRefresh` props 전달

## UI 레퍼런스 매핑

`ui/dashboard/code.html` → `app/components/AssetHistoryChart.tsx`
- HTML의 기간 탭 셀렉터(`.flex.bg-surface-container-low.rounded-lg`) 패턴을 기존 `periodSelector` 스타일로 유지
- 새로고침 버튼은 `ui/dashboard/code.html`에 별도 레퍼런스 없음 → 기존 카드 헤더 디자인 시스템(`#eff4ff` 배경, `#003ec7` 텍스트)과 일관되게 pill 형태로 설계

## 특이사항

### 렌더링 최적화 원칙 준수 (CLAUDE.md)
- `snapshotRefreshing` 상태는 `useSnapshotRefresh` 내부에 격리되어 있어 새로고침 중에도 기존 그래프(`snapshots`)가 유지됨
- `snapshots`는 `useMemo`로 계산되는 파생 데이터 — `baseSnapshots` 마스터를 그대로 두고 `refreshedTodaySnapshot`이 세팅될 때만 오버라이드 적용
- `quota` 상태가 변경되어도 `AssetHistoryChart`는 `memo()`로 감싸져 있어 props가 변경된 경우에만 리렌더링
- `handleGraphRefresh`는 `useCallback`으로 안정화되어 불필요한 자식 리렌더링 방지

### 새로고침 버튼 비활성화 조건
- `quota.remaining <= 0` — 일 3회 소진
- `snapshotRefreshing === true` — API 호출 중 중복 방지
- `historyLoading === true` — 그래프 초기 로딩 중에는 비활성화

### 쿼터 재동기화 타이밍
- 초기 마운트 시 1회 조회
- AppState `background/inactive → active` 전환 시 재조회 (하루 자정 이후 새 날짜로 리셋된 쿼터 반영)
- 새로고침 성공 시 응답의 `quota` 값으로 즉시 반영 (재조회 불필요)
- 새로고침 실패 시 `getSnapshotRefreshQuota` 재조회 (429 등 서버 상태와 클라이언트 불일치 해소)

### BE 트랙 파일 수정 없음
- `app/services/dashboard.ts`, `app/types/dashboard.ts` — import만 사용, 수정 없음
