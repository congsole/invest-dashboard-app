# [018] GICS 계층화 — UI 변경 (메모 필터 · 종목 상세 · 섹터 보정)

## 개요
PRD-004에 따라 세 곳의 UI를 변경한다. (1) 메모 필터 섹터 행: 플랫 칩 나열에서 L1 → L2 계층 탐색(아코디언/하위 행 펼침)으로 변경. L1 칩 탭 시 하위 L2 칩 노출, L1/L2 동시 선택 가능(OR 결합). (2) 종목 상세: sector_id → `get_sector_breadcrumb` RPC 추가 호출 후 `정보기술 > 반도체및반도체장비 > 반도체 > 반도체제조` breadcrumb 표시. 매핑 최하위 레벨까지만 표시. (3) 섹터 수동 보정: L1 드롭다운 → L2 → L3 → L4 cascading select로 변경. 각 단계 선택 시 parent_id 기반으로 하위 목록 로딩.

선행 이슈: 016 (sectors 계층 구조 + get_sector_breadcrumb RPC가 먼저 배포되어야 함)

## 참조 문서
- 커밋: b892f6d — [Feat] 종목 분류에 GICS 도입 (한국/미국 주식 동일하게)
- 기획서: docs/planning/PRD-004-sector-hierarchy.md (§7 UI 변경)

## docs 변경 내역

### domain-model.md
- 해당 없음 (UI 레이어 변경)

### db-schema.md
- 해당 없음

### api-spec.md
- [수정] 섹터 목록 조회 — `level`/`parent_id` 쿼리 파라미터 추가. cascading select에서 단계별 하위 목록 로딩에 사용.
- [추가] 섹터 breadcrumb 조회 RPC — `get_sector_breadcrumb(p_sector_id)`. 종목 상세 화면에서 L4 → L1 경로 1회 호출.
- [수정] 종목 섹터 수동 지정/변경 — cascading select(L1 → L2 → L3 → L4) UI 흐름 명세 추가.

## 구현 현황
- [x] Supabase 구현
- [x] 백엔드 테스트
- [x] 프론트엔드 구현
- [ ] E2E 테스트
