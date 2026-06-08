# 프론트엔드 코드 리뷰

## Initial Review

**결과**: 이슈 1건

**이슈 목록**
- [심각도: mid] `app/components/CascadingSectorPicker.tsx`: `MultiSectorChip`에서 선택 상태(`isSelected=true`)일 때 `expandBtnTextActive` 스타일(color: `#003ec7`)이 적용되어, 펼침 버튼 배경색(`expandBtnSelected`의 `#003ec7`)과 동일한 색이 되어 ▲/▼ 화살표가 안 보임. 선택 상태에서는 흰색(`#ffffff`)이어야 함.

---

## Cycle 1

**수정 내용**
- `app/components/CascadingSectorPicker.tsx`
  - `MultiSectorChip`의 expandBtnText 스타일 조건 수정: `(isSelected || isExpanded) && expandBtnTextActive` → `isSelected && expandBtnTextSelected`, `!isSelected && isExpanded && expandBtnTextActive`로 분리
  - `expandBtnTextSelected: { color: '#ffffff' }` 스타일 추가

**Confirmation 결과**: 합격

수정 후 재검토:
- 선택 상태: 버튼 배경 `#003ec7`, 화살표 색 `#ffffff` — 가시성 확보
- 펼침 상태(비선택): 버튼 배경 `#eff4ff`, 화살표 색 `#003ec7` — 정상
- 기본 상태: 배경 `#ffffff`, 화살표 색 `#737688` — 정상
- 나머지 이슈 없음

---

## 최종 결과

합격

### 검토 항목 요약

**UI / 기능 정확성**
- CascadingSectorMultiPicker: L1~L4 중 원하는 레벨에서 독립 선택/해제 가능 — 정상
- 펼침(onExpand)과 선택(onToggle) 분리, Accordion 방식(L1 하나만 펼침) — 정상
- MemoEditScreen: `selectedSectorIds = useMemo(() => selectedSectors.map(s => s.id), [selectedSectors])`로 파생, `p_sector_ids`로 전달 — 정상
- 편집 모드: `memo_sectors → Sector[]` 변환 시 `level` 포함 — 정상 (`parent_id: null` 하드코딩은 해당 필드 미사용이므로 무해)
- StockDetailSheet: `CascadingSectorPicker` import 교체, 기존 동작과 동일 — 정상
- MemoCard: L1은 `{name}`, L2~L4는 `L{level} {name}` — 정상

**CLAUDE.md 렌더링 최적화**
- `React.memo`: CascadingSectorPicker 내 모든 컴포넌트에 적용 (PickerLevel, MultiSectorChip, MultiPickerLevel, CascadingSectorPicker, CascadingSectorMultiPicker)
- `useCallback`: 모든 핸들러에 적용
- `useMemo`: `selectedIds(Set)` 파생, `selectedSectorIds` 파생
- 레벨별 로딩은 해당 섹션에만 ActivityIndicator 반영, 기존 선택 유지

**TypeScript 타입 안전성**
- `any` 미사용
- `Sector` 타입 재활용, `MemoDetail.memo_sectors[].sectors` 에서 `level` 조회 가능 (서비스 쿼리에 `sectors(id, code, name, level)` 포함 확인)

**코드 품질**
- StockDetailSheet 내부 CascadingPicker ~160줄 제거 후 공통 컴포넌트로 교체 — 중복 없음
- `StyleSheet.create()` 사용, 인라인 스타일 없음
- RN 웹 전용 API 없음
