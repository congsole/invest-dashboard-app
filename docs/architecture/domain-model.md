# Domain Model

*최종 업데이트: [001] 사용자 인증 — 2026-04-09*

## 엔터티

### User
Supabase Auth가 관리하는 인증 사용자. `auth.users` 테이블에 저장되며 앱에서 직접 생성하지 않는다.

| 속성 | 타입 | 설명 | 제약 |
|------|------|------|------|
| id | uuid | 기본 키 (Supabase Auth 생성) | PK, not null |
| email | text | 로그인용 이메일 | unique, not null |
| created_at | timestamptz | 가입 시각 | not null |

### Profile
회원가입 시 사용자가 입력하는 추가 프로필 정보. `auth.users`와 1:1 관계.

| 속성 | 타입 | 설명 | 제약 |
|------|------|------|------|
| id | uuid | 기본 키 (auth.users.id와 동일) | PK, not null |
| user_id | uuid | Supabase Auth 사용자 ID | FK → auth.users(id), unique, not null |
| nickname | text | 닉네임 (2~20자) | not null |
| created_at | timestamptz | 프로필 생성 시각 | not null |
| updated_at | timestamptz | 프로필 수정 시각 | not null |

### Session
Supabase Auth가 세션을 관리한다. 앱 도메인 엔터티로는 별도 정의하지 않으며, Supabase Auth 내부 세션 메커니즘(JWT + refresh token)을 사용한다. 클라이언트는 `expo-secure-store`에 세션을 저장하여 자동 로그인을 구현한다.

## 관계

| 관계 | 설명 |
|------|------|
| User 1:1 Profile | 한 사용자는 하나의 프로필을 가진다. 회원가입 시 자동 생성. |

## 변경 이력

| 이슈 | 변경 내용 |
|------|----------|
| [001] 사용자 인증 | User, Profile 엔터티 추가. Session은 Supabase Auth 위임으로 별도 엔터티 없음. |
| [002] 이메일 인증 플로우 | 기존 엔터티 변경 없음. 프로필 저장 시점 명확화: 이메일 인증 완료(`SIGNED_IN` 이벤트) 후 저장. 닉네임은 회원가입~인증 완료 사이 메모리(state)에 임시 보관. |
