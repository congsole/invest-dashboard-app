# 프론트엔드 구현 내역

## 새로 만든 화면
- `app/screens/EmailVerificationScreen.tsx` — 이메일 인증 대기 화면. 안내 문구, 재발송 버튼(60초 쿨다운), 로그인 화면 복귀 버튼 포함.

## 수정한 파일
- `app/screens/AuthScreen.tsx` — `onSignupPendingVerification` prop 추가. `signUp` 호출 시 `needsEmailVerification`이 true이면 `EmailVerificationScreen`으로 전환. 이메일 미인증 로그인 에러 메시지(`Email not confirmed`) 처리 추가.
- `app/hooks/useAuth.ts` — `setPendingNickname` 함수 반환. `onAuthStateChange`에서 `SIGNED_IN` 이벤트 + `pendingNickname` 있을 시 `createProfile` 자동 호출.
- `app/App.tsx` — `pendingVerificationEmail` state 추가. 인증 대기 상태이면 `EmailVerificationScreen` 렌더링. `handleSignupPendingVerification`로 닉네임을 `useAuth`에 보관하고 이메일을 state에 저장.
- `app/utils/supabase.ts` — 주석 추가 (detectSessionInUrl: false 이유 명확화).
- `app/app.json` — `"scheme": "investdashboard"` 추가 (딥링크 지원).
- `app/services/auth.ts` — (supabase-impl-agent 작업) `signUp` 반환 타입 변경, `resendVerificationEmail` 추가.

## UI 레퍼런스 매핑
- `ui/` 레퍼런스 없음 — PRD-001-auth.md의 화면 구성 기술을 직접 구현

## 특이사항
- `pendingNickname`을 `useRef`로 관리하여 렌더링을 유발하지 않음. 닉네임은 메모리에만 보관되어 앱 종료 시 사라짐 (의도된 동작 — 이메일 인증은 앱 세션 내에서 완료해야 함).
- `SIGNED_IN` 이벤트는 일반 로그인 시에도 발생. `pendingNicknameRef.current`가 null이면 `createProfile`을 호출하지 않으므로 일반 로그인에는 영향 없음.
- 딥링크 복귀 시 Supabase가 자동으로 세션을 처리하고 `SIGNED_IN` 이벤트를 발생시킴. `detectSessionInUrl: false`이지만 Expo의 scheme 설정과 Supabase의 PKCE 처리가 내부적으로 연동됨.
- Supabase 대시보드에서 Redirect URL 등록 필요: `investdashboard://` (Authentication > URL Configuration).
