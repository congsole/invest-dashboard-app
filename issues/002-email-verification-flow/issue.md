# [002] 이메일 인증 플로우 구현

<!-- PM-agent 작성 -->
## 개요
회원가입 시 Supabase가 발송하는 인증 이메일을 사용자가 클릭하면 앱으로 딥링크 복귀하여 인증을 완료하는 플로우를 구현한다. 인증 대기 화면(`EmailVerificationScreen`) 제공, 딥링크 수신 후 `SIGNED_IN` 이벤트 감지, 닉네임 임시 보관 후 프로필 저장, `expo-linking` 및 Supabase Redirect URL 설정이 포함된다.

구체적으로 다음 작업이 필요하다:
- `EmailVerificationScreen` 구현 (안내 문구, 재발송 버튼 60초 쿨다운, 로그인 화면 복귀 버튼)
- 회원가입 후 닉네임을 메모리(state)에 임시 보관
- `onAuthStateChange` → `SIGNED_IN` 이벤트 수신 시 `createProfile(닉네임)` 호출 후 메인 화면 이동
- `expo-linking` 설정 및 `app.json`에 scheme 추가 (`investdashboard://`)
- Supabase 대시보드 Redirect URL 등록 안내
- 이메일 미인증 로그인 시도 에러 메시지 처리

## 참조 문서
- 커밋: 4915fe3 — [Docs] PRD-001 이메일 인증 플로우 추가
- 기획서: docs/planning/PRD-001-auth.md

<!-- domain-model-agent 작성 후 추가 -->
## docs 변경 내역

### domain-model.md
- [변경 없음] 기존 User, Profile 엔터티 구조 유지
- [명확화] Profile 저장 시점: 이메일 인증 완료(`SIGNED_IN` 이벤트) 후 `createProfile(닉네임)` 호출
- [명확화] 닉네임 임시 보관: 회원가입 완료 ~ 이메일 인증 완료 사이, React state(메모리)에 보관

<!-- db-schema-agent 작성 후 추가 -->
### db-schema.md
- [변경 없음] profiles 테이블 구조 유지
- [결정] 재발송 쿨다운(60초)은 클라이언트 메모리 state로 관리, DB 변경 불필요

<!-- api-spec-agent 작성 후 추가 -->
### api-spec.md
- [추가] Auth — resendVerificationEmail (Supabase Auth SDK)
- [수정] Auth — createProfile : 호출 시점을 "회원가입 직후"에서 "이메일 인증 완료(`SIGNED_IN` 이벤트) 후"로 변경

<!-- 구현 단계에서 업데이트 -->
## 구현 현황
- [x] Supabase 구현
- [x] 프론트엔드 구현
- [x] 테스트
