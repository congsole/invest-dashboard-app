# 프론트엔드 구현 내역

## 새로 만든 파일
- `app/hooks/useSectorSearch.ts` — 섹터 키워드 검색 훅

## 수정한 파일
- `app/services/sectors.ts` — `getAllSectorsWithCache()` 추가
- `app/components/CascadingSectorPicker.tsx` — 검색 입력 필드 및 검색 결과 리스트 추가
- `app/components/StockSearchModal.tsx` — 내부 `CascadingSectorPicker`에 검색 기능 추가 (useSectorSearch 통합)

---

## 각 파일 주요 변경 내용

### `app/services/sectors.ts`
- 모듈 레벨 변수 `_sectorCache: Sector[] | null` 추가
- `getAllSectorsWithCache()`: 캐시가 있으면 즉시 반환, 없으면 `getSectors()` 전체 로드 후 캐시

### `app/hooks/useSectorSearch.ts` (신규)
- `getAllSectorsWithCache()`로 전체 섹터 1회 로드 (초기 마운트 시)
- `setQuery()` 내부에서 300ms 디바운스 후 클라이언트 사이드 필터링 실행
- 필터링 조건: `name`(한글) + `name_en`(영문) 부분 일치, 공백 무시, 대소문자 무시, 2글자 이상
- `buildBreadcrumb()`: `parent_id` 체인으로 [L1, L2?, L3?, L4?] 경로 구축 (Map으로 O(1) 조회)
- 결과 정렬: 레벨 오름차순 → 이름 가나다순
- 반환: `query`, `setQuery`, `clearQuery`, `results`, `loading`, `error`, `isSearchMode`

### `app/components/CascadingSectorPicker.tsx`
추가된 컴포넌트:
- `SectorSearchBar` — 검색 입력 필드 (placeholder: "섹터 검색...", 우측 X 버튼)
- `BreadcrumbText` — 경로 텍스트 렌더링 (마지막 항목: 볼드 + #003ec7)
- `SearchResultItemMulti` — 검색 결과 항목 (멀티 선택 모드, 선택 상태 강조)
- `SearchResultItemSingle` — 검색 결과 항목 (단일 선택 모드)
- `SearchResultListMulti` — 검색 결과 리스트 (로딩/에러/빈 결과 처리 포함)
- `SearchResultListSingle` — 검색 결과 리스트 (단일 선택)

`CascadingSectorMultiPicker` 변경:
- `useSectorSearch` 훅 연결
- `SectorSearchBar` 최상단에 추가
- `isSearchMode`가 true이면 cascading UI 숨기고 `SearchResultListMulti` 표시
- 검색 결과 탭 시 기존 `onToggle` 그대로 호출

`CascadingSectorPicker` 변경 (단일 선택):
- 동일한 방식으로 `SectorSearchBar` + `SearchResultListSingle` 추가
- 검색 결과 탭 시 즉시 `onConfirm` 호출

---

## UI 레퍼런스 매핑
- UI 레퍼런스 파일 없음 — PRD-005-sector-search.md 명세 직접 구현

---

## 주요 구현 결정 사항

1. **`useSectorSearch` 훅 분리**: 검색 로직(로드, 디바운스, 필터링, breadcrumb)을 훅으로 분리하여 두 Picker 컴포넌트에서 공통 사용. 각 컴포넌트가 독립적인 훅 인스턴스를 가지므로 상태 격리됨.

2. **`sectorMap` (Map<id, Sector>)**: 전체 섹터 로드 시 한 번만 생성하여 `buildBreadcrumb` 내 parent 탐색을 O(1)으로 처리. ref로 관리하여 리렌더링 없이 유지.

3. **검색 결과 스크롤**: `SearchResultListMulti/Single`은 `View + gap` 구조로 렌더링. 부모(`MemoEditScreen`의 `ScrollView`)가 스크롤을 담당하므로 중첩 스크롤 없이 자연스럽게 동작.

4. **`isSearchMode` 조건**: `query.trim().replace(/\s/g, '').length >= 2`로 판단. 실제 필터링과 동일한 기준을 사용하여 검색 모드 진입 기준 일치.

5. **`StockSearchModal` 내부 `CascadingSectorPicker` 직접 수정**: `StockSearchModal.tsx`는 `app/components/CascadingSectorPicker.tsx`를 import하지 않고 로컬에 별도 구현(`onPick/onSkip` 인터페이스)을 보유한다. 이 로컬 컴포넌트에도 `useSectorSearch`를 직접 통합하여 검색 입력 필드와 검색 결과 렌더링을 추가했다. cascadeStyles에 검색 관련 스타일 추가.
