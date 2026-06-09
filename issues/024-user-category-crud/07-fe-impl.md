# 프론트엔드 구현 내역

## 새로 만든 화면

- `app/screens/CategoryManageScreen.tsx` — 카테고리 목록 관리 화면 (추가/수정/삭제)
- `app/screens/CategoryStocksScreen.tsx` — 카테고리 소속 종목 편집 화면 (추가/제거)

## 새로 만든 커스텀 훅

- `app/hooks/useCategories.ts` — 카테고리 목록 조회 + CRUD 상태 관리 (`initialLoading` / `saving` 분리)
- `app/hooks/useCategoryStocks.ts` — 카테고리 소속 종목 목록 + 추가/제거 상태 관리 (`initialLoading` / `mutating` 분리)

## 수정한 파일

- `app/screens/SettingsScreen.tsx` — `user: AuthUser` / `onCategoryManage` prop 추가, 카테고리 관리 메뉴 항목 추가
- `app/screens/MainScreen.tsx` — `user: AuthUser` prop 추가, 설정 탭 + 카테고리 관리 스택(`category-manage` / `category-stocks`) 추가
- `app/App.tsx` — `MainScreen`에 `user` prop 전달
- `app/components/EntityChip.tsx` — `ENTITY_LABELS`에 `category: '카테고리'` 추가 (기존 누락으로 인한 TypeScript 에러 수정)

## UI 레퍼런스 매핑

- PRD-006 §5.1 카테고리 관리 화면 → `app/screens/CategoryManageScreen.tsx`
- PRD-006 §5.1 카테고리 종목 편집 → `app/screens/CategoryStocksScreen.tsx`
- PRD-006 §5.5 카테고리 관리 진입점 → 설정 탭 내 메뉴 항목 (설정 → 카테고리 관리)

## 화면 네비게이션 구조

```
MainScreen (하단 탭)
 ├── 대시보드 탭 → DashboardScreen
 ├── 투자 일지 탭 → MemoListScreen → MemoEditScreen
 └── 설정 탭
      ├── SettingsScreen (기본)
      │    └── [카테고리 관리] 탭 →
      ├── CategoryManageScreen
      │    └── 카테고리 행 탭 →
      └── CategoryStocksScreen
```

## 특이사항

### 카테고리 행 길게 누르기 UX
스와이프 제스처 라이브러리(react-native-gesture-handler 등)를 별도로 설치하지 않고, RN 기본 `Alert.alert`의 액션 시트를 활용하여 "이름 수정 / 삭제 / 취소" 선택을 구현했다. 이름 수정 시 해당 행이 인라인 TextInput으로 전환되는 패턴을 사용했다.

### 이름 수정 인라인 폼
`FlatList.renderItem` 내에서 `editingId === item.id` 조건으로 분기하여 일반 행과 수정 중인 행을 구분했다. 하나의 항목만 동시에 수정할 수 있다.

### StockSearchModal 재사용
`CategoryStocksScreen`에서 기존 `StockSearchModal` 컴포넌트를 그대로 재사용한다. `excludeIds`에 현재 카테고리에 이미 있는 종목 ID 목록을 전달하여 중복 표시를 방지한다. `useMemo`로 `excludeIds` 참조를 안정화했다.

### SettingsScreen prop 추가
기존 `SettingsScreen`은 prop이 없었으나, `user: AuthUser`와 `onCategoryManage: () => void`를 추가했다. `user` prop은 향후 프로필 표시 등에 활용 가능하도록 준비했다 (현재는 `_user`로 표시).

### EntityChip 버그 수정
`app/types/memo.ts`의 `EntityType`에 `'category'`가 추가되어 있었으나, `EntityChip.tsx`의 `ENTITY_LABELS` Record가 `category`를 누락하여 TypeScript 에러가 발생했다. `category: '카테고리'`를 추가하여 수정했다.

### 렌더링 최적화 적용 (CLAUDE.md 기준)
- `CategoryRow`, `StockRow`: `React.memo`로 분리하여 목록 리렌더링 최소화
- `onPress`, `onLongPress`, `onRemove` 등 모든 핸들러: `useCallback`으로 참조 안정화
- `excludeIds`: `useMemo`로 계산 (종목 목록 변경 시에만 재계산)
- `initialLoading` / `saving` / `mutating`: 목적별로 분리하여 전체 화면 대체 스피너 사용을 최소화
