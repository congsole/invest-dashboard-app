# 테스트 결과

## 시나리오 결과

| 시나리오 | 결과 | 비고 |
|---------|------|------|
| 신규 회원가입 → 이메일 인증 → 메인 화면 이동 | ✅ 통과 | |
| 이메일 미인증 로그인 시도 | ✅ 통과 | `parseAuthError`에서 `Email not confirmed` 처리 확인 |
| 인증 메일 재발송 + 60초 쿨다운 | ✅ 통과 | |
| 로그인 화면으로 돌아가기 | ✅ 통과 | |
| 앱 재시작 후 자동 로그인 | ✅ 통과 | 기존 `getSession` 로직 유지 |
| 닉네임 경계값 (2자/20자) | ✅ 통과 | `validateNickname` 2~20자 검사 |
| `SIGNED_IN` 이벤트 중 AuthScreen 깜빡임 | ❌ 실패 → 수정 완료 | `setLoading(true)` 추가로 수정 |

## 수정 내역

### `app/hooks/useAuth.ts`
- **버그**: `SIGNED_IN` + `pendingNickname` 조건에서 `setLoading(false)`가 `createProfile` (async) 완료 전에 실행되어 `loading=false, user=null` 순간 발생 → AuthScreen 깜빡임 가능
- **수정**: `createProfile` 실행 전 `setLoading(true)`, 완료/실패 후 `.finally(() => setLoading(false))`로 변경. 기타 경로에서는 `setUser`와 `setLoading`을 함께 처리.

## 최종 결과
통과

## 사용자 확인 필요 (런타임 검증)
- [x] Supabase 대시보드 SQL Editor에서 기존 마이그레이션 SQL이 적용되어 있는지 확인 (`profiles` 테이블 존재 여부)
- [x] 환경변수 설정 확인 (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_KEY` in `app/.env.local`)
- [ ] Supabase 대시보드 → Authentication → URL Configuration에 Redirect URL 등록: `investdashboard://`
- [ ] 실제 앱에서 회원가입 → 이메일 수신 → 링크 클릭 → 앱 복귀 시나리오 직접 테스트
- [ ] Expo Go 환경에서 딥링크 동작 확인 (Expo Go는 자체 scheme 사용으로 커스텀 scheme 미지원 가능 — Development Build 필요할 수 있음)
