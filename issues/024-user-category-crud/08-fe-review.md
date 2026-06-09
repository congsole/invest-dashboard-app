# 프론트엔드 코드 리뷰

## Initial Review
**결과**: 이슈 2건

**이슈 목록**
- [mid] CategoryManageScreen.tsx: `renderEmptyList`가 일반 함수로 선언되어 `FlatList`의 `ListEmptyComponent` prop으로 전달 시 렌더마다 새 참조 생성. `useCallback`으로 안정화 필요.
- [mid] CategoryStocksScreen.tsx: 동일하게 `renderEmptyList`가 일반 함수로 선언되어 `useCallback` 누락.

## Cycle 1
**수정 내용**
- `CategoryManageScreen.tsx`: `renderEmptyList`를 `useCallback(() => {...}, [initialLoading])`으로 변경.
- `CategoryStocksScreen.tsx`: `renderEmptyList`를 `useCallback(() => {...}, [initialLoading])`으로 변경.

**Confirmation 결과**: 합격

## 최종 결과
합격

---

## 검토 메모

### 합격 판정 근거

**렌더링 최적화 (CLAUDE.md 기준)**
- `CategoryRow`, `StockRow`: `React.memo`로 분리 완료. 내부에서 `handlePress`, `handleLongPress`, `handleRemove`를 `useCallback`으로 안정화.
- 부모 핸들러(`onCategoryPress`, `handleLongPress`, `handleRemoveStock` 등): 모두 `useCallback` 적용.
- `excludeIds`: `useMemo(() => stocks.map(...), [stocks])`로 참조 안정화.
- 로딩 상태 분리: `initialLoading` / `saving` / `mutating` 목적별로 명확히 분리. 초기 로드 외 변경 중 로딩은 행 내 스피너 또는 요약 행 인디케이터로 국소화.

**기획서 §5.1 요구사항 충족**
- 카테고리 목록 (이름 + 소속 종목 수): `CategoryRow`에서 `user_category_stocks[0].count` 표시.
- 카테고리 추가: 하단 인라인 폼, `maxLength={50}` 적용.
- 이름 수정: 길게 누르기 → 액션 시트 → 해당 행 인라인 TextInput 전환.
- 삭제: 길게 누르기 → 확인 다이얼로그("연결된 메모에서도 해제됩니다").
- 카테고리 종목 편집 (`CategoryStocksScreen`): `StockSearchModal` 재사용, X 버튼으로 즉시 제거.

**네비게이션**
- `MainScreen` 설정 스택: `SettingsRoute` union type으로 `settings` → `category-manage` → `category-stocks` 3단 스택 구현.
- 탭 전환 시 스택 루트 리셋 처리 포함.
- `category-manage-from-memo` 경로: 이슈 025를 위한 사전 준비로 `onCategoryPress={() => {}}` 전달은 의도적 처리.

**StockSearchModal 재사용**
- `excludeIds` prop에 현재 카테고리 종목 ID 목록 전달로 중복 방지.
- 섹터 선택 플로우(`sector-pick` phase)가 포함된 기존 모달을 그대로 재사용하므로 CategoryStocksScreen에서 종목 추가 시 섹터 미설정 종목도 올바르게 처리됨.

**TypeScript / 코드 품질**
- `any` 사용 없음.
- props 타입 모두 명시 (`CategoryManageScreenProps`, `CategoryStocksScreenProps`, `CategoryRowProps`, `StockRowProps`).
- `EntityChip` 버그 수정(`category: '카테고리'` 추가) 적절.
- `StyleSheet.create()` 일관 사용, 인라인 스타일 없음.
- RN 전용 API 사용, 웹 전용 API(`document`, `window`) 없음.
