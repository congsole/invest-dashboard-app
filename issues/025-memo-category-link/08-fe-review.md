# 프론트엔드 코드 리뷰

## Initial Review
**결과**: 이슈 2건

**이슈 목록**
- [심각도: mid] MemoFilter.tsx: 카테고리 칩 onPress에 인라인 화살표 함수 사용 → FilterChip이 React.memo로 감싸져 있어도 매 렌더마다 새 참조가 생성되어 메모이제이션 무력화. 기존 L1SectorChip / L2SectorChip / SelectedStockChip은 모두 id를 props로 받아 내부 useCallback으로 안정화하는 패턴을 사용하는데 카테고리 칩만 인라인 함수 방식으로 구현되어 일관성 위반.
- [심각도: low] MemoEditScreen.tsx: `selectedCatCount` 불필요한 중간 변수. `selectedCategoryIds.length`의 alias로만 쓰이고 메모이제이션 없이 렌더마다 재계산. 기존 selectedSectorIds가 useMemo로 파생되는 패턴과 일관성 없음.

## Cycle 1
**수정 내용**
- MemoFilter.tsx: `CategoryFilterChip` 컴포넌트 추가 (React.memo + useCallback 패턴). categoryId, categoryName을 props로 받아 내부에서 핸들러를 안정화. categories.map의 인라인 함수 제거하고 CategoryFilterChip으로 교체.
- MemoEditScreen.tsx: `selectedCatCount` 변수 제거. JSX에서 `selectedCategoryIds.length`를 직접 인라인 참조로 변경.

**Confirmation 결과**: 합격

수정으로 인한 새로운 이슈 없음.
- CategoryFilterChip이 기존 SelectedStockChip, L2SectorChip과 동일한 패턴으로 구현됨
- handleToggleCategory가 useCallback으로 안정화되어 있으므로 CategoryFilterChip → FilterChip 전체 체인에서 불필요한 리렌더링 방지

## 최종 결과
합격
