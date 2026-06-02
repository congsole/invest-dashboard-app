# 프론트엔드 구현 내역

## 새로 만든 화면

- `app/screens/MemoListScreen.tsx` — 메모 목록 화면. 달력형/리스트형 전환, 필터 바(종목/매매이벤트/뉴스/섹터/연결 없음 AND 결합), 종목 검색 모달, 무한 스크롤, FAB 버튼 포함.
- `app/screens/MemoEditScreen.tsx` — 메모 작성/편집 화면. 본문 입력, 종목 연결(목표가 포함), 섹터 연결, 생성/수정/삭제 기능.
- `app/screens/MainScreen.tsx` — 대시보드와 투자 일지를 묶는 탭 네비게이션 컨테이너. 메모 화면 스택 관리(list ↔ edit).

## 새로 만든 컴포넌트

- `app/components/EntityChip.tsx` — 연결 엔티티 칩. 타입별 색상(종목 #3B82F6, 매매이벤트 #22C55E, 뉴스 #8B5CF6, 섹터 #14B8A6, 연결 없음 #9CA3AF) 표시. `React.memo` 적용.
- `app/components/MemoCard.tsx` — 리스트형 메모 항목. 본문 미리보기 2줄, EntityChip 최대 4개, 작성 일시. `React.memo` 적용.
- `app/components/CalendarView.tsx` — 달력형 뷰. 월 네비게이션, 날짜 칸에 엔티티 타입 점(최대 4개), 오늘 날짜 강조. `DayCell` 분리 후 `React.memo` 적용.
- `app/components/MemoFilter.tsx` — 필터 컴포넌트. 가로 스크롤 칩 목록, 종목 선택 시 "직접 연결만/매매이벤트 포함" 토글, 전체 초기화 버튼. `FilterChip`, `MemoFilter` 모두 `React.memo`.

## 새로 만든 훅

- `app/hooks/useMemos.ts` — 메모 목록 조회. `initialLoading`/`refreshing`/`loadingMore` 분리. 달력 요약 맵(`calendarSummary`) 계산 내장. 무한 스크롤 `loadMore` 지원.
- `app/hooks/useMemoDetail.ts` — 메모 단건 조회.
- `app/hooks/useMemoMutation.ts` — 메모 생성/수정/삭제.

## 새로 만든 서비스/타입

- `app/services/memo.ts` — Supabase RPC/REST 래퍼: `listMemos`, `getMemo`, `createMemo`, `updateMemo`, `deleteMemo`, `getSectors`, `searchStocks`, `createTradeEventWithMemo`.
- `app/types/memo.ts` — Memo, Sector, Stock, MemoItem, MemoDetail, MemoFilterState, DayMemoSummary, EntityType, ENTITY_COLORS 등 공통 타입 정의.

## 수정한 파일

- `app/components/forms/BuySellEventForm.tsx` — 메모 작성 옵션 통합. 토글 UI 추가, 활성화 시 메모 본문/목표가 입력 필드 노출. 저장 시 `createTradeEventWithMemo` RPC 사용(메모 활성화), 기존 `createAccountEvent` 유지(메모 비활성화).
- `app/App.tsx` — `DashboardScreen` 직접 렌더링 → `MainScreen`(탭 네비게이션 포함)으로 교체.

## UI 레퍼런스 매핑

- `ui/dashboard/code.html` 기존 스타일 패턴(Colors, 카드 스타일, FAB, 바텀시트) 참조하여 메모 화면 스타일 일관성 유지.

## 특이사항

1. **네비게이션 구조**: Expo에서 React Navigation 없이 간단한 상태 기반 스택 구현(MainScreen의 `memoRoute` 상태). 추후 React Navigation 도입 시 이 구조를 라우트로 전환 가능.

2. **달력형 날짜 탭 → 리스트 전환**: 날짜 칸 탭 시 해당 날짜의 `p_from`/`p_to`를 서버에 전달하여 리스트형으로 전환. 달력 요약용 데이터와 리스트 데이터가 동일 `useMemos` 훅에서 관리됨.

3. **필터 적용 방식**: 필터 변경 시 서버 재호출. 클라이언트 사이드 필터링은 `p_no_links`/`p_trade_events_only` 등이 서버 함수에 이미 내장되어 있어 서버 호출이 불가피함. 대신 초기 로딩 외 로딩 상태는 기존 콘텐츠를 유지한 채 처리됨 (`refreshing`만 true).

4. **종목 검색**: `stocks` 테이블을 `name.ilike` + `ticker.ilike` OR 쿼리로 검색. `searchStocks` 함수는 `services/memo.ts`에 포함.

5. **BuySellEventForm 메모 통합**: 기존 API 호출 흐름에 최소한으로 개입. 메모 토글이 꺼진 경우 기존 `createAccountEvent` 경로 그대로 사용.

6. **타입 안전성**: 새로 작성한 파일 전체에서 `tsc --noEmit` 에러 없음. supabase/functions는 Deno 전용 코드로 기존부터 tsconfig에서 타입 오류가 있었으며 이번 작업 범위 외.
