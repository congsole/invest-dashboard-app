# API Spec

*최종 업데이트: [001] 사용자 인증 — 2026-04-09*

## 공통

- Base: Supabase REST API / Supabase Auth SDK
- 인증: Supabase Auth JWT (자동 관리, `supabase.auth` 메서드 사용)
- 응답 에러 형식: `{ "error": { "code": string, "message": string } }`

---

## Auth (인증)

### 회원가입 (Sign Up)

- **방식**: Supabase Auth SDK
- **호출**: `supabase.auth.signUp({ email, password })`
- **인증**: 불필요

**요청 파라미터**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| email | string | Y | 이메일 주소 |
| password | string | Y | 비밀번호 (8자 이상) |

**응답**
```typescript
{
  user: {
    id: string;       // uuid
    email: string
    created_at: string
  } | null;
  session: Session | null
}
```

**에러 케이스**
| 코드 | 상황 |
|------|------|
| 400 | 이메일 형식 오류 또는 비밀번호 8자 미만 |
| 422 | 이미 사용 중인 이메일 |

---

### 프로필 생성 (Create Profile)

회원가입 직후 호출하여 닉네임을 저장한다.

- **방식**: REST (auto-generated)
- **호출**: `supabase.from('profiles').insert({ user_id, nickname })`
- **인증**: 필요 (회원가입 직후 세션 사용)

**요청 파라미터**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| user_id | string | Y | 가입한 사용자 UUID |
| nickname | string | Y | 닉네임 (2~20자) |

**응답**
```typescript
{
  id: string
  user_id: string
  nickname: string
  created_at: string
  updated_at: string
}
```

**에러 케이스**
| 코드 | 상황 |
|------|------|
| 401 | 인증 토큰 없음 또는 만료 |
| 403 | RLS 위반 (다른 사용자 user_id로 삽입 시도) |
| 422 | 닉네임 길이 제약 위반 |

---

### 로그인 (Sign In)

- **방식**: Supabase Auth SDK
- **호출**: `supabase.auth.signInWithPassword({ email, password })`
- **인증**: 불필요

**요청 파라미터**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| email | string | Y | 이메일 주소 |
| password | string | Y | 비밀번호 |

**응답**
```typescript
{
  user: {
    id: string
    email: string
  } | null
  session: {
    access_token: string
    refresh_token: string
    expires_at: number
  } | null
}
```

**에러 케이스**
| 코드 | 상황 |
|------|------|
| 400 | 이메일 형식 오류 |
| 401 | 이메일 없음 또는 비밀번호 불일치 |

---

### 로그아웃 (Sign Out)

- **방식**: Supabase Auth SDK
- **호출**: `supabase.auth.signOut()`
- **인증**: 필요

**요청 파라미터**
없음

**응답**
```typescript
{ error: null }
```

**에러 케이스**
| 코드 | 상황 |
|------|------|
| 401 | 이미 로그아웃된 상태 |
| 네트워크 오류 | 오프라인 상태 (로컬 세션은 삭제, 서버 요청 실패) |

---

### 세션 복원 (Session Restore)

- **방식**: Supabase Auth SDK
- **호출**: `supabase.auth.getSession()`
- **인증**: 불필요 (저장된 세션 읽기)

**요청 파라미터**
없음

**응답**
```typescript
{
  session: {
    user: { id: string; email: string }
    access_token: string
    refresh_token: string
    expires_at: number
  } | null
}
```

---

### 세션 상태 변경 구독 (Auth State Change)

인증 상태 변화(로그인, 로그아웃, 세션 만료)를 실시간으로 감지한다.

- **방식**: Supabase Auth SDK (이벤트 구독)
- **호출**: `supabase.auth.onAuthStateChange(callback)`
- **인증**: 불필요

**이벤트 타입**
| 이벤트 | 상황 |
|--------|------|
| SIGNED_IN | 로그인 또는 세션 복원 성공 |
| SIGNED_OUT | 로그아웃 또는 세션 만료 |
| TOKEN_REFRESHED | 토큰 자동 갱신 |

---

## 변경 이력

| 이슈 | 변경 내용 |
|------|----------|
| [001] 사용자 인증 | Auth 도메인 추가 (signup, createProfile, signIn, signOut, getSession, onAuthStateChange) |
