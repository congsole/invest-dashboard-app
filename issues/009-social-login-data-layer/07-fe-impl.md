# [009] 소셜 로그인 데이터/API 레이어 — FE 구현

## 변경 파일

### 1. `app/types/auth.ts`
- **추가** `OAuthProvider` 타입 (`'google' | 'apple'`)
- **추가** `SignInWithOAuthParams` 인터페이스
- **추가** `SignInWithOAuthResult` 인터페이스 (API 명세 대응)

### 2. `app/services/auth.ts`
- **추가** `import * as WebBrowser from 'expo-web-browser'` — OAuth 브라우저 세션 관리
- **추가** `import type { OAuthProvider } from '../types/auth'` — 타입 임포트 (기존 로컬 재정의 제거)
- **추가** `signInWithOAuth(provider)` 함수:
  - `supabase.auth.signInWithOAuth({ provider, options: { redirectTo, skipBrowserRedirect: true } })` 호출
  - `WebBrowser.openAuthSessionAsync(url, redirectTo)` 로 시스템 브라우저에서 OAuth 플로우 실행
  - 사용자 취소 시 `USER_CANCELLED` 에러 throw
  - 딥링크 복귀 시 URL fragment에서 access_token/refresh_token 추출 후 `supabase.auth.setSession()` 호출
- **추가** `extractSocialNickname(userMetadata, email)` 유틸 함수:
  - `full_name` -> `name` -> 이메일 `@` 앞부분 -> `'사용자'` 순서로 폴백
  - 닉네임 길이 제약(2~20자) 적용

### 3. `app/hooks/useAuth.ts`
- **수정** `onAuthStateChange` 콜백 내 `SIGNED_IN` 이벤트 처리 로직 확장:
  - 기존: `pendingNicknameRef`가 있을 때만 프로필 생성 (이메일 가입 전용)
  - 변경: `pendingNicknameRef`가 없는 경우에도 `getProfile()` 조회 후 프로필 미존재 시 `extractSocialNickname()`으로 닉네임 추출하여 `createProfile()` 자동 호출
  - **추가** `import { extractSocialNickname, getProfile }` from services/auth

### 4. `app/package.json`
- **추가** `expo-web-browser: ~15.0.11` 의존성

## 구현 요약

이슈 009는 소셜 로그인의 데이터/API 레이어 구현이며, UI는 이슈 010에서 처리한다. 핵심 변경:

1. **서비스 함수**: `signInWithOAuth` — Supabase OAuth + expo-web-browser 연동으로 Google/Apple 로그인 플로우를 서비스 레이어에서 캡슐화
2. **프로필 자동 생성**: `useAuth` 훅의 `onAuthStateChange` 콜백에서 소셜 로그인 첫 로그인 시 provider display name 기반 닉네임으로 프로필을 자동 생성
3. **닉네임 추출 유틸**: `extractSocialNickname` — API 명세대로 `full_name` > `name` > 이메일 앞부분 > '사용자' 순서 폴백, 길이 제약 적용

기존 이메일 로그인 플로우(pendingNickname 기반)는 그대로 유지되며, 소셜 로그인 경로가 추가된 형태다.
