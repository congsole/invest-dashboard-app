# DB Schema

*최종 업데이트: [001] 사용자 인증 — 2026-04-09*

## 테이블

### profiles
사용자 추가 프로필 정보. Supabase Auth `auth.users`와 1:1 관계.

| 컬럼 | 타입 | 기본값 | 제약 | 설명 |
|------|------|--------|------|------|
| id | uuid | gen_random_uuid() | PK | 기본 키 |
| user_id | uuid | — | FK → auth.users(id) ON DELETE CASCADE, unique, not null | Supabase Auth 사용자 ID |
| nickname | text | — | not null, length 2~20 | 닉네임 |
| created_at | timestamptz | now() | not null | 생성 시각 |
| updated_at | timestamptz | now() | not null | 수정 시각 |

**인덱스**
- `idx_profiles_user_id` ON (user_id) — user_id로 프로필 단건 조회

**RLS 방향**
- SELECT: 본인(`auth.uid() = user_id`)만 조회 가능
- INSERT: 본인 user_id로만 삽입 가능 (`auth.uid() = user_id`)
- UPDATE: 본인 레코드만 수정 가능 (`auth.uid() = user_id`)
- DELETE: 허용하지 않음 (회원 탈퇴는 이번 이슈 범위 외)

---

## ERD (텍스트)

```
auth.users ||--|| profiles : "1:1 (user_id FK)"
```

## 변경 이력

| 이슈 | 변경 내용 |
|------|----------|
| [001] 사용자 인증 | profiles 테이블 추가. auth.users는 Supabase Auth 관리. |
