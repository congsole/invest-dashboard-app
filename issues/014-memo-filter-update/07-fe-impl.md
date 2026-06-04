# 프론트엔드 구현 내역

## 수정한 파일

### app/types/memo.ts
- `ListMemosParams` 인터페이스 변경
  - `p_stock_id: string | null` → `p_stock_ids: string[] | null` (배열)
  - `p_include_trade_events: boolean` 제거
  - `p_sector_id: number | null` → `p_sector_ids: number[] | null` (배열)
- `MemoFilterState` 인터페이스 변경
  - `stockId: string | null`, `stockName: string | null` → `stockIds: string[]`, `stockNames: string[]` (복수 선택)
  - `includeTradeEvents: boolean` 제거
  - `sectorId: number | null`, `sectorName: string | null` → `sectorIds: number[]`, `sectorNames: string[]` (복수 선택)
- `DEFAULT_FILTER_STATE` 업데이트 (배열 초기값 `[]` 반영)

### app/services/memo.ts
- `listMemos` 함수 내 RPC 파라미터 업데이트
  - `p_stock_id` → `p_stock_ids`
  - `p_include_trade_events` 제거
  - `p_sector_id` → `p_sector_ids`

### app/components/MemoFilter.tsx
- "직접 연결만 보기" 토글 UI 완전 제거 (`subToggleRow`, toggle 관련 스타일 삭제)
- `handleToggleIncludeTradeEvents` 핸들러 제거
- `handleClearStock` 핸들러 제거 → 개별 종목 해제로 대체
- `SelectedStockChip` 컴포넌트 신규 추가: 선택된 종목별 칩 표시, 개별 ✕ 해제
- `SectorFilterChip` props 변경: `onToggle(sectorId, sectorName)` → `onToggle(sectorId)` (이름은 내부에서 sectors 배열로 조회)
- 종목 필터: 기존 단일 선택 칩 → 복수 선택 칩 목록 + "종목 추가" 버튼
- 섹터 필터: `filter.sectorId === sec.id` → `filter.sectorIds.includes(sec.id)` (복수 선택)
- "매매이벤트 연관" → "매매 연관" 레이블 변경
- `handleToggleNoLinks`: noLinks 활성화 시 stockIds/sectorIds/tradeEventsOnly/newsOnly 자동 초기화 (상호 배타적)
- `handleClearAll`: 새 필드명(`stockIds`, `stockNames`, `sectorIds`, `sectorNames`) 반영

### app/screens/MemoListScreen.tsx
- `filterToParams` 함수 업데이트
  - `p_stock_id` → `p_stock_ids` (빈 배열이면 null 전달)
  - `p_include_trade_events` 제거
  - `p_sector_id` → `p_sector_ids` (빈 배열이면 null 전달)
- `handleStockSelect` 핸들러 변경
  - 단일 선택 → 복수 선택 추가 방식
  - 이미 선택된 종목 중복 추가 방지
  - noLinks 자동 해제

## UI 레퍼런스 매핑
- UI 레퍼런스 파일 없음 (기존 화면 수정)

## 특이사항

### 복수 선택 구현 방식
- 종목/섹터 각각 `ids: string[] | number[]`, `names: string[]` 두 배열을 병렬로 관리
- 인덱스 일치 보장: 추가 시 동시에 push, 제거 시 `filter((_, i) => i !== idx)` 패턴 사용
- `MemoFilterState`에 names 배열을 함께 두어 표시용 이름을 서버 재조회 없이 제공

### noLinks 상호 배타적 동작
- "연결 없음" 칩 활성화 시 stockIds/sectorIds를 빈 배열, tradeEventsOnly/newsOnly를 false로 초기화
- 다른 필터 활성화 시 noLinks를 false로 초기화 (기존 동작 유지)

### 렌더링 최적화 유지
- `SelectedStockChip`, `SectorFilterChip`에 `React.memo` 적용
- `handleRemoveStock`, `handleToggleSector`, `SelectedStockChip.handlePress` 등 `useCallback`으로 안정화
- 필터 상태 변경은 `MemoFilter` 내부에서 처리하여 불필요한 상위 리렌더링 최소화
