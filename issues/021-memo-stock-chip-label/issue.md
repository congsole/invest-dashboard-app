# [021] 메모 리스트형 종목 칩 라벨 표시 규칙 적용

<!-- PM-agent 작성 -->
## 개요
메모 리스트형에서 연결된 종목을 칩(태그)으로 표시할 때, 시장(market)에 관계없이 항상 `name`(종목명)을 표시하도록 규칙을 명확히 한다. 기존에 ticker(예: `005930`)를 표시하거나 market별로 다른 라벨을 사용하던 경우가 있었다면, 항상 종목명 우선으로 통일한다.

## 참조 문서
- 커밋: 4cb2f1258635efe4638a0a4c1d39edc66ea67d63 — [Docs] 기획서 수정 (메모 종목 칩, 섹터 필터링 기능)
- 기획서: docs/planning/PRD-003-memo.md

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
- [수정] Stock — `name` 속성 설명 확장: 메모 리스트형 종목 칩 라벨은 market에 관계없이 항상 `name`(종목명) 표시 규칙 명시. 한국 주식 티커는 숫자 코드라 사용자가 식별하기 어렵기 때문에 종목명 우선.

### db-schema.md
- [수정] stocks 테이블 — `name` 컬럼 설명에 메모 리스트형 종목 칩 라벨 표시 규칙(market 무관, 항상 name 표시) 추가. 스키마(테이블/컬럼) 변경 없음.

### api-spec.md
- 변경 없음 (API 시그니처 변경 없음)

<!-- 구현 단계에서 업데이트 -->
## 구현 현황
- [x] Supabase 구현 (N/A — FE 전용 이슈)
- [x] 백엔드 테스트 (N/A — FE 전용 이슈)
- [x] 프론트엔드 구현
- [ ] E2E 테스트
