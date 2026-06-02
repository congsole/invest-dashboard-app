# [009] Supabase 구현 — 소셜 로그인 데이터/API 레이어

## 구현 요약

DB 스키마 변경 없음 (`auth.identities`는 Supabase 자동 관리). 서비스 레이어와 인증 훅에 소셜 로그인 지원을 추가했다.

## 변경 파일

### 1. `app/services/auth.ts`
- **`OAuthProvider` 타입 추가**: `'google' | 'apple'` 리터럴 유니온
- **`signInWithOAuth(provider)` 함수 추가**: 
  - `supabase.auth.signInWithOAuth`로 OAuth URL 생성 (`skipBrowserRedirect: true`)
  - `expo-web-browser`의 `openAuthSessionAsync`로 시스템 브라우저에서 OAuth 플로우 실행
  - 딥링크 복귀 시 URL fragment에서 access_token/refresh_token 추출하여 `setSession` 호출
  - 사용자 취소 시 `USER_CANCELLED` 에러 throw
- **`extractSocialNickname(userMetadata, email)` 함수 추가**:
  - `full_name` → `name` → 이메일 @ 앞부분 → `'사용자'` 순서로 폴백
  - 닉네임 길이 제약(2~20자) 적용

### 2. `app/hooks/useAuth.ts`
- **`onAuthStateChange` 콜백 확장**:
  - `SIGNED_IN` 이벤트 시 `pendingNicknameRef`가 없으면 (소셜 로그인 또는 기존 사용자 로그인)
  - `getProfile`로 프로필 존재 여부 확인
  - 프로필 없으면 `extractSocialNickname`으로 닉네임 추출 후 `createProfile` 자동 호출
  - 프로필 있으면 기존 사용자이므로 바로 user 설정
  - import에 `extractSocialNickname`, `getProfile` 추가

## DB 마이그레이션
- 없음 (Supabase 대시보드에서 Google/Apple Provider 활성화는 운영 설정)

## 사전 의존성 (운영 설정)
- GCP Console: OAuth 2.0 클라이언트 ID 생성 (iOS, Web)
- Apple Developer Console: Sign in with Apple 활성화
- Supabase 대시보드: Google/Apple Provider 활성화 및 키 등록
- `expo-web-browser` 패키지 설치
- `expo-apple-authentication` 패키지 설치 및 `app.json` 플러그인 등록
