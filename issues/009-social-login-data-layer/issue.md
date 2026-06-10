# [009] 소셜 로그인 — 데이터/API 레이어

<!-- PM-agent 작성 -->
## 개요

Google OAuth 2.0 및 Apple Sign In을 Supabase Auth와 연동하는 백엔드/서비스 레이어를 구현한다. Supabase 대시보드에서 Google·Apple Provider를 활성화하고, `signInWithOAuth` 호출 서비스 함수와 `onAuthStateChange` 이벤트 핸들러 내 소셜 프로필 자동 생성 로직을 추가한다. DB 스키마 변경은 없으며(`auth.identities`는 Supabase 자동 관리), `profiles` 테이블의 생성 로직(소셜 첫 로그인 시 닉네임 자동 도출)만 확장한다. 이슈 010(소셜 로그인 UI)의 선행 이슈다.

## 참조 문서
- 커밋: 7ab2e6f97ea145d94f31782936a2d5fbab841607 — [Feat] PRD-001 소셜 로그인(Google, Apple) 기획 추가
- 기획서: docs/planning/PRD-001-auth.md

## docs 변경 내역

### domain-model.md
- [추가] Identity 엔터티 — Supabase Auth 자동 관리(`auth.identities`). provider(email / google / apple) 연동 정보, 앱에서 직접 생성/수정 불필요.
- [수정] User 엔터티 — 소셜 로그인(Google·Apple OAuth) 통합 관리 및 동일 이메일 자동 링킹 개념 추가.
- [수정] Profile 엔터티 — 소셜 로그인 첫 가입 시 provider display name 자동 닉네임 설정 로직 추가.
- [추가] 관계 User 1:N Identity — 동일 이메일 시 Supabase 자동 링킹으로 하나의 User에 여러 provider 연결 가능.

### db-schema.md
- [추가] auth.identities 참조 섹션 — Supabase 자동 관리, DDL 불필요. provider / identity_data / user_id 컬럼 명세.
- [수정] profiles 테이블 설명 — 소셜 로그인 시 생성 조건(첫 SIGNED_IN 이벤트) 및 닉네임 자동 설정 로직 추가.
- [추가] ERD — auth.users → auth.identities 1:N 관계 추가.

### api-spec.md
- [추가] Google 소셜 로그인 — `signInWithOAuth({ provider: 'google' })`. 사전 의존성: expo-web-browser, GCP OAuth 클라이언트, Supabase Google Provider 활성화.
- [추가] Apple 소셜 로그인 — `signInWithOAuth({ provider: 'apple' })`. 사전 의존성: expo-apple-authentication, Apple Developer Console 설정, Supabase Apple Provider 활성화.
- [수정] createProfile — 소셜 로그인 첫 로그인 시 호출 조건 및 provider display name 자동 추출 로직 명세 보강.
- [수정] onAuthStateChange — SIGNED_IN 이벤트에 소셜 로그인 완료 케이스 추가. 소셜 로그인 후 프로필 자동 생성 패턴 코드 예시 추가.

<!-- 구현 단계에서 업데이트 -->
## 구현 현황
- [x] Supabase 구현
- [x] 백엔드 테스트
- [x] 프론트엔드 구현
