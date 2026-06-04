# 프론트엔드 코드 리뷰 — 이슈 011

## Initial Review
**결과**: 이슈 6건 (high 2, mid 2, low 2)

**이슈 목록**
- [high] `app/hooks/useMemos.ts`: `calendarSummary`가 `useMemo` 없이 훅 본체에서 직접 계산됨. `loadingMore`, `refreshing` 등 무관한 상태 변경 시마다 불필요하게 재계산됨.
- [high] `app/hooks/useMemos.ts`: `isMounted` ref를 `useRef(true)`로 선언만 하고 언마운트 시 `false`로 되돌리는 cleanup `useEffect`가 없음. 언마운트 후 비동기 응답이 도착하면 상태 업데이트 발생.
- [mid] `app/screens/MemoListScreen.tsx`: 초기 로드 `useEffect`의 dependency array가 `[]`로 비어 있음. `fetch`가 누락되어 linter 경고 발생.
- [mid] `app/screens/MemoListScreen.tsx`: 달력형 월 변경 `useEffect`의 dependency에 `filter`, `fetch` 누락. 필터 변경 후 월을 바꾸면 구 필터 값으로 조회될 가능성.
- [low] `app/components/MemoFilter.tsx`: 섹터 필터 칩 렌더 시 `onPress={() => handleToggleSector(sec.id, sec.name)}` 인라인 함수 사용. `FilterChip`이 `React.memo`임에도 렌더마다 새 참조 생성.
- [low] `app/components/CalendarView.tsx`: `cells` `useMemo`의 dependency array가 `[year, month, daysInMonth, firstWeekday]`. `daysInMonth`와 `firstWeekday`는 `year`, `month`로부터 파생된 값이므로 중복.

---

## Cycle 1

**수정 내용**

- `app/hooks/useMemos.ts`: `import`에 `useMemo`, `useEffect` 추가. `isMounted` cleanup `useEffect` 추가 (마운트 시 `true`, 언마운트 시 `false`). `calendarSummary`를 `useMemo(() => buildCalendarSummary(allMemos), [allMemos])`로 변경.

- `app/screens/MemoListScreen.tsx`: 초기 로드 `useEffect` dependency를 `[fetch]`로 변경 (getSectors는 stable이므로 생략, eslint-disable 주석 추가). 달력형 월 변경 `useEffect` dependency를 `[calYear, calMonth, viewMode, fetch]`로 변경.

- `app/components/MemoFilter.tsx`: `SectorFilterChip` 컴포넌트 추가 — `sector`, `active`, `onToggle` props 수신 후 내부에서 `useCallback`으로 `onPress` 안정화. 섹터 칩 렌더 부분에서 인라인 함수 제거하고 `SectorFilterChip` 사용으로 교체.

- `app/components/CalendarView.tsx`: `daysInMonth`, `firstWeekday` 변수를 컴포넌트 상단에서 제거. `useMemo` 내부에서 직접 `getDaysInMonth(year, month)`, `getFirstWeekday(year, month)` 호출하도록 변경. dependency array를 `[year, month]`로 축소.

**Confirmation 결과**: 합격 — 모든 이슈 해결, 신규 이슈 없음

---

## 최종 결과
**합격**

기획서(PRD-003-memo.md) 요구사항 전체 충족:
- 섹터 5. 색상 규칙: ENTITY_COLORS 상수 일치 확인
- 섹터 6. 화면: 달력형/리스트형, 필터(AND 결합), 메모 작성/편집, 매수·매도 폼 통합 모두 구현
- API 정합성: `list_memos`, `create_memo_with_links`, `update_memo_with_links`, `delete`, `create_trade_event_with_memo` 호출 파라미터 api-spec.md와 일치
- 렌더링 최적화 원칙: `initialLoading`/`refreshing`/`loadingMore` 분리, `React.memo` + `useCallback` + `useMemo` 전반 적용, 상태 영향 범위 적절히 분리됨
- 기존 코드 영향: `BuySellEventForm`은 메모 토글 비활성 시 기존 `createAccountEvent` 경로 유지, `App.tsx`는 `DashboardScreen` → `MainScreen` 교체로 기존 기능 유지
