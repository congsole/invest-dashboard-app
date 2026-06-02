# [010] 소셜 로그인 UI — FE 코드 리뷰

## 리뷰 결과: PASS

## Initial Review

### 검토 항목

#### 1. 기획서 준수
- [x] 로그인 탭: 구분선("또는") + Google 버튼 + Apple 버튼 배치
- [x] 회원가입 탭: 동일한 구분선 + 소셜 버튼 배치 (회원가입 겸용)
- [x] 로딩 중 버튼 비활성화 및 인디케이터 표시
- [x] 에러 처리 (네트워크 오류, provider 설정 오류, 사용자 취소)
- [x] 소셜 로그인 신규 사용자 프로필 자동 생성

#### 2. API 명세 준수
- [x] `signInWithOAuth`는 `supabase.auth.signInWithOAuth`를 사용
- [x] `skipBrowserRedirect: true` + `WebBrowser.openAuthSessionAsync`로 시스템 브라우저 OAuth 실행
- [x] 딥링크 복귀 시 `access_token`, `refresh_token` 추출하여 `setSession` 호출
- [x] 프로필 자동 생성: `user_metadata.full_name` > `name` > 이메일 앞부분 > '사용자' 폴백

#### 3. 렌더링 최적화 원칙
- [x] `handleSocialLogin`은 `useCallback`으로 메모이제이션
- [x] `socialLoading`은 provider별로 구분하여 해당 버튼에만 로딩 표시
- [x] 소셜 로그인 상태는 AuthScreen 내부에 한정

#### 4. 코드 품질
- [x] TypeScript 타입 체크 통과 (앱 코드 범위)
- [x] `OAuthProvider` 타입은 `types/auth.ts`에 정의, `services/auth.ts`에서 re-export
- [x] `extractSocialNickname`은 빈 문자열도 폴백하도록 `||` 연산자 사용
- [x] `USER_CANCELLED` 에러는 사용자에게 표시하지 않음

### 발견된 이슈 및 수정

| # | 이슈 | 심각도 | 상태 |
|---|------|--------|------|
| 1 | `socialError`가 탭 전환 시 초기화되지 않음 | Minor | 수정 완료 — 탭 `onPress`에 `setSocialError('')` 추가 |

### 허용 가능한 트레이드오프

1. **소셜 로그인 버튼 JSX 중복**: 로그인/회원가입 탭에 동일한 구분선+버튼이 반복됨. 별도 컴포넌트 추출 가능하나, 현재 규모에서는 인라인이 가독성이 더 좋음.
2. **`useAuth`에서 매 `SIGNED_IN` 이벤트마다 `getProfile` 호출**: 소셜 로그인 신규 사용자 감지를 위해 필수. 기존 사용자도 1회 추가 쿼리가 발생하지만, 로그인은 빈도가 낮은 이벤트이므로 허용 가능.

## 최종 판정

PASS -- 기획서, API 명세, 렌더링 최적화 원칙을 모두 준수. Minor 이슈 1건 즉시 수정 완료.
