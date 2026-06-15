# 프론트엔드 코드 리뷰

## Initial Review

**결과**: 이슈 1건

**이슈 목록**
- [심각도: high] `app/hooks/useTradeEventSearch.ts`: 초기 마운트 시 이중 패치 버그. `isFirstLoad.current = false`를 effect 1 바디에서 동기로 설정하면, effect 2(searchQuery 감지)가 같은 렌더 사이클에서 순서대로 실행될 때 `isFirstLoad.current`가 이미 `false`가 되어 있어 가드를 통과 → 마운트 직후 300ms 뒤 중복 `getTradeEvents` 호출 발생.

**검토 항목 전체 결과**
- UI: ui/ 레퍼런스 없음, 기존 종목/섹터 선택 섹션 패턴과 일관성 유지. PRD §6.4 항목 표시 형식(발생일·매수/매도·종목명·수량@체결가)을 레이아웃 분리 방식으로 구현 — 정보 누락 없음.
- TypeScript: `any` 사용 없음, props 타입 완전히 정의됨. `event_type as 'buy' | 'sell'` 캐스팅은 DB에서 buy/sell만 반환이 보장되므로 허용.
- API 연동: `getTradeEvents` 서비스 함수를 올바르게 사용. `.in('event_type', ['buy', 'sell'])`, `.order('event_date', { ascending: false })`, `.or('name.ilike.%q%,ticker.ilike.%q%')` — api-spec.md 명세와 일치.
- 상태 관리: `initialLoading` / `searching` 분리, 에러 상태 처리 완비.
- 스타일: 전량 `StyleSheet.create()` 사용. 인라인 스타일 없음.
- RN 규칙: 웹 전용 API 사용 없음.
- PRD §6.4 AC 충족 여부:
  - buy/sell 한정 후보: ✅ (`in('event_type', ['buy', 'sell'])`)
  - 최신순 정렬: ✅
  - 항목 표시 형식: ✅ (레이아웃 분리 방식이나 정보 동일)
  - 검색 디바운스 300ms: ✅
  - 기간 필터: ✅ (클라이언트 사이드)
  - 선택 시드: ✅ (`seedQuery={selectedStocks[0].name}`)
  - 복수 선택 칩: ✅
  - 중복 차단: ✅ (`selectedMap` key 기반)
  - 편집 시 추가/해제 반영: ✅ (기존 연결 이벤트 로드 + `onConfirm`으로 교체)
  - 표시 레이어 미수정: ✅
- `p_trade_event_ids` 전달: 기존 `null` 고정 버그 → `selectedTradeEvents.map(te => te.id)` 실제 전달로 수정 확인. null=유지/배열=교체 스펙과 일치 (`update_memo_with_links`에서 `p_trade_event_ids ?? null` 처리 확인).
- CLAUDE.md 렌더링 최적화: `allEvents`/`filteredEvents` 분리, 기간 필터 클라이언트 처리, `initialLoading`/`searching` 분리, `React.memo` + `useCallback` + `useMemo` 적용. 이중 패치 버그만 제외하면 원칙 준수.
- 상태 범위: `TradeEventSelectModal`이 자체 검색 상태를 캡슐화 — 상위 `MemoEditScreen` 리렌더에 영향 없음.

---

## Cycle 1

**수정 내용**
- `app/hooks/useTradeEventSearch.ts`: `isFirstLoad` ref를 `prevSearchQueryRef`로 교체. 초기 마운트 시 effect 2에서 `searchQuery === prevSearchQueryRef.current`이면 early return하여 이중 패치를 차단. 사용자가 검색어를 변경할 때만 `prevSearchQueryRef.current`를 업데이트하고 디바운스 재조회를 실행.

**Confirmation 결과**: 합격 — 이슈 0건 잔존

수정 후 동작:
- 마운트 시: effect 1 → `fetchEvents(initialQuery, true)` 실행. effect 2 → `searchQuery(=initialQuery) === prevSearchQueryRef.current(=initialQuery)` → early return. 이중 패치 없음.
- 검색어 변경 시: `searchQuery !== prevSearchQueryRef.current` → `prevSearchQueryRef.current = searchQuery` → 300ms 디바운스 후 `fetchEvents(searchQuery, false)`. `initialLoading`은 `false` 유지, `searching`만 `true`. 기존 목록 유지.
- 검색어 삭제(전체 목록): `searchQuery = ''` → 변경 감지 → 서버 재조회(빈 q = 전체 목록). 정상.

---

## 최종 결과

합격
