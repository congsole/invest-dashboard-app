# [001] 사용자 인증

<!-- PM-agent 작성 -->
## 개요
이메일/비밀번호 기반 회원가입, 로그인, 자동 로그인, 로그아웃 기능을 구현한다. Supabase Auth를 인증 주체로 사용하며, 닉네임 등 추가 프로필 정보는 `public.profiles` 테이블에 저장한다. 인증 상태에 따라 AuthScreen(로그인/회원가입)과 메인 화면을 분기하고, SettingsScreen에서 로그아웃(확인 다이얼로그 포함)을 제공한다. 유효성 검사(이메일 형식/중복, 비밀번호 8자 이상, 닉네임 2~20자), 세션 자동 복원, RLS 적용, 네트워크 오류 처리가 포함된다. 다중 기기 로그인을 허용하며(기존 세션 유지, Supabase Auth 기본 동작), 세션 만료 시 자동으로 로그인 화면으로 이동한다.

## 참조 문서
- 커밋: c8d5265 — [Docs] PRD-001 사용자 인증 기획서 상세화
- 커밋: f3afd9e — [Docs] PRD-001 세션 관련 비기능 요구사항 추가
- 기획서: docs/planning/PRD-001-auth.md

<!-- domain-model-agent 작성 후 추가 -->
## docs 변경 내역

### domain-model.md
- [추가] User 엔터티 — id(uuid), email(text), created_at(timestamptz). Supabase Auth `auth.users` 위임.
- [추가] Profile 엔터티 — id(uuid), user_id(uuid FK), nickname(text), created_at(timestamptz), updated_at(timestamptz). 닉네임 등 추가 프로필 저장.
- Session은 Supabase Auth 내부 메커니즘 사용, 별도 도메인 엔터티 없음.

<!-- db-schema-agent 작성 후 추가 -->
### db-schema.md
- [추가] profiles 테이블 — id(uuid PK), user_id(uuid FK→auth.users), nickname(text, 2~20자), created_at, updated_at
- RLS: SELECT/INSERT/UPDATE 본인 데이터만 허용, DELETE 비허용

<!-- api-spec-agent 작성 후 추가 -->
### api-spec.md
- [추가] Auth — 회원가입 (Supabase Auth SDK, signUp)
- [추가] Auth — 프로필 생성 (REST insert, profiles 테이블)
- [추가] Auth — 로그인 (Supabase Auth SDK, signInWithPassword)
- [추가] Auth — 로그아웃 (Supabase Auth SDK, signOut)
- [추가] Auth — 세션 복원 (Supabase Auth SDK, getSession)
- [추가] Auth — 세션 상태 변경 구독 (Supabase Auth SDK, onAuthStateChange)

<!-- 구현 단계에서 업데이트 -->
## 구현 현황
- [x] Supabase 구현
- [x] 프론트엔드 구현
- [x] 테스트
