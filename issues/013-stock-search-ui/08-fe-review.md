# 프론트엔드 코드 리뷰

## Initial Review
**결과**: 이슈 2건

**이슈 목록**
- [mid] `app/components/StockSearchModal.tsx`: `registering` boolean 상태가 `phase === 'registering'`과 중복. `phase` 상태만으로 등록 중 여부를 충분히 표현할 수 있으므로 `registering` state는 불필요한 중복 상태임.
- [low] `app/hooks/useStockSearch.ts`: `externalLoading` 필드가 항상 `false`인 데드 상태. `searchStocks()` 서비스 함수가 로컬+외부 검색을 통합 처리하므로 외부 검색 전용 로딩 상태를 훅에서 분리 관리할 수 없음. 훅 반환 인터페이스에 의미 없는 필드가 노출됨.

**검토 항목 전체 결과**
- UI: ui/ 레퍼런스 없음. 기존 앱 스타일 패턴(`#f8f9ff`, `#003ec7`, `#dce9ff`) 일관 적용. DESIGN.md 의도 부합.
- TypeScript: `any` 사용 없음. props 타입 모두 명시됨. `SectorInfo` 별도 정의로 `Sector.code: SectorCode` 좁힘 타입 문제를 올바르게 회피.
- API 연동: `searchStocks()`, `getOrRecommendStockSector()`, `getSectors()` 모두 올바르게 호출. 서비스 함수 시그니처와 일치.
- 상태 관리: 로딩(`localLoading`) / 에러(`error`) / 단계(`phase`) 분리. 기존 결과 유지하며 소형 스피너 표시. CLAUDE.md 원칙 준수.
- 스타일: `StyleSheet.create()` 사용. 인라인 스타일 없음.
- RN 규칙: 웹 전용 API 사용 없음.
- 렌더링 최적화: `LocalResultItem`, `ExternalResultItem`, `SectorPicker` 모두 `React.memo`. 콜백은 `useCallback`. 파생 데이터(`filteredLocalResults`)는 `useMemo`. 원칙 준수.
- 기능 요구사항: 검색어 2자 이상 → 디바운스 300ms ✓. 로컬 0건 → 외부 자동 전환 ✓. 외부 결과에 "추가" 칩 ✓. 섹터 null → 섹터 선택 드롭다운 ✓. 섹터 건너뛰기 ✓.
- MemoEditScreen 통합: 인라인 모달 제거, `StockSearchModal` + `SelectedStockInfo` 콜백으로 교체 완료.

## Cycle 1
**수정 내용**
- `app/components/StockSearchModal.tsx`: `registering` state 제거. `handleExternalSelect` 내 `setRegistering(true)` / `finally { setRegistering(false) }` 제거. `phase` 상태만으로 등록 중 표현.
- `app/hooks/useStockSearch.ts`: `StockSearchState` 인터페이스에서 `externalLoading` 필드 제거. `INITIAL_STATE` 및 모든 `setState` 호출에서 `externalLoading` 제거. 주석 업데이트.

**Confirmation 결과**: 합격

**확인 사항**
- `externalLoading` 제거 후 `StockSearchModal.tsx`에서 destructure하지 않았으므로 사용처 영향 없음.
- `registering` 제거 후 catch 블록의 `setPhase('search')` 복귀 경로 정상 유지됨. sector-pick / onClose 성공 경로도 영향 없음.
- 새로운 이슈 없음.

## 최종 결과
합격
