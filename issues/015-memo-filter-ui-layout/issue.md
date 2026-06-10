# [015] 메모 필터 UI 레이아웃 재구성

<!-- PM-agent 작성 -->
## 개요
메모 목록 화면의 필터 영역을 단일 목록 방식에서 세 줄 구조로 재구성한다. 토글 행(매매 이벤트 / 뉴스 연관 / 연결 없음) → 종목 행(헤더 + 가로 스크롤 칩) → 섹터 행(헤더 + 가로 스크롤 칩) 순서로 배치하며, 레이블 "매매 연관" → "매매 이벤트"로 변경한다. API 시그니처 및 DB 스키마 변경 없이 프론트엔드 컴포넌트만 수정하는 작업이다.

## 참조 문서
- 커밋: 6aab87b — [Docs] 메모 필터 UI 수정
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
- [변경 없음] 엔터티·속성·관계 변경 없음. 필터 UI 레이아웃 변경(세 줄 구조, "연결 없음" 토글 행 이동, 결합 규칙 표현 변경)은 앱 레이어에만 영향.

### db-schema.md
- [변경 없음] DB 스키마 변경 없음. 필터 UI 레이아웃 변경은 앱 레이어에만 영향.

### api-spec.md
- [수정] Memo — 메모 목록 조회(list_memos) 필터 결합 규칙 설명 표현 변경: "같은 타입 내 → OR, 타입 간 → AND" → "같은 행 내 → OR, 다른 행/타입 간 → AND". API 시그니처 변경 없음.

<!-- 구현 단계에서 업데이트 -->
## 구현 현황
- [N/A] Supabase 구현 (DB 스키마 변경 없음)
- [N/A] 백엔드 테스트 (BE 변경 없음)
- [x] 프론트엔드 구현
