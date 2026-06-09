# 프론트엔드 구현 내역

## 수정한 파일

### app/screens/MemoEditScreen.tsx
- `userId: string` prop 추가 — `useCategories(userId)` 호출용
- `useCategories` 훅 import 및 사용: 카테고리 목록(`categories`), 초기 로딩(`catLoading`), `addCategory` 함수
- 카테고리 연결 상태 추가: `selectedCategoryIds: string[]`
- 인라인 신규 카테고리 입력 상태 추가: `newCatInputVisible`, `newCatName`, `newCatSaving`, `newCatInputRef`
- 편집 모드 초기화: `existingMemo.memo_categories → selectedCategoryIds`
- 저장 핸들러(`handleSave`): `p_category_ids: selectedCategoryIds` 전달 (create/update 모두)
- 카테고리 토글 핸들러: `handleCategoryToggle`
- 인라인 생성 핸들러: `handleNewCatSave`, `handleNewCatCancel`, `handleShowNewCatInput`
- JSX: 섹터 연결 섹션 아래에 "카테고리 연결" 섹션 추가
  - 기존 카테고리 칩 나열 (선택/미선택 토글)
  - "+ 새 카테고리" 버튼 → 인라인 TextInput + 추가/취소 버튼
  - 카테고리 로딩 중 ActivityIndicator 표시
- 스타일 추가: `catHint`, `catChipList`, `catChip`, `catChipInactive`, `catChipText*`, `catChipAdd*`, `newCatInput*`

### app/components/MemoFilter.tsx
- props 추가:
  - `categories: UserCategoryWithCount[]` — 사용자 카테고리 목록
  - `onCategoryManagePress?: () => void` — 편집 아이콘 탭 콜백
- `UserCategoryWithCount` import 추가 (`../types/category`)
- `handleToggleNoLinks`: `categoryIds: [], categoryNames: []` 초기화 추가
- `handleClearAll`: `categoryIds: [], categoryNames: []` 초기화 추가
- `handleToggleCategory` 핸들러 추가: 카테고리 칩 토글
- `hasAnyFilter`: `filter.categoryIds.length > 0` 조건 추가
- JSX: 섹터 행 아래에 "카테고리" 행(5행) 추가
  - `rowLabelWide` 스타일 사용 (width: 44) — "카테고리" 5글자 수용
  - 가로 스크롤 `ScrollView` + `FilterChip`으로 카테고리 칩 나열
  - 카테고리 없을 때 "카테고리 없음" 텍스트 표시
  - 행 우측에 ⚙ 아이콘 버튼 → `onCategoryManagePress` 콜백
- 스타일 추가: `categoryEditBtn`, `categoryEditIcon`, `rowLabelWide`
- 주석 업데이트: 4행 → 카테고리 행(5행) 포함 레이아웃 구조 설명 추가

### app/components/MemoCard.tsx
- `buildChips` 함수: `memo.categories` 배열을 순회하여 `{ entityType: 'category', label: cat.name }` 칩 추가
- 결과: 카테고리가 연결된 메모에 주황색(`#F59E0B`) 카테고리 칩 표시

### app/hooks/useMemos.ts
- `extractEntityTypes`: `if (memo.categories.length > 0) types.push('category')` 추가
- 결과: 달력형 뷰에서 카테고리 연결된 날짜에 주황색 점 표시

### app/screens/MemoListScreen.tsx
- import 추가: `useCategories`
- `filterToParams`: `p_category_ids: filter.categoryIds.length > 0 ? filter.categoryIds : null` 추가
- `MemoListScreenProps`: `userId: string`, `onCategoryManagePress?: () => void` prop 추가
- `MemoFilterSectionProps`: `userId: string`, `onCategoryManagePress?: () => void` prop 추가
- `MemoFilterSection` 내부:
  - `useCategories(userId)` 호출로 카테고리 목록 로드
  - `MemoFilter`에 `categories`, `onCategoryManagePress` props 전달
- `MemoListScreen` 함수: `userId`, `onCategoryManagePress` 구조분해 및 `MemoFilterSection`에 전달

### app/screens/MainScreen.tsx
- `MemoRoute` 타입: `{ screen: 'category-manage-from-memo' }` 케이스 추가
- 핸들러 추가: `handleCategoryManageFromMemo`, `handleBackToMemoList`
- `MemoListScreen` props 추가: `userId={user.id}`, `onCategoryManagePress={handleCategoryManageFromMemo}`
- `MemoEditScreen` props 추가: `userId={user.id}`
- JSX: `memoRoute.screen === 'category-manage-from-memo'` 케이스 추가
  - `CategoryManageScreen` 렌더링 (뒤로 → 메모 리스트로 복귀)
  - `onCategoryPress`는 메모 탭 컨텍스트에서 종목 관리 진입이 불필요하므로 no-op으로 처리

## UI 레퍼런스 매핑
별도 HTML 레퍼런스 없음. 기존 `MemoEditScreen`, `MemoFilter` 패턴 그대로 준용:
- 카테고리 칩: 섹터 L1 칩과 동일한 `FilterChip` 컴포넌트 재사용 (색상만 `#F59E0B`)
- 인라인 카테고리 생성: TextInput + 추가/취소 버튼 구조 (종목 연결의 "목표가 입력" 패턴 참고)

## 특이사항

### 렌더링 최적화
- `MemoFilterSection`이 `useCategories(userId)` 호출을 소유하도록 배치 → `MemoListScreen` 리렌더링 유발 없음
- `handleCategoryToggle`은 `useCallback` 사용
- 카테고리 칩은 기존 `FilterChip` (`React.memo`) 재사용

### CategoryManageScreen onCategoryPress 처리
- 메모 탭에서 열리는 `CategoryManageScreen`의 `onCategoryPress`는 no-op (`() => {}`)으로 전달
- 설정 탭 경로에서는 기존대로 `CategoryStocksScreen`으로 이동하는 핸들러 유지
- 메모 탭 컨텍스트에서는 종목 관리가 아닌 카테고리 이름 관리만 필요하기 때문

### MemoCard 칩 최대 4개 제한
- `buildChips` 함수 끝에서 `.slice(0, 4)` 적용 중 — 카테고리 칩도 이 제한 안에서 노출
- 종목 → 매매이벤트 → 뉴스 → 섹터 → 카테고리 순서로 우선순위가 낮음
