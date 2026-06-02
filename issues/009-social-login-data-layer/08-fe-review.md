# [009] 소셜 로그인 데이터/API 레이어 — FE 리뷰

## 리뷰 결과: PASS

## 리뷰 대상 파일
- `app/types/auth.ts`
- `app/services/auth.ts`
- `app/hooks/useAuth.ts`
- `app/screens/AuthScreen.tsx` (소셜 로그인 UI 포함 — 이슈 010 선행 구현)
- `app/package.json`

## TypeScript 컴파일
- `npx tsc --noEmit` 실행 결과 앱 소스에서 에러 없음 (Supabase Edge Function Deno 에러만 존재, 기존 이슈)

## 체크리스트

### 1. API 명세 준수
- [x] `signInWithOAuth` — provider, redirectTo 파라미터 API 명세 일치
- [x] `extractSocialNickname` — `full_name` > `name` > 이메일@앞부분 > '사용자' 폴백 순서 명세 일치
- [x] `createProfile` 호출 조건 — SIGNED_IN 이벤트 + profiles 레코드 미존재 시 자동 호출
- [x] `getProfile` — `maybeSingle()` 대신 `single()` + PGRST116 에러 코드 처리 (기존 패턴 유지)

### 2. 기존 코드 패턴 준수
- [x] 서비스 함수 구조: throw error 패턴 일관성 유지
- [x] 훅 구조: useEffect 내 구독/해제 패턴 유지
- [x] 타입 정의: types/ 디렉토리에 공유 타입, services/에서 re-export

### 3. 에러 처리
- [x] `signInWithOAuth`: provider 설정 오류, 네트워크 오류 throw
- [x] `USER_CANCELLED` 에러: AuthScreen에서 무시 처리 (사용자 취소 시 에러 미표시)
- [x] 프로필 자동 생성 실패 시 로그인 유지 (catch에서 setUser 호출)
- [x] `extractSocialNickname`: 빈 문자열 폴백에 `||` 사용 (nullish coalescing 대신)

### 4. 렌더링 최적화 (CLAUDE.md 규칙)
- [x] 소셜 로그인 로딩은 `socialLoading` 상태로 해당 버튼에만 영향
- [x] `handleSocialLogin`은 `useCallback`으로 참조 안정화
- [x] 기존 콘텐츠(폼 필드) 유지하면서 버튼만 disabled 처리

### 5. 보안
- [x] OAuth URL은 `skipBrowserRedirect: true`로 앱 내에서 직접 열지 않음
- [x] 토큰 추출은 `WebBrowser.openAuthSessionAsync` 콜백 URL에서만 처리
- [x] 환경변수/시크릿 노출 없음

## 발견 사항 (Minor, 수정 불필요)

1. **기존 이메일 로그인 시 getProfile 호출 추가**: `SIGNED_IN` 이벤트마다 `getProfile()` DB 조회가 발생한다. 기존 이메일 로그인 사용자에게도 불필요한 네트워크 왕복이 추가되지만, 소셜 로그인 첫 로그인 판별에 필요한 로직이므로 수용 가능. 향후 성능 이슈 시 `app_metadata.provider`로 분기하는 최적화를 고려할 수 있음.

2. **Profile/AuthUser 타입 이중 정의**: `services/auth.ts`와 `types/auth.ts`에 동일 타입이 존재. 기존 이슈이며 이번 변경 범위 밖.

3. **AuthScreen에 소셜 로그인 UI 포함**: 이슈 009는 데이터/API 레이어 이슈이나, AuthScreen에도 소셜 로그인 버튼이 추가됨. 이슈 010(소셜 로그인 UI)의 범위이지만, 서비스 함수와 함께 구현되어 있어 기능적으로 완결됨. 별도 이슈로 추적 불필요.

## 결론

모든 구현이 API 명세, 기획서, 기존 코드 패턴에 부합하며 TypeScript 컴파일 에러 없음. PASS 처리.
