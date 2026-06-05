# 프론트엔드 구현 내역

## 새로 만든 컴포넌트

- `app/components/StockDetailSheet.tsx` — 종목 상세 바텀시트. ticker + market으로 `getStock` 조회 후 `getSectorBreadcrumb` RPC로 섹터 breadcrumb 표시(L1→L4 계층). 섹터 보정 버튼 탭 시 cascading select(L1→L2→L3→L4) UI로 전환하여 `updateStockSector` 저장. `assetTypeToMarket` 변환 유틸 함수 포함(DashboardScreen에서 import).

## 수정한 파일

- `app/components/MemoFilter.tsx` — 섹터 행(3행) 변경: 플랫 칩 나열 → L1 아코디언 탐색. L1 칩은 선택 영역(좌)과 펼침 버튼(우, ▼/▲)으로 분리. L1 탭 시 하위 L2 칩이 4행으로 펼쳐짐(한 번에 하나만 열림, accordion). L1/L2 선택 모두 `sectorIds`에 OR 결합. `onExpandL1` 콜백으로 부모에게 L2 지연 로딩 트리거. props 변경: `sectors` → `l1Sectors`, `l2SectorMap`, `onExpandL1` 추가. `Sector` 타입 import 경로를 `types/memo` → `types/sector`로 변경.

- `app/screens/MemoListScreen.tsx` — `getSectors` import를 `services/sectors`로 변경, `{ level: 1 }` 파라미터 추가(L1만 로드). `l2SectorMap(Map<number, Sector[]>)` 상태와 `loadedL1IdsRef` 추가. `handleExpandL1` 콜백: L1 펼침 시 `getSectors({ level: 2, parent_id })` 지연 로딩(이미 로딩된 L1은 재요청 안 함). MemoFilter에 `l1Sectors`, `l2SectorMap`, `onExpandL1` props 전달.

- `app/components/StockSearchModal.tsx` — `SectorPicker`(단순 목록) → `CascadingSectorPicker`(L1→L2→L3→L4 순차)로 교체. 각 레벨 선택 시 `getSectors({ level, parent_id })` 호출. 하위 항목 없으면 현재 선택으로 확정 버튼 표시. L4 항목 탭 시 즉시 확정. `handleExternalSelect`의 `naver_industry` → `yfinance_sector/yfinance_industry` 수정(이슈 016). `getSectors` import 추가.

- `app/screens/MemoEditScreen.tsx` — `getSectors` import를 `services/sectors`로 변경, `{ level: 1 }` 파라미터 추가(메모 연결 섹터는 L1 단위). `Sector` 타입 import 경로를 `types/sector`로 변경.

- `app/screens/DashboardScreen.tsx` — `StockDetailSheet`, `assetTypeToMarket` import 추가. `selectedHolding` 상태 추가. HoldingCard를 `TouchableOpacity`로 감싸서 탭 시 `StockDetailSheet` 오픈. `handleHoldingPress`, `handleStockDetailClose`, `handleSectorUpdated` 핸들러 추가.

## UI 레퍼런스 매핑

이슈 018에는 `ui/` 디렉토리 레퍼런스 파일이 없어 PRD-004 §7 기술 명세를 직접 반영.

## 특이사항

### 섹터 행 아코디언 구현
L1 칩을 선택 영역(왼쪽, 탭 시 sectorIds에 추가)과 펼침 버튼(오른쪽 ▼/▲)으로 분리했다. 선택과 펼침을 분리한 이유: L1 선택 없이 L2만 선택하거나, L1은 선택하지 않고 L2 목록만 탐색하는 사용 패턴을 지원하기 위함. L1 자체를 sectorIds에 넣으면 서버에서 해당 L1 하위 모든 종목이 필터 대상이 됨(list_memos RPC 동작).

### L2 지연 로딩 설계
L2 목록을 `MemoFilter` 내부가 아닌 `MemoListScreen`에서 관리한다. `MemoFilter`는 순수하게 UI 렌더링에 집중하고, 데이터 페칭 로직은 부모(화면 컴포넌트)가 소유. `loadedL1IdsRef`로 이미 로딩한 L1은 재요청하지 않는다.

### StockDetailSheet의 breadcrumb 표시
`getStock(ticker, market)` → `sector_id` 취득 → `getSectorBreadcrumb(sectorId)` 순서로 2회 호출. 들여쓰기(marginLeft: idx * 8)를 이용해 계층 깊이를 시각화. L1 레벨 배지로 계층 위치를 명확히 표시.

### cascading select 공통 패턴
`StockSearchModal`의 `CascadingSectorPicker`와 `StockDetailSheet`의 `CascadingPicker`가 동일한 패턴. 두 컴포넌트가 독립적으로 L1~L4 목록을 로드하며, 하위에 항목이 없으면 현재 선택으로 확정할 수 있는 버튼을 표시.

### MemoEditScreen 섹터 연결
기존에는 sectors 테이블 전체(GICS 273개)를 칩으로 나열했는데, `{ level: 1 }` 파라미터로 L1(11개)만 표시하도록 변경. 메모-섹터 연결에는 L1 단위 선택으로 충분하며, 서버 RPC에서 하위 계층 종목까지 포함하여 필터링함.
