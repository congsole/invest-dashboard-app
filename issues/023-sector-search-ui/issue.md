# [023] 섹터 검색 UI (CascadingSectorPicker)

<!-- PM-agent 작성 -->
## 개요
메모 작성/편집 및 종목 등록 시 섹터를 선택하는 `CascadingSectorPicker` 컴포넌트에 키워드 검색 기능을 추가한다. GICS 273개 섹터를 1회 로드하여 클라이언트에 캐시한 뒤, 검색어 입력 시 한글명/영문명을 클라이언트 사이드에서 필터링하여 계층 경로(breadcrumb)와 함께 결과를 표시한다.

백엔드 변경 없음 — DB 마이그레이션, RLS, RPC, Edge Function 변경 없이 **프론트엔드 + 서비스 레이어만 수정**한다.

변경 대상:
- `app/services/sectors.ts`: `getAllSectorsWithCache()` 추가 (기존 `getSectors()` 래핑, 모듈 레벨 캐시)
- `app/hooks/useSectorSearch.ts`: 신규 훅 — 전체 로드, 300ms 디바운스, 필터링, breadcrumb 구축
- `app/components/CascadingSectorPicker.tsx`: 검색 입력 필드 추가, 검색 모드/cascading 모드 전환, 검색 결과 리스트 렌더링

적용 범위: MemoEditScreen(멀티 선택) + StockSearchModal(단일 선택)

## 참조 문서
- 커밋: 7b29cbe289789d1148e04770ed3b538cf8e7e631 — [Docs] 메모 등록/수정 시 섹터 검색 기능
- 기획서: docs/planning/PRD-005-sector-search.md

## docs 변경 내역

다음 명령으로 설계 에이전트들이 방금 업데이트한 내역을 파악한다:
```bash
git diff HEAD docs/architecture/domain-model.md
git diff HEAD docs/architecture/db-schema.md
git diff HEAD docs/api/api-spec.md
```
(아직 커밋되지 않은 변경 사항이므로 `HEAD` 기준 diff 사용)

### domain-model.md
- 변경 없음 — 기존 Sector 엔터티 그대로 사용

### db-schema.md
- 변경 없음 — 기존 sectors 테이블 그대로 사용

### api-spec.md
- 변경 없음 — 기존 getSectors() 호출 그대로 사용, 신규 엔드포인트 없음

<!-- 구현 단계에서 업데이트 -->
## 구현 현황
- [x] Supabase 구현 (변경 없음 — 스킵)
- [x] 백엔드 테스트 (변경 없음 — 스킵)
- [x] 프론트엔드 구현
