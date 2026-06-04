# API Spec

*최종 업데이트: b892f6d — 2026-06-04*

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

이메일 인증 완료 후(`SIGNED_IN` 이벤트 수신 시) 또는 소셜 로그인 첫 로그인 시(`SIGNED_IN` 이벤트 수신 후 profiles 레코드 없음 확인 시) 호출하여 닉네임을 저장한다. 소셜 로그인의 경우 닉네임은 `session.user.user_metadata.full_name` 또는 `name` 필드에서 자동 추출하며, 없으면 이메일 @ 앞부분을 사용한다.

- **방식**: REST (auto-generated)
- **호출**: `supabase.from('profiles').insert({ user_id, nickname })`
- **인증**: 필요 (세션 보유 상태)

**요청 파라미터**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| user_id | string | Y | 가입한 사용자 UUID |
| nickname | string | Y | 닉네임 (2~20자). 소셜 로그인 시 provider display name에서 자동 도출. |

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

### Google 소셜 로그인 (Sign In with Google)

Google OAuth 2.0 플로우를 시스템 브라우저에서 실행한다. 인증 완료 후 딥링크로 앱으로 복귀하면 `onAuthStateChange` → `SIGNED_IN` 이벤트가 발생한다. 신규 사용자면 프로필 생성(Create Profile)을 이어서 호출한다. 동일 이메일의 기존 계정이 있으면 Supabase가 자동 링킹하여 하나의 계정으로 병합한다.

- **방식**: Supabase Auth SDK
- **호출**: `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })`
- **인증**: 불필요
- **사전 의존성**: `expo-web-browser` 설치. GCP Console OAuth 2.0 클라이언트 ID (iOS, Web) 생성. Supabase 대시보드 → Authentication → Providers → Google 활성화 및 Client ID / Secret 등록.

**요청 파라미터**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| provider | `'google'` | Y | 고정값 |
| options.redirectTo | string | Y | 인증 완료 후 딥링크 URL (예: `investdashboard://auth/callback`). Supabase 대시보드 Redirect URL 목록에 등록 필요. |

**응답**
```typescript
{
  provider: 'google'
  url: string   // 시스템 브라우저에서 열릴 Google OAuth URL
}
```

> 실제 세션은 딥링크 복귀 후 `onAuthStateChange` 이벤트를 통해 수신한다.

**에러 케이스**
| 코드 | 상황 |
|------|------|
| 400 | provider 설정 오류 또는 미지원 provider |
| 네트워크 오류 | 오프라인 상태 |

---

### Apple 소셜 로그인 (Sign In with Apple)

Sign in with Apple 플로우를 네이티브 UI(`expo-apple-authentication`)로 실행한다. 인증 완료 후 `onAuthStateChange` → `SIGNED_IN` 이벤트가 발생한다. 신규 사용자면 프로필 생성(Create Profile)을 이어서 호출한다. iOS 전용.

- **방식**: Supabase Auth SDK
- **호출**: `supabase.auth.signInWithOAuth({ provider: 'apple', options: { redirectTo } })`
- **인증**: 불필요
- **사전 의존성**: `expo-apple-authentication` 설치 및 `app.json` 플러그인 등록. Apple Developer Console에서 Sign in with Apple 활성화. Supabase 대시보드 → Authentication → Providers → Apple 활성화 및 Service ID / Secret 등록.

**요청 파라미터**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| provider | `'apple'` | Y | 고정값 |
| options.redirectTo | string | Y | 인증 완료 후 딥링크 URL (예: `investdashboard://auth/callback`). Supabase 대시보드 Redirect URL 목록에 등록 필요. |

**응답**
```typescript
{
  provider: 'apple'
  url: string   // 네이티브 Apple 로그인 UI 또는 시스템 브라우저에서 열릴 URL
}
```

> 실제 세션은 딥링크 복귀 후 `onAuthStateChange` 이벤트를 통해 수신한다.

**에러 케이스**
| 코드 | 상황 |
|------|------|
| 400 | provider 설정 오류 또는 미지원 provider |
| 사용자 취소 | 사용자가 Apple 로그인 다이얼로그를 닫은 경우 |
| 네트워크 오류 | 오프라인 상태 |

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

### 인증 이메일 재발송 (Resend Verification Email)

이메일 인증 대기 화면에서 인증 메일을 재발송한다.

- **방식**: Supabase Auth SDK
- **호출**: `supabase.auth.resend({ type: 'signup', email })`
- **인증**: 불필요

**요청 파라미터**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| email | string | Y | 재발송할 이메일 주소 |

**응답**
```typescript
{ error: null }
```

**에러 케이스**
| 코드 | 상황 |
|------|------|
| 400 | 이메일 형식 오류 |
| 429 | Supabase 발송 제한 초과 |
| 네트워크 오류 | 오프라인 상태 |

---

### 세션 상태 변경 구독 (Auth State Change)

인증 상태 변화(로그인, 로그아웃, 세션 만료)를 실시간으로 감지한다. 소셜 로그인(Google / Apple) 완료 후 딥링크 복귀 시에도 `SIGNED_IN` 이벤트가 발생한다. 콜백 내에서 `profiles` 레코드 존재 여부를 확인하여 신규 사용자면 Create Profile을 자동 호출한다.

- **방식**: Supabase Auth SDK (이벤트 구독)
- **호출**: `supabase.auth.onAuthStateChange(callback)`
- **인증**: 불필요

**이벤트 타입**
| 이벤트 | 상황 |
|--------|------|
| SIGNED_IN | 이메일 인증 완료, 이메일 로그인 성공, 소셜 로그인 완료(Google/Apple), 세션 복원 성공 |
| SIGNED_OUT | 로그아웃 또는 세션 만료 |
| TOKEN_REFRESHED | 토큰 자동 갱신 |

