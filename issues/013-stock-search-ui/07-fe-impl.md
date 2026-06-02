# 프론트엔드 구현 내역

## 새로 만든 컴포넌트

- `app/components/StockSearchModal.tsx` — 종목 검색 모달 컴포넌트
  - 검색어 2자 이상 → 로컬 DB 검색 (디바운스 300ms, `useStockSearch` 훅 사용)
  - 로컬 결과 0건 → 외부 FastAPI 검색 자동 전환
  - 외부 검색 결과에 "추가" 칩 표시 (초록 배지)
  - 로컬/외부 결과 각각 `LocalResultItem` / `ExternalResultItem` 분리 컴포넌트 (React.memo)
  - 종목 선택 후 `sector_id === null`이면 섹터 선택 단계(`sector-pick`)로 전환
  - 섹터 선택 또는 건너뛰기 후 `onSelect` 콜백으로 최종 결과 전달
  - 외부 종목 선택 시 `getOrRecommendStockSector` RPC로 등록 처리 (등록 중 스피너)
  - `ModalPhase`: `'search' | 'sector-pick' | 'registering'` 3단계 플로우
  - `SectorInfo` 별도 타입 정의 (Sector의 `code: SectorCode` 대신 `code: string` 사용 — API 응답 직접 할당 가능)

## 새로 만든 훅

- `app/hooks/useStockSearch.ts` — 종목 검색 훅
  - 검색어 변경 시 디바운스 300ms 후 `searchStocks()` 호출
  - `source: 'local' | 'external' | null`로 결과 출처 구분
  - 로딩 상태: `localLoading` / `externalLoading` 분리 (기존 결과 유지)
  - `reset()` 으로 모달 닫힐 때 상태 초기화
  - unmount 안전 처리 (`isMounted` ref)

## 수정한 파일

- `app/screens/MemoEditScreen.tsx`
  - 내부 인라인 `StockSearchModal` (구 버전) 제거
  - 새 `StockSearchModal` 컴포넌트 import 및 적용
  - `SelectedStockInfo` 타입 기반으로 `handleStockSelect` 콜백 수정
  - `SelectedStock` 인터페이스에 `sector_id` 필드 추가
  - 불필요한 import 정리 (`Modal`, `FlatList`, `Stock`, `searchStocks`)

## UI 레퍼런스 매핑

ui/ 폴더에 종목 검색 관련 HTML 레퍼런스가 없으므로, 기존 앱 컴포넌트 스타일 패턴(`#f8f9ff` 배경, `#003ec7` 파랑, `#dce9ff` 연청)을 따라 구현.

## 특이사항

### 타입 설계
- `Sector` 타입의 `code`가 `SectorCode` (union string literal)로 좁혀져 있어, API 응답(`string`)을 직접 할당 불가.
- `StockSearchModal` 내부에서 `SectorInfo { id: number; code: string; name: string }`를 별도 정의하여 해결.
- `Sector`는 `SectorInfo`의 서브타입이므로 `getSectors()` 반환값(`Sector[]`)을 `SectorInfo[]`에 안전하게 할당 가능.

### 로딩 상태 최소화
- 검색 중에도 기존 결과 목록을 유지하고 입력란 옆에 소형 스피너만 표시 (CLAUDE.md 원칙 준수).
- 전체 화면 로딩 스피너는 외부 종목 등록 중(`registering` 단계)에만 사용.

### 렌더링 최적화
- `LocalResultItem`, `ExternalResultItem`, `SectorPicker` 모두 `React.memo`로 감쌈.
- `handleLocalSelect`, `handleExternalSelect`, `handleSectorPick` 등 콜백은 `useCallback` 적용.
- 로컬 결과 중 이미 선택된 종목 제외 필터는 `useMemo`로 파생 데이터 처리.

### 외부 종목 등록 흐름
- 외부 종목 선택 시 `getOrRecommendStockSector` RPC 호출 (FastAPI service_role 경유 upsert 후 결과 반환).
- RPC 실패 시 에러 토스트 없이 조용히 검색 화면으로 복귀 (치명적이지 않은 경로).
