# [013] 종목 검색 — UI 컴포넌트

<!-- PM-agent 작성 -->
## 개요
메모 작성 화면의 "종목 연결" 흐름에 사용되는 종목 검색 UI를 구현한다. 검색어 2자 이상 입력 시 로컬 Supabase 검색을 먼저 수행하고(디바운스 300ms), 결과가 0건이면 자동으로 FastAPI 외부 검색으로 전환한다. 외부 검색 결과에는 "추가" 칩을 표시하고, 종목 선택 후 섹터가 null이면 섹터 선택 드롭다운을 노출한다. 이슈 012(데이터/API 레이어) 완료 후 착수한다.

## 참조 문서
- 커밋: 78dfc50be2b2bb1873ef3f824c47b33ffc94ca9c — [Docs] 종목 검색 기능
- 기획서: docs/planning/PRD-003-memo.md (섹션 8)
- 선행 이슈: [012] 종목 검색 — 데이터/API 레이어 (`issues/012-stock-search-data-layer/`)

## docs 변경 내역

다음 명령으로 설계 에이전트들이 방금 업데이트한 내역을 파악한다:
```bash
git diff HEAD docs/architecture/domain-model.md
git diff HEAD docs/architecture/db-schema.md
git diff HEAD docs/api/api-spec.md
```
(아직 커밋되지 않은 변경 사항이므로 `HEAD` 기준 diff 사용)

변경된 내용을 요약하여 아래 형식으로 채운다:

### domain-model.md
- [수정] Stock — `market`/`currency`/`is_active` 필드 반영 (UI에서 사용하는 타입 변경)

### db-schema.md
- (UI 이슈 — 해당 없음)

### api-spec.md
- [추가] Stock — 로컬 종목 검색 API (UI에서 호출하는 엔드포인트)
- [수정] Stock — stock 관련 응답 타입 변경(`asset_type` → `market`, `currency`/`is_active` 추가) 반영

<!-- 구현 단계에서 업데이트 -->
## 구현 현황
- [x] Supabase 구현
- [x] 백엔드 테스트
- [x] 프론트엔드 구현
