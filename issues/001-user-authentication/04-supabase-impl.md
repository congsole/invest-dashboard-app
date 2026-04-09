# Supabase 구현 내역

## 마이그레이션
- `app/supabase/migrations/20260409000000_user-authentication.sql`
  - `public.profiles` 테이블 생성 (id, user_id FK→auth.users, nickname, created_at, updated_at)
  - RLS 활성화 및 정책 3개 (SELECT/INSERT/UPDATE — 본인 데이터만)
  - `idx_profiles_user_id` 인덱스 생성
  - `set_updated_at` 트리거 함수 및 트리거 연결

## Edge Functions
- 없음 (모든 API가 Supabase Auth SDK + REST로 구현 가능)

## 클라이언트 유틸
- `app/utils/auth.ts`
  - `signUp({ email, password, nickname })` — 회원가입 + 프로필 생성
  - `createProfile({ userId, nickname })` — profiles 테이블 INSERT
  - `signIn({ email, password })` — 로그인
  - `signOut()` — 로그아웃
  - `getSession()` — 세션 복원
  - `getProfile(userId)` — 프로필 조회

## 특이사항
- 회원가입 시 `signUp` 함수 내부에서 `createProfile`을 연속 호출하여 원자적으로 처리
- `getProfile`에서 PGRST116(레코드 없음)은 null 반환으로 처리 (에러 아님)
- 네트워크 오류 포함 모든 Supabase 에러는 throw하여 UI 레이어에서 처리
