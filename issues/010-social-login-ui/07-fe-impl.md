# [010] 소셜 로그인 UI — FE 구현 기록

## 구현 요약

기존 `AuthScreen`에 Google/Apple 소셜 로그인 버튼 UI를 추가하고, `signInWithOAuth` 서비스 함수와 소셜 로그인 프로필 자동 생성 로직을 구현했다.

## 변경 파일

### 1. `app/services/auth.ts`
- `expo-web-browser` import 추가
- `OAuthProvider` 타입을 `types/auth.ts`에서 import 후 re-export
- **`signInWithOAuth(provider)`** 함수 추가: Supabase OAuth URL을 가져온 후 `WebBrowser.openAuthSessionAsync`로 시스템 브라우저에서 인증, 딥링크 복귀 시 세션 토큰 설정
- **`extractSocialNickname(userMetadata, email)`** 헬퍼 추가: `full_name` > `name` > 이메일 앞부분 > '사용자' 순으로 폴백, 2~20자 제약 적용

### 2. `app/types/auth.ts`
- `OAuthProvider` 타입 추가 (`'google' | 'apple'`)
- `SignInWithOAuthParams`, `SignInWithOAuthResult` 인터페이스 추가

### 3. `app/hooks/useAuth.ts`
- `extractSocialNickname`, `getProfile` import 추가
- `onAuthStateChange` 핸들러에서 `SIGNED_IN` 이벤트 처리 확장:
  - (A) 기존 이메일 인증 플로우: `pendingNickname` 있으면 프로필 생성
  - (B) 소셜 로그인/일반 로그인: `getProfile`로 기존 프로필 확인 → 없으면 `extractSocialNickname`으로 닉네임 추출 후 `createProfile` 자동 호출

### 4. `app/screens/AuthScreen.tsx`
- `signInWithOAuth`, `OAuthProvider` import 추가
- `useCallback` import 추가
- 소셜 로그인 상태 추가: `socialLoading` (현재 진행 중인 provider), `socialError`
- `parseSocialAuthError` 에러 파싱 함수 추가 (네트워크 오류, provider 설정 오류, 일반 에러)
- `handleSocialLogin` 핸들러 추가 (`useCallback` 메모이제이션):
  - `USER_CANCELLED` 에러는 무시 (사용자 취소)
  - 소셜 로그인 중 이메일/비밀번호 버튼 비활성화
- **로그인 탭**: 로그인 버튼 아래에 구분선("또는") + Google/Apple 버튼 배치
- **회원가입 탭**: 회원가입 버튼 아래에 구분선("또는") + Google/Apple 버튼 배치 (회원가입 겸용)
- 스타일 추가: `dividerRow`, `dividerLine`, `dividerText`, `socialButton`, `socialButtonDisabled`, `googleButton`, `socialButtonText`, `appleButton`, `appleButtonText`

### 5. 패키지 설치
- `expo-web-browser` 설치 (`npx expo install`)

## 기획서 준수 사항
- 로그인/회원가입 탭 모두에 구분선("또는") + "Google로 로그인" + "Apple로 로그인" 버튼 배치
- 로딩 중 모든 버튼 비활성화 및 ActivityIndicator 표시
- 사용자 취소 시 에러 메시지 미표시
- 소셜 로그인 신규 사용자 프로필 자동 생성 (provider display name 기반)
- 에러 상황별 한국어 메시지 표시

## 렌더링 최적화 준수
- `handleSocialLogin`은 `useCallback`으로 메모이제이션
- `socialLoading`은 provider별로 구분하여 해당 버튼에만 로딩 인디케이터 표시
- 소셜 로그인 상태는 AuthScreen 내부에 한정 (상위 전파 없음)
