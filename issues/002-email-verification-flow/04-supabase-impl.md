# Supabase 구현 내역

## 마이그레이션
- 신규 마이그레이션 없음 (DB 스키마 변경 없음)
- 기존 `app/supabase/migrations/20260409000000_user-authentication.sql` 그대로 사용

## Edge Functions
- 없음 (모든 API가 Supabase Auth SDK / REST로 처리 가능)

## 클라이언트 유틸
- `app/services/auth.ts` — 변경된 함수 목록:
  - `signUp`: `nickname` 파라미터 제거, 반환값에 `needsEmailVerification: boolean` 추가. 프로필 생성을 이메일 인증 완료 후로 이관.
  - `resendVerificationEmail({ email })`: 신규 추가. `supabase.auth.resend({ type: 'signup', email })` 호출.
  - `createProfile`: 변경 없음 (호출 시점만 변경 — 이메일 인증 완료 후 frontend에서 호출)

## 특이사항
- `signUp`의 반환값 변경: 이전에는 `AuthUser`를 반환했으나, 이제는 `{ user: AuthUser; needsEmailVerification: boolean }`을 반환한다. `needsEmailVerification`이 `true`이면 프론트엔드가 `EmailVerificationScreen`으로 이동해야 한다.
- 기존 `signUp`에서 `createProfile`을 직접 호출하던 로직을 제거. 이메일 인증 전에는 세션이 없어 RLS를 통과할 수 없기 때문.
- `resendVerificationEmail`은 Supabase가 자체적으로 rate limit을 적용하므로, 클라이언트 쿨다운(60초)은 프론트엔드 state로 별도 관리.
