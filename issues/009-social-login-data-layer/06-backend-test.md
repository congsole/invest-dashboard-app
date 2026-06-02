# [009] 백엔드 통합 테스트 — 소셜 로그인 데이터/API 레이어

## 테스트 파일
`app/tests/integration/009-social-login-data-layer.test.ts`

## 실행 결과
```
Test Suites: 1 passed, 1 total
Tests:       10 passed, 10 total
Time:        6.287 s
```

## 테스트 항목

### extractSocialNickname (8 케이스)
| # | 테스트 | 결과 |
|---|--------|------|
| 1 | full_name이 있으면 full_name 사용 | PASS |
| 2 | full_name 없으면 name 폴백 | PASS |
| 3 | full_name, name 없으면 이메일 @ 앞부분 폴백 | PASS |
| 4 | 메타데이터, 이메일 모두 없으면 "사용자" 반환 | PASS |
| 5 | full_name 빈 문자열이면 name 폴백 | PASS |
| 6 | 20자 초과 시 잘라냄 | PASS |
| 7 | 1자짜리 이름이면 "사용자" 폴백 | PASS |
| 8 | 이메일 @ 앞부분 1자이면 "사용자" 폴백 | PASS |

### 소셜 로그인 프로필 자동 생성 시뮬레이션 (2 케이스)
| # | 테스트 | 결과 |
|---|--------|------|
| 1 | 신규 사용자 프로필 생성 (getProfile null → createProfile) | PASS |
| 2 | 기존 프로필 중복 생성 시 UNIQUE 제약 위반 (23505) | PASS |

## 테스트 범위 외 (E2E 필요)
- `signInWithOAuth` 함수 자체 (시스템 브라우저 + OAuth provider 상호작용 필요)
- `useAuth` 훅의 `onAuthStateChange` 소셜 로그인 분기 (React 훅 + Supabase 이벤트)

## 판정: 합격
