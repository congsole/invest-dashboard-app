# 프론트엔드 구현 내역 — 이슈 008

## 새로 만든 컴포넌트

- `app/components/KpiCardSection.tsx` — KPI 카드 섹션 (1차 행 3개 큰 카드 + 2차 행 4개 작은 카드). 순수익 +/- 색상 구분, 예수금 "₩XXX + $YYY ≈ ₩ZZZ" 포맷. `memo` 적용.
- `app/components/AccountEventBottomSheet.tsx` — 계정 이벤트 바텀시트 (1단계: 타입 선택 + CSV 업로드, 2단계: 타입별 폼 라우팅). 기존 `NewTradeEventSheet` 대체.
- `app/components/forms/BuySellEventForm.tsx` — 매수/매도 공통 입력 폼 (자산유형, 종목, 날짜, 수량, 체결가, 수수료, 세금, 정산금액 자동계산).
- `app/components/forms/DepositWithdrawEventForm.tsx` — 입금/출금 입력 폼 (날짜, 통화 KRW/USD, 금액, 환율).
- `app/components/forms/DividendEventForm.tsx` — 배당 수령 입력 폼 (날짜, 종목(선택), 통화, 금액(세후), 원천징수 세금, 환율).

## 새로 만든 타입/서비스

- `app/types/accountEvent.ts` — AccountEvent 도메인 타입 전체 정의 (EventType, 5종 Input 타입, CsvPreviewRow/Result/ConfirmResult, AccountEventFilters). api-spec.md 기반.
- `app/services/accountEvents.ts` — account_events CRUD 서비스 함수 (getAccountEvents, createAccountEvent, updateAccountEvent, deleteAccountEvent, parseAccountCsv, confirmAccountCsv).

## 수정한 파일

### 타입
- `app/types/dashboard.ts` — 전면 재작성. KpiSummary, KpiCardData, DailySnapshot, HistoryMarker 신규 추가. HoldingCardData에 `current_price_orig` 추가(원 통화 현재가). Period에 `'all'` 추가. 기존 TradeEvent/PortfolioSummaryItem 등 @deprecated 처리.

### 서비스
- `app/services/dashboard.ts` — 전면 교체. `getKpiSummary` (get_kpi_summary RPC), `getDailySnapshots` (daily_snapshots REST), `getHistoryMarkers` (get_history_markers RPC), `periodToDateRange` 유틸 추가. 기존 함수 @deprecated 처리(하위 호환 유지).

### 훅
- `app/hooks/useDashboard.ts` — 전면 교체. KPI + 종목 카드 데이터를 get_kpi_summary 기반으로 재구성. fetchHistory가 getDailySnapshots + getHistoryMarkers를 병렬 호출. 렌더링 최적화 규칙 준수 (initialLoading/refreshing/historyLoading 분리).

### 컴포넌트
- `app/components/AssetHistoryChart.tsx` — 전면 교체. props를 `data/loading` → `snapshots/markers/loading/showCashLine`으로 변경. 3라인(평가액/원금/예수금) + 이벤트 마커 범례. Period에 '전체' 추가. 부문 선택 시 예수금 라인 숨김(`showCashLine` prop).
- `app/components/HoldingCard.tsx` — `current_price_orig` 추가로 원 통화 현재가/평균매수가 병기 표시 강화. 미국주식·코인에서 원 통화($) + KRW 환산 모두 표시. `memo` 적용.
- `app/components/CsvUploadSheet.tsx` — `confirmTradeCSV` → `confirmAccountCsv` 교체, `CsvPreviewRow` 타입을 accountEvent 기반으로 변경(event_type 5종, amount 필드). Mock 데이터에 deposit 케이스 추가.

### 화면
- `app/screens/DashboardScreen.tsx` — 전면 리팩토링. KpiCardSection 삽입. SectorAllocationPie 제거. useDashboard에서 kpi/snapshots/markers 수신. AssetHistoryChart props 변경. NewTradeEventSheet → AccountEventBottomSheet 교체. 탭 필터 클라이언트 사이드 처리 유지.

## UI 레퍼런스 매핑

- `ui/dashboard/code.html` → `app/screens/DashboardScreen.tsx`, `app/components/KpiCardSection.tsx`, `app/components/AssetHistoryChart.tsx`, `app/components/HoldingCard.tsx`
- `ui/new-trade-event/code.html` → `app/components/AccountEventBottomSheet.tsx`, `app/components/forms/BuySellEventForm.tsx`

## 컴포넌트 구조

```
DashboardScreen
├── SectorFilterTabs          (기존 유지)
├── KpiCardSection            (신규)
│   ├── PrimaryKpiCard ×3     (총평가액/원금/순수익)
│   └── SecondaryKpiCard ×4  (예수금/배당/수수료/세금)
├── AssetHistoryChart         (교체)
│   └── LineChart (gifted-charts) — 3라인
├── HoldingCard ×N            (원 통화 병기 업데이트)
└── AccountEventBottomSheet   (신규, NewTradeEventSheet 대체)
    ├── [1단계] 이벤트 타입 선택
    │   ├── CSV 업로드 버튼 → CsvUploadSheet
    │   ├── 매수/매도 강조 버튼
    │   └── 입금/출금/배당 버튼
    └── [2단계] 타입별 폼
        ├── BuySellEventForm (buy/sell)
        ├── DepositWithdrawEventForm (deposit/withdraw)
        └── DividendEventForm (dividend)
```

## 특이사항

### 렌더링 최적화 준수
- KpiCardSection, HoldingCard, AssetHistoryChart에 `React.memo` 적용.
- KpiCardSection 내부 PrimaryKpiCard/SecondaryKpiCard도 `memo`.
- useDashboard 훅: 탭 필터는 클라이언트 사이드(useMemo), 그래프만 fetchHistory 재호출.
- initialLoading(전체 스피너) / refreshing(pull-to-refresh) / historyLoading(섹션별) 3단계 로딩 상태 분리.

### get_kpi_summary 2단계 호출
- 현재가 없는 1차 호출로 holdings 목록 확보 → 현재가 조회 → 현재가 포함 2차 KPI 재계산.
- BE가 현재가 없이 holdings만 반환하는 경우에도 정상 동작.

### AssetHistoryChart minValue prop
- `react-native-gifted-charts`의 LineChart가 `minValue` prop을 지원하지 않아 제거.
- 라이브러리가 자동으로 Y축 범위를 조정함.

### 기존 파일 하위 호환
- `app/types/dashboard.ts`: 기존 TradeEventInput, PortfolioSummaryItem 등 @deprecated로 유지 (NewTradeEventSheet가 아직 참조).
- `app/services/dashboard.ts`: 기존 getDashboardPortfolioSummary, getAssetHistory, getSectorAllocation 빈 배열 반환으로 유지.
- `app/components/NewTradeEventSheet.tsx`: 삭제하지 않고 유지 (DashboardScreen은 AccountEventBottomSheet를 사용하므로 렌더링에서 제외됨).

### CSV 함수명 변경
- `parse-trade-csv` / `confirm-trade-csv` → `parse-account-csv` / `confirm-account-csv` (BE와 동기화).
- CsvUploadSheet에서 `confirmTradeCSV` → `confirmAccountCsv` 교체.

### Period 'all' 추가
- 기존 `'day' | 'week' | 'month' | 'year'`에 `'all'` 추가.
- periodToDateRange('all') → from: '2000-01-01', to: 오늘.
- AssetHistoryChart 기간 버튼에 '전체' 추가.
