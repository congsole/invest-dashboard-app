# 프론트엔드 구현 내역

## 새로 만든 컴포넌트

- `app/components/TradeEventSelectModal.tsx` — 매매이벤트 선택 모달. buy/sell 이벤트 목록 최신순 나열, 텍스트 검색(디바운스), 기간 필터, 복수 선택/체크 UI, 선택된 이벤트 칩 표시, 완료 콜백.

## 새로 만든 훅

- `app/hooks/useTradeEventSearch.ts` — 매매이벤트 검색 훅. getTradeEvents 호출, 디바운스 300ms, 기간 필터는 클라이언트 사이드 처리(allEvents + useMemo filteredEvents), initialLoading/searching 분리.

## 수정한 파일

- `app/services/accountEvents.ts`
  - `TradeEventFilters` 인터페이스 추가 (`q`, `from`, `to`)
  - `getTradeEvents(filters?)` 함수 추가: `in('event_type', ['buy', 'sell'])`, `order('event_date', { ascending: false })`, `or('name.ilike.%q%,ticker.ilike.%q%')`, 기간 gte/lte 체이닝

- `app/screens/MemoEditScreen.tsx`
  - 주석 [026] 추가
  - `TradeEventSelectModal` import 추가
  - `selectedTradeEvents: SelectedTradeEvent[]` 상태 추가
  - `tradeEventModalVisible: boolean` 상태 추가
  - 편집 모드 초기화 (`useEffect`): `memo_trade_events` → `SelectedTradeEvent[]` 변환하여 `setSelectedTradeEvents` 호출
  - `handleSave`: `p_trade_event_ids: null` 고정 → `selectedTradeEvents.map(te => te.id)` 로 실제 전달 (create/update 모두)
  - UI: 종목 연결 섹션과 섹터 연결 섹션 사이에 "매매이벤트 연결" 섹션 삽입 — 빈 상태 힌트 / 선택된 이벤트 칩 목록 / + 추가·편집 버튼
  - `TradeEventSelectModal` 렌더링 추가: `initialSelectedIds`, `seedQuery`(연결 종목명 시드), `onConfirm` 연결
  - 스타일: `tradeEventChipList`, `tradeEventChip`, `tradeEventTypeDot`, `tradeEventChipText`, `tradeEventChipRemove` 추가

## UI 레퍼런스 매핑

- `ui/` 레퍼런스 없음 — 기존 종목/섹터 연결 섹션 패턴을 그대로 따름

## 특이사항

### 1. MemoDetail에서 quantity/price_per_unit 미포함 문제
`getMemo` 쿼리(`app/services/memo.ts`)에서 `memo_trade_events`는 `event_id, account_events(id, event_type, event_date, ticker, name)`만 select한다. 편집 모드에서 기존 연결 이벤트를 복원할 때 quantity/price_per_unit은 null로 채워진다. 이는 칩 라벨에만 영향을 미치며(종목명·날짜·타입만 표시), 저장 로직에는 영향 없음.

### 2. TradeEventSelectModal의 initialSelectedIds 처리
모달이 열릴 때 `initialSelectedIds`에 해당하는 이벤트를 `filteredEvents`에서 찾아 `selectedMap`을 구성한다. 검색/기간 필터로 인해 `filteredEvents`에 없는 이벤트도 id만으로 보존하여 선택 해제 전까지 유지된다.

### 3. CLAUDE.md 렌더링 최적화 준수
- `useTradeEventSearch` 내에서 `allEvents`(마스터) / `filteredEvents`(파생, useMemo) 명확히 분리
- 기간 필터는 서버 재호출 없이 클라이언트 필터
- 텍스트 검색만 서버 재호출 (디바운스 300ms)
- `initialLoading` / `searching` 분리하여 기존 목록 유지

### 4. 편집 화면 매매이벤트 연결 버그 수정
기존 편집 화면에서 `p_trade_event_ids: null`로 고정되어 매매이벤트 변경이 불가했던 문제를 `selectedTradeEvents.map(te => te.id)` 실제 전달로 수정. `update_memo_with_links`에서 null이면 변경 없음, 배열이면 해당 배열로 교체하는 스펙이므로 기존 연결을 초기화 후 선택된 이벤트로 재연결한다.

### 5. 선택 시드 (PRD §6.4)
`seedQuery={selectedStocks.length > 0 ? selectedStocks[0].name : undefined}` — 종목이 연결된 메모에서 모달 열기 시 첫 번째 종목명이 검색어로 시드됨. `useTradeEventSearch(seedQuery)`는 초기 로드 시 해당 검색어로 서버 조회 후, 사용자가 검색어를 지우면 전체 목록 재조회.
