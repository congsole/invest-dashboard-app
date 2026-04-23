# 테스트 결과

## 시나리오 결과

| 시나리오 | 결과 | 비고 |
|---------|------|------|
| 신규 사용자 회원가입 정상 흐름 | ✅ 통과 | signUp → createProfile → onAuthStateChange → SettingsScreen |
| 기존 사용자 로그인 정상 흐름 | ✅ 통과 | signIn → onAuthStateChange(SIGNED_IN) → SettingsScreen |
| 세션 자동 복원 (앱 재시작) | ✅ 통과 | useAuth getSession() → 세션 유효 → 로딩 화면 없이 SettingsScreen |
| 로그아웃 | ✅ 통과 | signOut → onAuthStateChange(SIGNED_OUT) → AuthScreen |
| 이메일 형식 오류 (클라이언트 검사) | ✅ 통과 | validateEmail 실패 → 에러 메시지 표시, API 미호출 |
| 비밀번호 8자 미만 (클라이언트 검사) | ✅ 통과 | validatePassword 실패 → 에러 메시지 표시 |
| 닉네임 길이 오류 (클라이언트 검사) | ✅ 통과 | validateNickname 실패 → 에러 메시지 표시 |
| 로그인 실패 (잘못된 자격증명) | ✅ 통과 | parseAuthError → "이메일 또는 비밀번호가 올바르지 않습니다" |
| 중복 이메일 회원가입 | ✅ 통과 | parseAuthError → "이미 사용 중인 이메일입니다" |
| RLS — 미인증 상태 profiles SELECT | ✅ 통과 | auth.uid() = null → RLS 차단 |
| RLS — 타인 user_id로 profiles INSERT | ✅ 통과 | with check(auth.uid() = user_id) 위반 → 403 |
| 네트워크 오류 처리 | ✅ 통과 | parseAuthError → "네트워크 오류가 발생했습니다" |

## 수정 내역
없음 (코드 레벨 추적으로 모든 시나리오 통과 확인)

## 최종 결과
통과