**소셜 로그인 후 프로필 자동 생성 패턴**
```typescript
supabase.auth.onAuthStateChange(async (event, session) => {
  if (event === 'SIGNED_IN' && session) {
    // profiles 레코드 존재 여부 확인
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('user_id', session.user.id)
      .maybeSingle()

    if (!profile) {
      // 신규 사용자: 소셜 provider display name 또는 이메일 앞부분으로 닉네임 결정
      const nickname =
        session.user.user_metadata?.full_name ??
        session.user.user_metadata?.name ??
        session.user.email?.split('@')[0] ??
        '사용자'
      await supabase.from('profiles').insert({ user_id: session.user.id, nickname })
    }
  }
})

---

---

## AccountEvent (계정 이벤트)

5종 이벤트(매수/매도/입금/출금/배당)를 단일 테이블 `account_events`로 관리한다. 이벤트 타입에 따라 필수/선택 필드가 달라진다.

**이벤트 타입별 필드 규칙**

| event_type | ticker/name | quantity | price_per_unit | amount | fx_rate_at_event |
|-----------|-------------|----------|----------------|--------|-----------------|
| buy | 필수 | 필수 | 필수 | 필수 (체결가×수량±수수료±세금) | 선택 |
| sell | 필수 | 필수 | 필수 | 필수 | 선택 |
| deposit | null | null | null | 필수 (입금액) | 필수 (원금 KRW 환산용) |
| withdraw | null | null | null | 필수 (출금액) | 필수 (원금 KRW 환산용) |
| dividend | 선택 | null | null | 필수 (배당금액) | 선택 |

---

### 계정 이벤트 목록 조회

- **방식**: REST (auto-generated)
- **호출**: `supabase.from('account_events').select('*').eq('user_id', userId)` (필터 조건 추가)
- **인증**: 필요

**요청 파라미터 (쿼리)**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| event_type | `'buy' \| 'sell' \| 'deposit' \| 'withdraw' \| 'dividend'` | N | 이벤트 유형 필터 |
| asset_type | `'korean_stock' \| 'us_stock' \| 'crypto' \| 'cash'` | N | 자산 유형 필터 |
| ticker | string | N | 종목 코드 필터 |
| from | string (date) | N | 조회 시작일 (YYYY-MM-DD) |
| to | string (date) | N | 조회 종료일 (YYYY-MM-DD) |

**응답**
```typescript
Array<{
  id: string
  user_id: string
  event_type: 'buy' | 'sell' | 'deposit' | 'withdraw' | 'dividend'
  event_date: string              // YYYY-MM-DD
  asset_type: 'korean_stock' | 'us_stock' | 'crypto' | 'cash' | null
  ticker: string | null
  name: string | null
  quantity: number | null
  price_per_unit: number | null
  currency: string                // 'KRW' | 'USD' | 코인티커
  fee: number
  fee_currency: string | null
  tax: number
  amount: number
  fx_rate_at_event: number | null
  source: 'csv' | 'manual'
  external_ref: string | null
  created_at: string
}>
```

**에러 케이스**
| 코드 | 상황 |
|------|------|
| 401 | 인증 토큰 없음 또는 만료 |

---

### 계정 이벤트 등록

- **방식**: REST (auto-generated)
- **호출**: `supabase.from('account_events').insert({ ... })`
- **인증**: 필요

**요청 파라미터**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| event_type | `'buy' \| 'sell' \| 'deposit' \| 'withdraw' \| 'dividend'` | Y | 이벤트 유형 |
| event_date | string (date) | Y | 발생일 (YYYY-MM-DD) |
| asset_type | `'korean_stock' \| 'us_stock' \| 'crypto' \| 'cash' \| null` | N | 자산 유형. buy/sell은 필수. deposit/withdraw는 null 또는 'cash'. |
| ticker | string \| null | N | 종목 코드. buy/sell은 필수. deposit/withdraw는 null. dividend는 선택. |
| name | string \| null | N | 종목명. buy/sell은 필수. 그 외 선택. |
| quantity | number \| null | N | 수량 (> 0). buy/sell은 필수. 그 외 null. |
| price_per_unit | number \| null | N | 1주당 체결가 (>= 0). buy/sell은 필수. 그 외 null. |
| currency | string | Y | 거래 통화 (KRW / USD / 코인티커) |
| fee | number | N | 수수료 (기본 0) |
| fee_currency | string \| null | N | 수수료 통화 |
| tax | number | N | 세금 (기본 0). 배당의 원천징수 포함. |
| amount | number | Y | 정산금액 / 입출금액 / 배당금액 (통화 단위) |
| fx_rate_at_event | number \| null | N | 이벤트 시점 KRW/USD 환율. deposit/withdraw는 필수. |
| source | `'csv' \| 'manual'` | Y | 데이터 출처 |
| external_ref | string \| null | N | CSV 거래 식별자 (중복 검출용) |

**응답**
```typescript
{
  id: string
  user_id: string
  event_type: 'buy' | 'sell' | 'deposit' | 'withdraw' | 'dividend'
  event_date: string
  asset_type: 'korean_stock' | 'us_stock' | 'crypto' | 'cash' | null
  ticker: string | null
  name: string | null
  quantity: number | null
  price_per_unit: number | null
  currency: string
  fee: number
  fee_currency: string | null
  tax: number
  amount: number
  fx_rate_at_event: number | null
  source: 'csv' | 'manual'
  external_ref: string | null
  created_at: string
}
```

**에러 케이스**
| 코드 | 상황 |
|------|------|
| 400 | 필수 파라미터 누락, CHECK 제약 위반 (quantity <= 0 등), event_type 값 오류 |
| 401 | 인증 토큰 없음 또는 만료 |
| 403 | RLS 위반 |

---

### 계정 이벤트 수정

- **방식**: REST (auto-generated)
- **호출**: `supabase.from('account_events').update({ ... }).eq('id', id)`
- **인증**: 필요

**요청 파라미터**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| id | string (uuid) | Y | 수정할 이벤트 ID |
| (수정 필드) | — | N | 등록 파라미터 중 수정할 필드 |

**응답**
```typescript
{
  id: string
  // ... (등록 응답과 동일 구조)
}
```

**에러 케이스**
| 코드 | 상황 |
|------|------|
| 400 | CHECK 제약 위반 |
| 401 | 인증 토큰 없음 또는 만료 |
| 403 | RLS 위반 (다른 사용자 레코드 수정 시도) |
| 404 | 해당 ID 레코드 없음 |

---

### 계정 이벤트 삭제

- **방식**: REST (auto-generated)
- **호출**: `supabase.from('account_events').delete().eq('id', id)`
- **인증**: 필요

**요청 파라미터**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| id | string (uuid) | Y | 삭제할 이벤트 ID |

**응답**
```typescript
null  // 삭제 성공 시 데이터 없음
```

**에러 케이스**
| 코드 | 상황 |
|------|------|
| 401 | 인증 토큰 없음 또는 만료 |
| 403 | RLS 위반 (다른 사용자 레코드 삭제 시도) |
| 404 | 해당 ID 레코드 없음 |

---

### CSV 업로드 미리보기 (Edge Function)

증권사 CSV 파일을 업로드하면 파싱하여 미리보기용 데이터를 반환한다. 5종 이벤트(buy/sell/deposit/withdraw/dividend)를 모두 파싱 지원한다. DB에 저장하지 않는다.

- **방식**: RPC (Edge Function)
- **호출**: `supabase.functions.invoke('parse-account-csv', { body: formData })`
- **인증**: 필요

**요청 파라미터**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| file | File (multipart/form-data) | Y | 증권사 CSV 파일 |
| broker | string | N | 증권사 식별자 (자동 감지 시도, 실패 시 필수). 예: 'toss', 'samsung', 'kakao', 'upbit' |

**응답**
```typescript
{
  preview: Array<{
    row: number                   // 원본 CSV 행 번호
    event_type: 'buy' | 'sell' | 'deposit' | 'withdraw' | 'dividend'
    event_date: string            // YYYY-MM-DD
    asset_type: 'korean_stock' | 'us_stock' | 'crypto' | 'cash' | null
    ticker: string | null
    name: string | null
    quantity: number | null
    price_per_unit: number | null
    currency: string
    fee: number
    fee_currency: string | null
    tax: number
    amount: number
    fx_rate_at_event: number | null
    external_ref: string | null   // CSV 행 기반 해시 (중복 검출용)
  }>
  errors: Array<{
    row: number                   // 실패한 행 번호
    reason: string                // 실패 사유
  }>
  total_rows: number
  parsed_rows: number
  failed_rows: number
}
```

**에러 케이스**
| 코드 | 상황 |
|------|------|
| 400 | 지원하지 않는 파일 형식 또는 파싱 불가 포맷 |
| 401 | 인증 토큰 없음 또는 만료 |
| 413 | 파일 크기 초과 |

---

### CSV 파싱 결과 확정 저장 (Edge Function)

미리보기에서 확인한 데이터를 `account_events` 테이블에 일괄 저장한다. `external_ref` 해시 기반으로 중복 이벤트를 건너뛴다.

- **방식**: RPC (Edge Function)
- **호출**: `supabase.functions.invoke('confirm-account-csv', { body: { events } })`
- **인증**: 필요

**요청 파라미터**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| events | Array<AccountEventInput> | Y | parse-account-csv 응답의 preview 배열 (수정 가능) |

**응답**
```typescript
{
  inserted: number        // 저장 성공 건수
  skipped: number         // external_ref 중복으로 건너뛴 건수
  failed: Array<{
    row: number
    reason: string
  }>
}
```

**에러 케이스**
| 코드 | 상황 |
|------|------|
| 400 | 이벤트 데이터 유효성 오류 |
| 401 | 인증 토큰 없음 또는 만료 |
| 403 | RLS 위반 |

---

## Dashboard (대시보드 집계)

### KPI 데이터 조회 (DB Function)

총 평가액·원금·순수익·수익률·예수금(통화별)·누적 배당/수수료/세금을 집계하여 반환한다. 종목 평가액 계산에 필요한 현재가는 클라이언트에서 별도 조회(`Market` 도메인 참조) 후 합산하거나 `prices` 테이블의 최신 종가를 사용한다.

- **방식**: RPC (DB Function)
- **호출**: `supabase.rpc('get_kpi_summary', { p_asset_type, p_current_prices, p_fx_rate_usd })`
- **인증**: 필요

**요청 파라미터**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| p_asset_type | `'korean_stock' \| 'us_stock' \| 'crypto' \| null` | N | null이면 전체 부문 집계 |
| p_current_prices | `Array<{ ticker: string; asset_type: string; price: number; currency: string }>` | Y | 클라이언트가 조회한 현재가 목록 |
| p_fx_rate_usd | number | Y | 현재 USD/KRW 환율 |

**응답**
```typescript
{
  // 1차 행 KPI
  total_value_krw: number         // 총 평가액 (KRW 환산)
  principal_krw: number           // 원금 (KRW 환산, 입금 − 출금)
  net_profit_krw: number          // 순수익 (= total_value − principal)
  return_rate_pct: number         // 수익률 % (순수익 / 원금 × 100)

  // 2차 행 KPI
  cash: {
    krw: number                   // 예수금 KRW
    usd: number                   // 예수금 USD
    total_krw: number             // 전체 예수금 KRW 환산 합계
  }
  cumulative_dividend_krw: number // 누적 배당금 (KRW 환산)
  cumulative_fee_krw: number      // 누적 수수료 (KRW 환산)
  cumulative_tax_krw: number      // 누적 세금 (KRW 환산)

  // 종목별 포트폴리오 집계 (종목 카드 렌더링용)
  holdings: Array<{
    ticker: string
    name: string
    asset_type: 'korean_stock' | 'us_stock' | 'crypto'
    quantity: number              // 보유 수량 (매수 − 매도, corporate_actions 반영)
    avg_buy_price: number         // 평균 매수가 (가중평균)
    currency: string
    total_fee: number             // 누적 수수료 (원 통화)
    total_tax: number             // 누적 세금 (원 통화)
  }>
}
```

**에러 케이스**
| 코드 | 상황 |
|------|------|
| 400 | p_current_prices 형식 오류 또는 p_fx_rate_usd <= 0 |
| 401 | 인증 토큰 없음 또는 만료 |

---

### 자산 히스토리 그래프 데이터 (REST)

`daily_snapshots` 테이블을 기간 필터로 조회하여 3개 라인(원금/평가액/예수금) 데이터와 이벤트 마커(배당/출금)를 반환한다. "일" 기간은 실시간 폴링 데이터를 사용하므로 이 API에서 제외.

- **방식**: REST (auto-generated) + RPC (이벤트 마커)
- **호출 (스냅샷)**: `supabase.from('daily_snapshots').select('*').eq('user_id', userId).gte('snapshot_date', from).lte('snapshot_date', to).order('snapshot_date', { ascending: true })`
- **호출 (이벤트 마커)**: `supabase.rpc('get_history_markers', { p_from, p_to })`
- **인증**: 필요

**요청 파라미터 (스냅샷 조회)**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| period | `'week' \| 'month' \| 'year' \| 'all'` | Y | 기간 단위. 클라이언트에서 from/to 날짜로 변환 후 쿼리. |
| asset_type | `'korean_stock' \| 'us_stock' \| 'crypto' \| null` | N | null 또는 미지정이면 전체 (daily_snapshots는 전체 통합 값만 저장). 부문 필터 시 클라이언트에서 account_events 기반으로 별도 계산 필요. |

**응답 (daily_snapshots)**
```typescript
Array<{
  snapshot_date: string           // YYYY-MM-DD
  total_value_krw: number         // 총 평가액 (평가액 라인)
  principal_krw: number           // 원금 (원금 라인)
  cash_krw: number                // 예수금 KRW
  cash_usd: number                // 예수금 USD
  net_profit_krw: number          // 순수익
  fx_rate_usd: number             // 해당일 종가 환율
}>
```

**응답 (이벤트 마커 — get_history_markers)**

**요청 파라미터**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| p_from | string (date) | Y | 마커 조회 시작일 (YYYY-MM-DD) |
| p_to | string (date) | Y | 마커 조회 종료일 (YYYY-MM-DD) |

```typescript
Array<{
  event_date: string              // YYYY-MM-DD
  event_type: 'dividend' | 'withdraw'
  amount_krw: number              // KRW 환산 금액 (마커 크기 표현용)
}>
```

**에러 케이스**
| 코드 | 상황 |
|------|------|
| 401 | 인증 토큰 없음 또는 만료 |

---

## DailySnapshot (일별 스냅샷)

### 스냅샷 조회 (그래프용)

`daily_snapshots` 테이블에서 기간 및 부문 조건으로 데이터를 조회한다. Dashboard 도메인의 자산 히스토리 그래프가 내부적으로 사용하며, 직접 호출도 가능하다.

- **방식**: REST (auto-generated)
- **호출**: `supabase.from('daily_snapshots').select('snapshot_date, total_value_krw, principal_krw, cash_krw, cash_usd, net_profit_krw, fx_rate_usd').eq('user_id', userId).gte('snapshot_date', from).lte('snapshot_date', to).order('snapshot_date', { ascending: true })`
- **인증**: 필요

**요청 파라미터 (쿼리)**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| from | string (date) | Y | 조회 시작일 (YYYY-MM-DD) |
| to | string (date) | Y | 조회 종료일 (YYYY-MM-DD) |

**응답**
```typescript
Array<{
  snapshot_date: string           // YYYY-MM-DD
  total_value_krw: number
  principal_krw: number
  cash_krw: number
  cash_usd: number
  net_profit_krw: number
  fx_rate_usd: number
}>
```

**에러 케이스**
| 코드 | 상황 |
|------|------|
| 401 | 인증 토큰 없음 또는 만료 |

---

## CorporateAction (기업 액션)

### 기업 액션 목록 조회

특정 종목의 기업 액션(분할/합병 등)을 조회한다. 보유수량 및 평균매수가 계산 시 effective_date 이후 조정에 사용한다.

- **방식**: REST (auto-generated)
- **호출**: `supabase.from('corporate_actions').select('*').eq('ticker', ticker).eq('asset_type', asset_type).order('effective_date', { ascending: true })`
- **인증**: 필요

**요청 파라미터 (쿼리)**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| ticker | string | Y | 종목 코드 |
| asset_type | `'korean_stock' \| 'us_stock'` | Y | 자산 유형 |
| from | string (date) | N | effective_date 필터 시작일 |

**응답**
```typescript
Array<{
  id: string
  ticker: string
  asset_type: 'korean_stock' | 'us_stock'
  action_type: 'split' | 'reverse_split' | 'dividend_stock' | 'merger'
  effective_date: string          // YYYY-MM-DD
  ratio: number                   // 분할 비율 (예: 4:1 분할 → 4)
  metadata: Record<string, unknown> | null
  created_at: string
}>
```

**에러 케이스**
| 코드 | 상황 |
|------|------|
| 401 | 인증 토큰 없음 또는 만료 |

---

### 기업 액션 등록 (관리자 전용)

신규 기업 액션을 등록한다. service_role 키로만 호출 가능하며 일반 사용자는 RLS에 의해 차단된다.

- **방식**: REST (auto-generated)
- **호출**: `supabase.from('corporate_actions').insert({ ... })` (service_role 키 사용)
- **인증**: 필요 (service_role)

**요청 파라미터**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| ticker | string | Y | 종목 코드 |
| asset_type | `'korean_stock' \| 'us_stock'` | Y | 자산 유형 |
| action_type | `'split' \| 'reverse_split' \| 'dividend_stock' \| 'merger'` | Y | 액션 유형 |
| effective_date | string (date) | Y | 효력 발생일 (YYYY-MM-DD) |
| ratio | number | Y | 분할 비율 (> 0) |
| metadata | Record<string, unknown> \| null | N | 합병 등 복잡한 케이스용 추가 정보 |

**응답**
```typescript
{
  id: string
  ticker: string
  asset_type: 'korean_stock' | 'us_stock'
  action_type: 'split' | 'reverse_split' | 'dividend_stock' | 'merger'
  effective_date: string
  ratio: number
  metadata: Record<string, unknown> | null
  created_at: string
}
```

**에러 케이스**
| 코드 | 상황 |
|------|------|
| 400 | 필수 파라미터 누락, ratio <= 0, action_type 값 오류 |
| 403 | service_role 키 미사용 (RLS 차단) |

---

## Market (외부 시장 데이터 — Edge Function)

### 현재가 조회

한국 주식·미국 주식은 Twelve Data, 코인은 CoinGecko API를 호출하여 현재가를 반환한다. API 키는 Edge Function 내부에서 관리한다.

- **방식**: RPC (Edge Function)
- **호출**: `supabase.functions.invoke('get-market-prices', { body: { tickers } })`
- **인증**: 필요 — `supabase.functions.invoke`가 JWT를 Authorization 헤더에 자동 포함. Edge Function 내부에서 `jose` 라이브러리로 ES256 서명 검증 (Supabase JWKS 엔드포인트 사용). 외부 API 호출 시 JWT 미전달.

**요청 파라미터**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| tickers | Array<{ ticker: string; asset_type: 'korean_stock' \| 'us_stock' \| 'crypto' }> | Y | 조회할 종목 목록 |

**응답**
```typescript
{
  prices: Array<{
    ticker: string
    asset_type: 'korean_stock' | 'us_stock' | 'crypto'
    price: number
    currency: string              // 'KRW' | 'USD' | 코인티커
    fetched_at: string            // 데이터 수신 시각 (ISO 8601)
    is_cached: boolean            // 캐시 데이터 여부
  }>
}
```

**에러 케이스**
| 코드 | 상황 |
|------|------|
| 400 | tickers 배열이 비어 있거나 형식 오류 |
| 401 | 인증 토큰 없음 또는 만료 |
| 502 | 외부 API(Twelve Data / CoinGecko) 호출 실패 (캐시 값으로 대체 시 is_cached: true) |

---

### 환율 조회 (USD/KRW)

ExchangeRate-API를 호출하여 USD/KRW 환율을 반환한다. 1시간 캐시.

- **방식**: RPC (Edge Function)
- **호출**: `supabase.functions.invoke('get-exchange-rate', { body: { from, to } })`
- **인증**: 필요 — `supabase.functions.invoke`가 JWT를 Authorization 헤더에 자동 포함. Edge Function 내부에서 `jose` 라이브러리로 ES256 서명 검증 (Supabase JWKS 엔드포인트 사용). 외부 API 호출 시 JWT 미전달.

**요청 파라미터**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| from | string | N | 원본 통화 (기본 'USD') |
| to | string | N | 대상 통화 (기본 'KRW') |

**응답**
```typescript
{
  from: string                    // 'USD'
  to: string                      // 'KRW'
  rate: number                    // 환율 (예: 1380.5)
  fetched_at: string              // 데이터 수신 시각 (ISO 8601)
  is_cached: boolean              // 캐시 데이터 여부 (캐시 유효기간 1시간)
}
```

**에러 케이스**
| 코드 | 상황 |
|------|------|
| 400 | 지원하지 않는 통화 쌍 |
| 401 | 인증 토큰 없음 또는 만료 |
| 502 | 외부 API(ExchangeRate-API) 호출 실패 (캐시 값으로 대체 시 is_cached: true) |

---

### 일별 종가 수집 Cron (Edge Function)

매일 장 마감 후 보유 중인 모든 종목의 종가를 수집하여 `prices` 테이블에 적재한다. `pg_cron`으로 자동 실행. 직접 호출 시 service_role 키 필요.

- **방식**: RPC (Edge Function — Cron 트리거)
- **호출**: `supabase.functions.invoke('cron-collect-prices')` (service_role, 또는 pg_cron 자동 실행)
- **인증**: service_role

**트리거 스케줄**
- 한국 주식: KST 16:30 (장 마감 30분 후)
- 미국 주식: EST 17:00 (장 마감 30분 후, KST 익일 07:00)
- 코인: KST 00:05 (자정 직후, daily_snapshots cron 전)

**동작**
1. `account_events`에서 사용자별 보유 중인 ticker 목록 추출
2. 외부 API(Twelve Data / CoinGecko)에서 해당일 종가 수집
3. `prices` 테이블에 upsert (ticker, asset_type, date 기준 중복 시 무시)

**응답**
```typescript
{
  collected: number               // 수집 성공 종목 수
  skipped: number                 // 이미 존재하여 건너뛴 종목 수
  failed: Array<{
    ticker: string
    reason: string
  }>
}
```

---

### 일별 스냅샷 생성 Cron (Edge Function)

매일 KST 자정 직후 모든 활성 사용자의 `daily_snapshots` 1행을 생성한다. `pg_cron`으로 자동 실행.

- **방식**: RPC (Edge Function — Cron 트리거)
- **호출**: `supabase.functions.invoke('cron-create-snapshots')` (service_role, 또는 pg_cron 자동 실행)
- **인증**: service_role

**트리거 스케줄**: KST 00:05 (매일)

**동작**
1. `auth.users`에서 활성 사용자 목록 조회
2. 각 사용자별로 `account_events` + `prices` + `fx_rates`를 기반으로 당일 총 평가액/원금/예수금/순수익 계산
3. `daily_snapshots` 테이블에 upsert (user_id, snapshot_date 기준 중복 시 업데이트)
4. 누락된 과거 날짜가 있으면 해당 날짜도 소급 생성

**응답**
```typescript
{
  processed_users: number         // 처리된 사용자 수
  inserted: number                // 신규 생성된 스냅샷 수
  updated: number                 // 업데이트된 스냅샷 수 (당일 재실행 시)
  failed_users: Array<{
    user_id: string
    reason: string
  }>
}
```

---

### 환율 수집 Cron (Edge Function)

매일 ExchangeRate-API에서 USD/KRW 환율을 수집하여 `fx_rates` 테이블에 적재한다.

- **방식**: RPC (Edge Function — Cron 트리거)
- **호출**: `supabase.functions.invoke('cron-collect-fx-rates')` (service_role, 또는 pg_cron 자동 실행)
- **인증**: service_role

**트리거 스케줄**: KST 00:01 (매일, 종가 수집 및 스냅샷 생성 cron보다 먼저 실행)

**동작**
1. ExchangeRate-API에서 해당일 USD/KRW 환율 수집
2. `fx_rates` 테이블에 upsert (date 기준 중복 시 업데이트)

**응답**
```typescript
{
  date: string                    // YYYY-MM-DD
  usd_krw: number                 // 수집된 환율
  is_updated: boolean             // 기존 데이터 업데이트 여부 (true) 또는 신규 삽입 (false)
}
```

**에러 케이스**
| 코드 | 상황 |
|------|------|
| 502 | 외부 API(ExchangeRate-API) 호출 실패 |

---

## Sector (섹터)

### 섹터 목록 조회

GICS 4단계 계층 구조(~273개)를 level 및 parent_id 필터로 조회한다. 메모 작성 시 섹터 연결 선택, 종목 섹터 수동 지정(cascading select), 필터 UI 구성 등에 사용한다.

- **방식**: REST (auto-generated)
- **호출 (전체)**: `supabase.from('sectors').select('id, code, name, name_en, parent_id, level').order('id', { ascending: true })`
- **호출 (특정 레벨)**: `supabase.from('sectors').select('id, code, name, name_en, parent_id, level').eq('level', level).order('id', { ascending: true })`
- **호출 (특정 부모의 하위)**: `supabase.from('sectors').select('id, code, name, name_en, parent_id, level').eq('parent_id', parentId).order('id', { ascending: true })`
- **인증**: 필요

**요청 파라미터 (쿼리)**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| level | `1 \| 2 \| 3 \| 4` | N | GICS 계층 레벨 필터. 미지정 시 전체 반환. 메모 필터 UI: level=1 또는 level=2만 사용. |
| parent_id | number | N | 특정 상위 섹터의 직접 하위만 조회. cascading select에서 상위 선택 후 하위 목록 로딩에 사용. |

**응답**
```typescript
Array<{
  id: number
  code: string             // 예: 'IT', 'SEMICON_EQUIP', 'SEMICONDUCTORS', 'SEMI_MFG'
  name: string             // 예: '정보기술', '반도체및반도체장비', '반도체', '반도체제조'
  name_en: string | null   // 예: 'Information Technology', 'Semiconductor Manufacturing'
  parent_id: number | null // L1은 null, L2~L4는 상위 섹터 ID
  level: 1 | 2 | 3 | 4    // 1=Sector, 2=Industry Group, 3=Industry, 4=Sub-Industry
}>
```

**에러 케이스**
| 코드 | 상황 |
|------|------|
| 401 | 인증 토큰 없음 또는 만료 |

---

### 섹터 breadcrumb 조회 (RPC)

특정 섹터 ID(보통 L4)에서 L1까지 조상 경로 전체를 한 번에 조회한다. 종목 상세 화면에서 `정보기술 > 반도체및반도체장비 > 반도체 > 반도체제조` 형태의 breadcrumb 표시에 사용한다. REST로 계층을 순차 조회할 경우 최대 4회 왕복이 필요하지만, 이 RPC는 1회 호출로 전체 경로를 반환한다.

- **방식**: RPC (DB Function)
- **호출**: `supabase.rpc('get_sector_breadcrumb', { p_sector_id })`
- **인증**: 필요

**요청 파라미터**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| p_sector_id | number | Y | 조상 경로를 조회할 섹터 ID (어떤 레벨이든 가능) |

**응답**
```typescript
Array<{
  id: number
  code: string
  name: string
  name_en: string | null
  level: 1 | 2 | 3 | 4
}>
// level 오름차순 정렬 (L1 → L2 → L3 → L4)
// 예: [{ id:1, code:'IT', name:'정보기술', level:1 }, { id:13, code:'SEMICON_EQUIP', name:'반도체및반도체장비', level:2 }, ...]
```

**에러 케이스**
| 코드 | 상황 |
|------|------|
| 401 | 인증 토큰 없음 또는 만료 |
| 404 | 해당 sector_id가 존재하지 않음 |

---

## Stock (종목 마스터)

> **RLS 정책**: `stocks`는 공개 마스터. 읽기는 인증된 사용자 전체 허용. 쓰기(INSERT/UPDATE/DELETE)는 service_role 전용 — 앱에서 종목 추가 시 FastAPI 서버를 경유하여 upsert한다.

### 로컬 종목 검색

`stocks` 테이블에서 종목명 또는 티커로 ilike 검색한다. 검색어 2자 이상부터 호출하며, 디바운스 300ms를 권장한다. 결과가 0건이면 앱에서 외부 FastAPI 검색으로 자동 전환한다(외부 검색 API는 FastAPI 서버 엔드포인트이므로 이 명세 범위 외). 섹터 join은 `sector_id`가 가리키는 단일 행만 포함한다(L4 또는 매핑 가능한 최하위 레벨).

- **방식**: REST (auto-generated)
- **호출**: `supabase.from('stocks').select('id, ticker, name, market, currency, sector_id, is_active, sectors(id, code, name, name_en, parent_id, level)').or('ticker.ilike.%{q}%,name.ilike.%{q}%').eq('is_active', true).order('name', { ascending: true }).limit(30)`
- **인증**: 필요

**요청 파라미터 (쿼리)**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| q | string | Y | 검색어 (2자 이상). ticker 또는 name에 ilike 적용. |
| market | `'KR' \| 'US' \| 'CRYPTO'` | N | 시장 필터. 미지정 시 전체 시장 검색. |

**응답**
```typescript
Array<{
  id: string
  ticker: string
  name: string
  market: 'KR' | 'US' | 'CRYPTO'
  currency: string              // 'KRW' | 'USD'
  sector_id: number | null      // 가능한 한 L4(Sub-Industry), 매핑 실패 시 최하위 매핑 레벨
  is_active: boolean
  sectors: {
    id: number
    code: string
    name: string
    name_en: string | null
    parent_id: number | null
    level: 1 | 2 | 3 | 4
  } | null
}>
```

**에러 케이스**
| 코드 | 상황 |
|------|------|
| 401 | 인증 토큰 없음 또는 만료 |

---

### 종목 조회 (단건)

ticker + market 조합으로 종목 단건을 조회한다. 섹터 breadcrumb이 필요한 경우 `get_sector_breadcrumb` RPC를 별도 호출하거나, 아래 응답의 `sector_id`로 breadcrumb을 구성한다.

- **방식**: REST (auto-generated)
- **호출**: `supabase.from('stocks').select('*, sectors(id, code, name, name_en, parent_id, level)').eq('ticker', ticker).eq('market', market).maybeSingle()`
- **인증**: 필요

**요청 파라미터**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| ticker | string | Y | 종목 코드 또는 코인 티커 |
| market | `'KR' \| 'US' \| 'CRYPTO'` | Y | 시장 구분 |

**응답**
```typescript
{
  id: string
  ticker: string
  name: string
  market: 'KR' | 'US' | 'CRYPTO'
  currency: string              // 'KRW' | 'USD'
  sector_id: number | null      // 가능한 한 L4(Sub-Industry), 매핑 실패 시 최하위 매핑 레벨
  is_active: boolean
  sectors: {
    id: number
    code: string
    name: string
    name_en: string | null
    parent_id: number | null
    level: 1 | 2 | 3 | 4
  } | null
  created_at: string
} | null
```

> 종목 상세 화면에서 L4까지 breadcrumb(`정보기술 > 반도체및반도체장비 > 반도체 > 반도체제조`)을 표시할 때는 `get_sector_breadcrumb` RPC를 추가 호출한다.

**에러 케이스**
| 코드 | 상황 |
|------|------|
| 401 | 인증 토큰 없음 또는 만료 |

---

### 종목 등록 또는 조회 + 섹터 자동 추천 (RPC)

종목을 `stocks` 테이블에 등록하고 섹터 자동 추천 결과를 함께 반환한다. 이미 등록된 종목이면 기존 레코드를 그대로 반환한다. 실제 upsert는 FastAPI 서버(service role)가 수행하며, 이 RPC는 앱에서 FastAPI 서버를 호출한 뒤 결과를 Supabase에서 재조회하는 흐름에서 쓰인다.

**섹터 자동 추천 규칙 (PRD-004 반영)**
- 한국·미국 주식 모두 yfinance `sector`(L1) + `industry`(≒L3~L4) 기반 단일 경로.
  1. `gics_yfinance_map` 테이블에서 yfinance `industry` 문자열 → GICS L4 조회.
  2. 없으면 `sectors.name_en` 직접 매칭.
  3. 매핑 실패 시 L1까지 확정, 하위는 null.
- 암호화폐: CRYPTO 고정 (L1).
- `kr_sector_map` 경유 로직 제거됨 (PRD-004).

- **방식**: RPC (DB Function)
- **호출**: `supabase.rpc('get_or_recommend_stock_sector', { p_ticker, p_market, p_name, p_currency, p_yfinance_sector, p_yfinance_industry })`
- **인증**: 필요

**요청 파라미터**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| p_ticker | string | Y | 종목 코드 또는 코인 티커 |
| p_market | `'KR' \| 'US' \| 'CRYPTO'` | Y | 시장 구분 |
| p_name | string | Y | 종목명 |
| p_currency | string | Y | 거래 통화 (KRW / USD) |
| p_yfinance_sector | string \| null | N | yfinance `sector` 반환값 (예: "Technology"). null이면 L1 추천 불가. CRYPTO는 무시. |
| p_yfinance_industry | string \| null | N | yfinance `industry` 반환값 (예: "Semiconductor Manufacturing"). null이면 L1까지만 추천. |

**응답**
```typescript
{
  id: string
  ticker: string
  name: string
  market: 'KR' | 'US' | 'CRYPTO'
  currency: string
  is_active: boolean
  sector_id: number | null        // 자동 추천된 sector_id (가능한 한 L4). 없으면 null.
  recommended_sector: {
    id: number
    code: string
    name: string
    name_en: string | null
    level: 1 | 2 | 3 | 4
  } | null                        // 자동 추천 섹터 정보. 추천 불가 시 null.
  is_new: boolean                 // true이면 신규 등록(FastAPI upsert 후 조회), false이면 기존 레코드
  created_at: string
}
```

**에러 케이스**
| 코드 | 상황 |
|------|------|
| 400 | p_market 값 오류 |
| 401 | 인증 토큰 없음 또는 만료 |

---

### 종목 섹터 수동 지정/변경

종목의 `sector_id`를 사용자가 직접 수정한다. 자동 추천 결과가 맞지 않을 때 보정에 사용한다. stocks 쓰기는 service_role 전용이므로 FastAPI 서버를 통해 호출해야 한다.

UI는 L1 → L2 → L3 → L4 순차 cascading select로 구성한다. 각 단계 선택 시 해당 레벨의 하위 섹터 목록을 **섹터 목록 조회** REST API(`parent_id` 필터)로 로딩한다. 최종 선택된 레벨의 `sector_id`를 이 API에 전달한다.

- **방식**: RPC (DB Function — service_role 경유)
- **호출**: FastAPI `PATCH /stocks/{id}/sector` → Supabase service_role로 `stocks.update({ sector_id })`
- **인증**: 필요 (앱 → FastAPI JWT 검증 → service_role로 Supabase 업데이트)

**요청 파라미터**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| id | string (uuid) | Y | 종목 ID |
| sector_id | number \| null | Y | 변경할 섹터 ID (어떤 레벨이든 가능, 가능한 한 L4). null이면 섹터 해제(미분류). |

**응답**
```typescript
{
  id: string
  ticker: string
  name: string
  market: 'KR' | 'US' | 'CRYPTO'
  currency: string
  is_active: boolean
  sector_id: number | null
  created_at: string
}
```

**에러 케이스**
| 코드 | 상황 |
|------|------|
| 400 | sector_id가 sectors 테이블에 없는 값 |
| 401 | 인증 토큰 없음 또는 만료 |
| 404 | 해당 ID 종목 없음 |

---

## Memo (메모/투자 일지)

### 메모 생성 (본문 + 엔티티 연결 한 번에) (RPC)

메모 본체와 엔티티 연결(종목, 매매이벤트, 뉴스, 섹터)을 단일 트랜잭션으로 생성한다. 종목 연결 시 `goal_price`를 함께 저장할 수 있다. 매수/매도 폼 통합 시에도 이 API를 사용한다.

- **방식**: RPC (DB Function)
- **호출**: `supabase.rpc('create_memo_with_links', { p_body, p_stocks, p_trade_event_ids, p_news_ids, p_sector_ids })`
- **인증**: 필요

**요청 파라미터**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| p_body | string | Y | 메모 본문 (1자 이상) |
| p_stocks | `Array<{ stock_id: string; goal_price: number \| null }>` | N | 연결할 종목 목록. 빈 배열 또는 미전달 시 연결 없음. |
| p_trade_event_ids | `string[]` | N | 연결할 매매이벤트 ID 목록 (buy/sell event_type만 허용). |
| p_news_ids | `string[]` | N | 연결할 뉴스 ID 목록. |
| p_sector_ids | `number[]` | N | 연결할 섹터 ID 목록. |

**응답**
```typescript
{
  id: string
  user_id: string
  body: string
  created_at: string
  updated_at: string
  stocks: Array<{
    stock_id: string
    ticker: string
    name: string
    market: 'KR' | 'US' | 'CRYPTO'
    goal_price: number | null
  }>
  trade_events: Array<{
    event_id: string
    event_type: 'buy' | 'sell'
    event_date: string
    ticker: string | null
    name: string | null
  }>
  news: Array<{
    news_id: string
  }>
  sectors: Array<{
    sector_id: number
    code: string
    name: string
  }>
}
```

**에러 케이스**
| 코드 | 상황 |
|------|------|
| 400 | p_body가 비어 있음. p_trade_event_ids에 buy/sell 이외 event_type 포함. goal_price <= 0. |
| 401 | 인증 토큰 없음 또는 만료 |
| 404 | p_stocks의 stock_id, p_trade_event_ids의 event_id, p_news_ids의 news_id, p_sector_ids의 sector_id가 존재하지 않음 |

---

### 메모 목록 조회 (필터 지원) (RPC)

최신순(`created_at desc`)으로 메모 목록을 조회한다. 달력형과 리스트형 모두 이 API를 사용하며, 달력형은 날짜 범위(`from`/`to`)를 지정하고 리스트형은 필터 조건을 조합한다.

**필터 결합 규칙**
- **같은 행(종목 행 내, 섹터 행 내) 복수 선택 → OR**: `p_stock_ids`에 여러 종목 지정 시 둘 중 하나라도 연관된 메모를 모두 반환. `p_sector_ids`도 동일.
- **다른 행/타입 간 → AND**: 토글(매매 이벤트·뉴스 연관) + 종목 행 + 섹터 행이 모두 지정된 경우 교집합만 반환. 예: 종목 필터 + `p_trade_events_only: true` 동시 지정 시 "해당 종목 관련 메모 중 매매이벤트도 연결된 것"만 반환.
- **연결 없음(`p_no_links`) 필터는 다른 필터와 상호 배타적**: `p_no_links: true` 지정 시 다른 모든 엔티티 필터를 무시하고 연결 없는 메모만 반환.

종목 필터 시: 해당 종목에 직접 연결된 메모(`memo_stocks`)와 해당 종목의 매매이벤트에 연결된 메모(`memo_trade_events`)를 항상 함께 반환한다. "직접 연결만 보기" 토글은 제공하지 않으며, 종목 + 매매 연관 필터를 AND 결합하면 "매매이벤트에도 연결된 종목 관련 메모"만 조회할 수 있다.

**섹터 필터 계층 탐색 규칙 (PRD-004 반영)**

`p_sector_ids`에 지정된 섹터 ID는 어떤 레벨이든 가능하며, DB Function 내부에서 해당 섹터의 **모든 하위 종목**을 포함하여 필터링한다.

- L1 지정 시: 해당 L1 섹터 및 그 하위 L2·L3·L4에 속하는 모든 종목과 연결된 메모 반환.
- L2 지정 시: 해당 L2 Industry Group 하위 L3·L4에 속하는 종목까지 포함.
- 탐색 방향: `stocks.sector_id`(L4)에서 `sectors.parent_id`를 따라 조상 경로를 역산하여 지정된 sector_id가 조상에 포함되는지 판단.

메모 필터 UI에서는 L1·L2까지만 선택 가능하지만(PRD-004 §7.1), 데이터 레벨에서는 어떤 레벨이든 전달 가능.

- **방식**: RPC (DB Function)
- **호출**: `supabase.rpc('list_memos', { p_from, p_to, p_stock_ids, p_trade_events_only, p_news_only, p_sector_ids, p_no_links, p_limit, p_offset })`
- **인증**: 필요

**요청 파라미터**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| p_from | string (date) \| null | N | 조회 시작일 (YYYY-MM-DD). 달력형에서 월 첫날. |
| p_to | string (date) \| null | N | 조회 종료일 (YYYY-MM-DD). 달력형에서 월 마지막날. |
| p_stock_ids | string[] (uuid) \| null | N | 종목 필터. 지정된 종목들 중 하나라도 연관된 메모 반환 (OR). 직접 연결 및 매매이벤트 경유 연결 모두 포함. |
| p_trade_events_only | boolean | N | true이면 매매이벤트에 연결된 메모만 반환 (기본 false). 다른 필터와 AND 결합. |
| p_news_only | boolean | N | true이면 뉴스에 연결된 메모만 반환 (기본 false). 다른 필터와 AND 결합. |
| p_sector_ids | number[] \| null | N | 섹터 필터. 지정된 섹터들 중 하나라도 연관된 메모 반환 (OR). L1·L2 지정 시 하위 계층 종목까지 포함. 다른 타입 필터와 AND 결합. |
| p_no_links | boolean | N | true이면 어떤 엔티티에도 연결되지 않은 메모만 반환 (기본 false). true 지정 시 다른 엔티티 필터는 무시. |
| p_limit | number | N | 페이지 크기 (기본 20, 최대 100). |
| p_offset | number | N | 페이지 오프셋 (기본 0). |

**응답**
```typescript
{
  memos: Array<{
    id: string
    body: string
    created_at: string
    updated_at: string
    stocks: Array<{
      stock_id: string
      ticker: string
      name: string
      market: 'KR' | 'US' | 'CRYPTO'
      goal_price: number | null
    }>
    trade_events: Array<{
      event_id: string
      event_type: 'buy' | 'sell'
      event_date: string
      ticker: string | null
      name: string | null
    }>
    news: Array<{
      news_id: string
    }>
    sectors: Array<{
      sector_id: number
      code: string
      name: string
    }>
  }>
  total_count: number
}
```

**에러 케이스**
| 코드 | 상황 |
|------|------|
| 400 | p_limit > 100. p_from > p_to. |
| 401 | 인증 토큰 없음 또는 만료 |

---

### 메모 상세 조회

메모 단건을 엔티티 연결 정보 포함하여 조회한다.

- **방식**: REST (auto-generated)
- **호출**: `supabase.from('memos').select('*, memo_stocks(stock_id, goal_price, stocks(id, ticker, name, market, currency, is_active)), memo_trade_events(event_id, account_events(id, event_type, event_date, ticker, name)), memo_news(news_id), memo_sectors(sector_id, sectors(id, code, name))').eq('id', memoId).single()`
- **인증**: 필요

**요청 파라미터**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| id | string (uuid) | Y | 메모 ID |

**응답**
```typescript
{
  id: string
  user_id: string
  body: string
  created_at: string
  updated_at: string
  memo_stocks: Array<{
    stock_id: string
    goal_price: number | null
    stocks: {
      id: string
      ticker: string
      name: string
      market: 'KR' | 'US' | 'CRYPTO'
      currency: string
      is_active: boolean
    }
  }>
  memo_trade_events: Array<{
    event_id: string
    account_events: {
      id: string
      event_type: 'buy' | 'sell'
      event_date: string
      ticker: string | null
      name: string | null
    }
  }>
  memo_news: Array<{
    news_id: string
  }>
  memo_sectors: Array<{
    sector_id: number
    sectors: {
      id: number
      code: string
      name: string
    }
  }>
}
```

**에러 케이스**
| 코드 | 상황 |
|------|------|
| 401 | 인증 토큰 없음 또는 만료 |
| 403 | RLS 위반 (다른 사용자 메모 조회 시도) |
| 404 | 해당 ID 메모 없음 |

---

### 메모 수정 (본문 + 엔티티 연결 한 번에) (RPC)

메모 본문과 엔티티 연결을 단일 트랜잭션으로 수정한다. 기존 연결을 전부 교체(replace)하는 방식이다. 수정할 필드만 전달하되, 엔티티 연결은 전달한 배열 전체로 덮어쓴다.

- **방식**: RPC (DB Function)
- **호출**: `supabase.rpc('update_memo_with_links', { p_memo_id, p_body, p_stocks, p_trade_event_ids, p_news_ids, p_sector_ids })`
- **인증**: 필요

**요청 파라미터**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| p_memo_id | string (uuid) | Y | 수정할 메모 ID |
| p_body | string \| null | N | 수정할 본문. null이면 변경하지 않음. |
| p_stocks | `Array<{ stock_id: string; goal_price: number \| null }> \| null` | N | 종목 연결 전체 교체. null이면 변경하지 않음. 빈 배열이면 모든 종목 연결 해제. |
| p_trade_event_ids | `string[] \| null` | N | 매매이벤트 연결 전체 교체. null이면 변경하지 않음. 빈 배열이면 모든 연결 해제. |
| p_news_ids | `string[] \| null` | N | 뉴스 연결 전체 교체. null이면 변경하지 않음. 빈 배열이면 모든 연결 해제. |
| p_sector_ids | `number[] \| null` | N | 섹터 연결 전체 교체. null이면 변경하지 않음. 빈 배열이면 모든 연결 해제. |

**응답**
```typescript
{
  id: string
  user_id: string
  body: string
  created_at: string
  updated_at: string
  stocks: Array<{
    stock_id: string
    ticker: string
    name: string
    market: 'KR' | 'US' | 'CRYPTO'
    goal_price: number | null
  }>
  trade_events: Array<{
    event_id: string
    event_type: 'buy' | 'sell'
    event_date: string
    ticker: string | null
    name: string | null
  }>
  news: Array<{
    news_id: string
  }>
  sectors: Array<{
    sector_id: number
    code: string
    name: string
  }>
}
```

**에러 케이스**
| 코드 | 상황 |
|------|------|
| 400 | p_body가 빈 문자열. p_trade_event_ids에 buy/sell 이외 event_type 포함. goal_price <= 0. |
| 401 | 인증 토큰 없음 또는 만료 |
| 403 | RLS 위반 (다른 사용자 메모 수정 시도) |
| 404 | p_memo_id 또는 연결 엔티티 ID가 존재하지 않음 |

---

### 메모 삭제

메모를 삭제한다. 모든 연결 junction 행(memo_stocks, memo_trade_events, memo_news, memo_sectors)이 cascade 삭제된다.

- **방식**: REST (auto-generated)
- **호출**: `supabase.from('memos').delete().eq('id', memoId)`
- **인증**: 필요

**요청 파라미터**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| id | string (uuid) | Y | 삭제할 메모 ID |

**응답**
```typescript
null  // 삭제 성공 시 데이터 없음
```

**에러 케이스**
| 코드 | 상황 |
|------|------|
| 401 | 인증 토큰 없음 또는 만료 |
| 403 | RLS 위반 (다른 사용자 메모 삭제 시도) |
| 404 | 해당 ID 메모 없음 |

---

### 메모 엔티티 연결 추가

기존 메모에 엔티티를 단건 추가한다. 특정 엔티티 타입 하나만 추가할 때 사용한다. 복수 타입을 한 번에 추가하거나 본문도 함께 수정할 경우 메모 수정 RPC(`update_memo_with_links`)를 사용한다.

**종목 연결 추가**

- **방식**: REST (auto-generated)
- **호출**: `supabase.from('memo_stocks').insert({ memo_id, stock_id, goal_price })`
- **인증**: 필요

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| memo_id | string (uuid) | Y | 메모 ID |
| stock_id | string (uuid) | Y | 종목 ID |
| goal_price | number \| null | N | 목표가 (원통화 기준, > 0) |

**매매이벤트 연결 추가**

- **방식**: REST (auto-generated)
- **호출**: `supabase.from('memo_trade_events').insert({ memo_id, event_id })`
- **인증**: 필요

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| memo_id | string (uuid) | Y | 메모 ID |
| event_id | string (uuid) | Y | 계정 이벤트 ID (buy/sell만 허용) |

**뉴스 연결 추가**

- **방식**: REST (auto-generated)
- **호출**: `supabase.from('memo_news').insert({ memo_id, news_id })`
- **인증**: 필요

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| memo_id | string (uuid) | Y | 메모 ID |
| news_id | string (uuid) | Y | 뉴스 ID |

**섹터 연결 추가**

- **방식**: REST (auto-generated)
- **호출**: `supabase.from('memo_sectors').insert({ memo_id, sector_id })`
- **인증**: 필요

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| memo_id | string (uuid) | Y | 메모 ID |
| sector_id | number | Y | 섹터 ID |

**공통 에러 케이스**
| 코드 | 상황 |
|------|------|
| 400 | goal_price <= 0. event_id가 buy/sell 이외 event_type. 이미 연결된 엔티티 중복 삽입. |
| 401 | 인증 토큰 없음 또는 만료 |
| 403 | RLS 위반 (memo_id가 본인 메모가 아님) |
| 404 | memo_id, stock_id, event_id, news_id, sector_id가 존재하지 않음 |

---

### 메모 엔티티 연결 해제

기존 메모에서 엔티티 연결을 단건 해제한다. 연결이 삭제되어도 메모 본체는 유지된다.

**종목 연결 해제**

- **방식**: REST (auto-generated)
- **호출**: `supabase.from('memo_stocks').delete().eq('memo_id', memoId).eq('stock_id', stockId)`
- **인증**: 필요

**매매이벤트 연결 해제**

- **방식**: REST (auto-generated)
- **호출**: `supabase.from('memo_trade_events').delete().eq('memo_id', memoId).eq('event_id', eventId)`
- **인증**: 필요

**뉴스 연결 해제**

- **방식**: REST (auto-generated)
- **호출**: `supabase.from('memo_news').delete().eq('memo_id', memoId).eq('news_id', newsId)`
- **인증**: 필요

**섹터 연결 해제**

- **방식**: REST (auto-generated)
- **호출**: `supabase.from('memo_sectors').delete().eq('memo_id', memoId).eq('sector_id', sectorId)`
- **인증**: 필요

**공통 에러 케이스**
| 코드 | 상황 |
|------|------|
| 401 | 인증 토큰 없음 또는 만료 |
| 403 | RLS 위반 (memo_id가 본인 메모가 아님) |
| 404 | 해당 연결이 존재하지 않음 |

---

### 매매이벤트 생성 + 메모 동시 생성 (RPC)

매수/매도 폼에서 메모를 함께 작성할 때 사용한다. account_event 등록과 memo 생성, 엔티티 연결(해당 이벤트 + 종목 자동 연결)을 단일 트랜잭션으로 처리한다.

- **방식**: RPC (DB Function)
- **호출**: `supabase.rpc('create_trade_event_with_memo', { p_event, p_memo_body, p_goal_price })`
- **인증**: 필요

**요청 파라미터**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| p_event | AccountEventInput | Y | 매매이벤트 등록 데이터 (AccountEvent 등록 파라미터와 동일. event_type은 'buy' 또는 'sell'만 허용). |
| p_memo_body | string \| null | N | 메모 본문. null이면 메모를 생성하지 않고 이벤트만 등록한다. |
| p_goal_price | number \| null | N | 메모-종목 연결 시 목표가. p_memo_body가 null이면 무시. |

**응답**
```typescript
{
  event: {
    id: string
    event_type: 'buy' | 'sell'
    event_date: string
    ticker: string
    name: string
    quantity: number
    price_per_unit: number
    currency: string
    fee: number
    tax: number
    amount: number
    created_at: string
  }
  memo: {
    id: string
    body: string
    created_at: string
    linked_stock_id: string | null    // 자동 연결된 종목 ID (stocks 테이블)
    linked_event_id: string           // 자동 연결된 매매이벤트 ID
    goal_price: number | null
  } | null                            // p_memo_body가 null이면 null
}
```

**에러 케이스**
| 코드 | 상황 |
|------|------|
| 400 | p_event.event_type이 buy/sell 이외. p_event 필수 필드 누락. p_goal_price <= 0. |
| 401 | 인증 토큰 없음 또는 만료 |
| 403 | RLS 위반 |

---

## 변경 이력

| 이슈 | 변경 내용 |
|------|----------|
| [001] 사용자 인증 | Auth 도메인 추가 (signup, createProfile, signIn, signOut, getSession, onAuthStateChange) |
| [002] 이메일 인증 플로우 | Auth — resendVerificationEmail 추가. createProfile 호출 시점을 이메일 인증 완료 후로 명확화. |
| [003] 메인 대시보드 | TradeEvent 도메인 추가 (목록 조회, 등록, 수정, 삭제, CSV 업로드 미리보기, CSV 확정 저장). CashBalance 도메인 추가 (목록 조회, 스냅샷 등록). Dashboard 집계 도메인 추가 (포트폴리오 요약, 자산 히스토리, 부문별 비중). Market 도메인 추가 (현재가 조회, 환율 조회). |
| [핫픽스] Market Edge Function 인증 | Supabase 프로젝트가 ES256 JWT를 사용하나 플랫폼 레벨 검증이 미지원. `--no-verify-jwt`로 게이트웨이 검증 비활성화 후 `jose` 라이브러리로 함수 내부에서 ES256 직접 검증하도록 변경. |
| [004] 대시보드 기획 수정 (00b3fb9) | TradeEvent 도메인 → AccountEvent 도메인으로 전면 대체 (5종 이벤트 통합, 타입별 필수/선택 필드 규칙 정의, CSV 함수명 변경 및 external_ref 기반 중복 방지 로직 반영). CashBalance 도메인 제거 (account_events 누적 계산으로 대체). Dashboard — 포트폴리오 요약 → KPI 데이터 조회로 확장 (총 평가액/원금/순수익/수익률/예수금(통화별)/누적 배당·수수료·세금 + holdings 집계 포함). 자산 히스토리 → daily_snapshots 기반으로 변경 (3개 라인 + 이벤트 마커 분리 조회, "전체" 기간 추가). 부문별 비중 파이 차트 API 제거. DailySnapshot 도메인 신규 추가 (스냅샷 조회). CorporateAction 도메인 신규 추가 (목록 조회, 관리자 등록). Market — 일별 종가 수집 cron, 일별 스냅샷 생성 cron, 환율 수집 cron 신규 추가. |
| [005] 소셜 로그인 추가 (7ab2e6f) | Auth — Google 소셜 로그인(signInWithOAuth google) 신규 추가. Apple 소셜 로그인(signInWithOAuth apple) 신규 추가. createProfile 설명 보강 (소셜 로그인 첫 로그인 시 호출 조건, provider display name 자동 추출 로직). onAuthStateChange 이벤트 표 수정 (SIGNED_IN 항목에 소셜 로그인 완료 케이스 추가) 및 소셜 로그인 후 프로필 자동 생성 패턴 코드 예시 추가. |
| [006] 메모/투자 일지 (7b4d051) | Sector 도메인 신규 추가 (섹터 목록 조회). Stock 도메인 신규 추가 (단건 조회, 등록+섹터자동추천 RPC, 섹터 수동 지정). Memo 도메인 신규 추가 (생성 RPC, 목록 조회 RPC, 상세 조회, 수정 RPC, 삭제, 엔티티 연결 추가 4종, 엔티티 연결 해제 4종, 매매이벤트+메모 동시 생성 RPC). |
| [006] 종목 검색 기능 (78dfc50) | Stock — 로컬 종목 검색 API 신규 추가 (stocks 테이블 ilike 검색, market 필터 지원). 종목 조회(단건) 파라미터 `asset_type` → `market`('KR'/'US'/'CRYPTO')으로 변경, 응답에 `currency`, `is_active` 추가. 종목 등록+섹터자동추천 RPC 함수명 `upsert_stock_with_sector` → `get_or_recommend_stock_sector`로 변경, 파라미터 `p_asset_type` → `p_market` · `p_currency` 추가, 응답에 `market`/`currency`/`is_active` 반영. 종목 섹터 수동 지정/변경 방식 REST → FastAPI 경유(service_role)로 변경(stocks 쓰기는 service_role 전용 정책 반영). Memo 도메인 전체 응답의 stock 필드 `asset_type` → `market` 변경, memo_stocks join 응답에 `currency`/`is_active` 추가. |
| [006] 메모 필터 기능 수정 (11f2f4c) | Memo — 메모 목록 조회(list_memos) RPC 변경: (1) `p_stock_id`(단건) → `p_stock_ids`(배열)로 변경하여 복수 종목 OR 필터 지원. (2) `p_include_trade_events` 파라미터 제거 — "직접 연결만 보기" 토글 폐지로 종목 필터는 직접 연결 + 매매이벤트 경유 연결을 항상 함께 반환. (3) `p_sector_id`(단건) → `p_sector_ids`(배열)로 변경하여 복수 섹터 OR 필터 지원. (4) RPC 호출 시그니처 업데이트. 필터 결합 규칙 설명 추가 (같은 타입 내 OR · 타입 간 AND · `p_no_links` 상호 배타적). |
| [006] 메모 필터 UI 수정 (6aab87b) | API 시그니처 변경 없음. Memo — 메모 목록 조회(list_memos) 필터 결합 규칙 설명 표현 변경: "같은 타입 내 → OR, 타입 간 → AND" → "같은 행 내 → OR, 다른 행/타입 간 → AND" (PRD 필터 UI 세 줄 구조 반영). |
| [007] 종목 분류 GICS 계층화 (b892f6d) | Sector — 섹터 목록 조회 응답에 `name_en`/`parent_id`/`level` 추가, `level`/`parent_id` 쿼리 파라미터 추가 (GICS 4단계 계층 지원). 섹터 breadcrumb 조회 RPC(`get_sector_breadcrumb`) 신규 추가. Stock — 로컬 종목 검색 및 단건 조회의 sectors join 응답에 `name_en`/`parent_id`/`level` 추가. 종목 조회(단건)에 breadcrumb 안내 주석 추가. 종목 등록+섹터자동추천 RPC(`get_or_recommend_stock_sector`) 변경: `p_naver_industry` 파라미터 제거, `p_yfinance_sector`/`p_yfinance_industry` 파라미터 추가 (kr_sector_map 참조 로직 제거, yfinance 단일 경로), 응답의 `recommended_sector`에 `name_en`/`level` 추가. 종목 섹터 수동 지정/변경에 cascading select 흐름 명세 추가. Memo — 메모 목록 조회(list_memos) 섹터 필터에 계층 탐색 규칙 추가 (L1 지정 시 하위 L2·L3·L4 종목 포함). |
