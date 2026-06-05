# 프론트엔드 코드 리뷰

## Initial Review

**결과**: 이슈 2건

**이슈 목록**

- [심각도: mid] `app/components/MemoFilter.tsx`: L1 칩 펼침 버튼 탭 후 L2 로딩 중 피드백 없음. `handleExpandL1` 콜백이 비동기로 실행되는 동안 `l2SectorMap`에 key가 없어 `L2Row`가 조건(`expandedL2Sectors.length > 0`)을 만족하지 못해 렌더링되지 않는다. 사용자는 펼침 버튼을 눌렀는데 아무 반응이 없는 것처럼 보인다.
- [심각도: low] `app/components/MemoFilter.tsx`: `L1SectorChip` selected 상태에서 outer wrapper의 `borderColor`가 기본색(`#c3c5d9`)으로 유지된다. 내부 칩/버튼이 파란색으로 바뀌지만 wrapper border는 그대로라 미세한 시각적 불일치가 있다.

**기능 정확성 검토 결과**

- 메모 필터 L1→L2 아코디언: 구현 정확. accordion 패턴(한 번에 하나만 펼침), L1/L2 OR 결합, `onExpandL1` 콜백 분리 모두 정상.
- `get_sector_breadcrumb` RPC 호출: `getStock` → `sector_id` → `getSectorBreadcrumb` 순서 정확. catch 블록 분리(breadcrumb 실패 시 종목 정보는 유지)도 올바름.
- Cascading select (L1→L4): `CascadingPicker`(StockDetailSheet)·`CascadingSectorPicker`(StockSearchModal) 모두 동일한 패턴. `confirmable` 로직(`selectedL3 ?? selectedL2 ?? selectedL1`)과 `canConfirmAtLN` 조건 정확.
- `naver_industry` → `yfinance_sector/yfinance_industry` 전환: `StockSearchModal.handleExternalSelect`, `GetOrRecommendStockSectorInput`, RPC 파라미터(`p_yfinance_sector`, `p_yfinance_industry`) 모두 완전히 전환됨.

**CLAUDE.md 렌더링 최적화 준수 여부**

- 초기 로딩만 전체 스피너 사용, 재조회 시 기존 콘텐츠 유지: 준수.
- UI 필터 클라이언트 사이드 처리 (`filteredHoldings` useMemo): 준수.
- `React.memo`, `useCallback`, `useMemo` 적극 활용: 준수. `L1SectorChip`, `L2SectorChip`, `L2Row`, `PickerLevel`, `LocalResultItem`, `ExternalResultItem` 등 전부 memoized.
- 상태 영향 범위: `expandedL1Id`를 `MemoFilter` 내부에서 관리하고, 데이터 페칭(l2SectorMap)만 부모로 분리. 적절함.

**TypeScript / 코드 품질**

- `any` 사용 없음. 모든 타입 명시적으로 선언됨.
- `assetTypeToMarket('crypto')` → `'CRYPTO'` 변환 정확. `StockMarket` 타입과 일치.
- `StockDetailSheet`에서 `stock`이 null일 때 섹터 breadcrumb 섹션도 렌더링되는데, "보정" 버튼은 `stock && (...)`으로 조건부 렌더링되어 null 참조 방지 정확.
- `handleSectorUpdated` 콜백이 빈 함수: 현재 `HoldingCard`에 섹터가 표시되지 않으므로 리프레시 불필요. 추후 섹터 표시 추가 시 `refetch()` 호출 필요.

---

## Cycle 1

**수정 내용**

- `app/components/MemoFilter.tsx`:
  1. `ActivityIndicator` import 추가.
  2. `L2Row` props에 `loading: boolean` 추가. 로딩 중이면 `l2RowLoading` 스타일의 스피너를 렌더링.
  3. `styles.l2RowLoading` 스타일 추가 (`justifyContent: 'center', paddingVertical: 8`).
  4. `isL2Loading` 파생 상태 추가: `expandedL1Id !== null && !l2SectorMap.has(expandedL1Id)`.
  5. 4행 조건 변경: `expandedL2Sectors.length > 0` → `isL2Loading || expandedL2Sectors.length > 0`.
  6. `L1SectorChip` wrapper에 selected 시 `borderColor: ENTITY_COLORS.sector` 인라인 스타일 추가.

**Confirmation 결과**: 합격

수정 후 재검토:
- L2 로딩 중 `isL2Loading === true`면 `L2Row`가 스피너를 표시하고, 로딩 완료 후 칩 목록으로 전환.
- selected L1의 wrapper border가 내부 칩과 동일한 파란색으로 표시됨.
- 새로운 이슈 없음.

---

## 최종 결과

**합격**
