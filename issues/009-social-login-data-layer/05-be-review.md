# [009] 백엔드 코드 리뷰 — 소셜 로그인 데이터/API 레이어

## 리뷰 대상
- `app/services/auth.ts` — signInWithOAuth, extractSocialNickname 추가
- `app/hooks/useAuth.ts` — onAuthStateChange 소셜 로그인 프로필 자동 생성 로직

## Initial Review

### 수정 완료
1. **`extractSocialNickname`에서 빈 문자열 폴백 누락** (severity: medium)
   - `??` (nullish coalescing)는 `null`/`undefined`만 폴백하므로 provider가 `full_name: ""`을 반환하면 빈 닉네임이 사용됨
   - `||` (OR)로 변경하여 빈 문자열도 폴백 대상에 포함
   - 상태: 수정 완료

### 확인 사항 (이상 없음)
1. **signInWithOAuth — skipBrowserRedirect + openAuthSessionAsync 패턴**: Expo에서 OAuth를 처리하는 표준 패턴. 올바르게 구현됨.
2. **URL fragment 토큰 추출**: hash 기반 파싱으로 access_token/refresh_token 추출 후 setSession 호출. App.tsx의 기존 딥링크 핸들러와 동일한 패턴.
3. **사용자 취소 처리**: `USER_CANCELLED` 에러를 throw하여 UI에서 구분 가능.
4. **useAuth 소셜 프로필 자동 생성**: getProfile → 없으면 createProfile 체인. 에러 시에도 로그인 유지 (graceful degradation).
5. **기존 이메일 로그인 플로우 보존**: pendingNicknameRef 분기가 유지되어 기존 동작에 영향 없음.

### 참고 사항 (non-blocking)
1. **일반 이메일 로그인 시 불필요한 getProfile 호출**: SIGNED_IN 이벤트에서 pendingNickname이 없으면 항상 getProfile을 호출함. 기존 이메일 사용자도 매번 호출하게 되나, 이는 성능 이슈일 뿐 기능상 문제 없음. 프로필이 이미 존재하면 바로 반환되므로 추가 비용은 1회 SELECT 쿼리.

## 결론
- 판정: **합격**
- 수정 사이클: 1회 (extractSocialNickname 빈 문자열 폴백)
