# [010] 소셜 로그인 — UI

<!-- PM-agent 작성 -->
## 개요

기존 `AuthScreen`(로그인/회원가입 화면)에 Google·Apple 소셜 로그인 버튼을 추가한다. 로그인 탭과 회원가입 탭 모두에 구분선("또는") + "Google로 로그인" + "Apple로 로그인" 버튼을 배치한다. 버튼 탭 시 이슈 009에서 구현한 `signInWithOAuth` 서비스 함수를 호출하며, 로딩 상태 및 에러 처리를 포함한다. **이슈 009 선행 필요.**

## 참조 문서
- 커밋: 7ab2e6f97ea145d94f31782936a2d5fbab841607 — [Feat] PRD-001 소셜 로그인(Google, Apple) 기획 추가
- 기획서: docs/planning/PRD-001-auth.md

## docs 변경 내역

### domain-model.md
- 해당 없음 (UI 이슈 — 도메인 모델 변경 없음)

### db-schema.md
- 해당 없음 (UI 이슈 — DB 스키마 변경 없음)

### api-spec.md
- 해당 없음 (UI 이슈 — API 명세 변경 없음, 이슈 009에서 반영 완료)

<!-- 구현 단계에서 업데이트 -->
## 구현 현황
- [x] Supabase 구현 (BE 작업 없음 — skip)
- [x] 백엔드 테스트 (BE 작업 없음 — skip)
- [x] 프론트엔드 구현
