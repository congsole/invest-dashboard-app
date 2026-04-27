# API Spec

*최종 업데이트: 00b3fb9 — 2026-04-27*

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

이메일 인증 완료 후(`SIGNED_IN` 이벤트 수신 시) 호출하여 닉네임을 저장한다.

- **방식**: REST (auto-generated)
- **호출**: `supabase.from('profiles').insert({ user_id, nickname })`
- **인증**: 필요 (이메일 인증 완료 후 세션 사용)

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

## 변경 이력

| 이슈 | 변경 내용 |
|------|----------|
| [001] 사용자 인증 | Auth 도메인 추가 (signup, createProfile, signIn, signOut, getSession, onAuthStateChange) |
| [002] 이메일 인증 플로우 | Auth — resendVerificationEmail 추가. createProfile 호출 시점을 이메일 인증 완료 후로 명확화. |
| [003] 메인 대시보드 | TradeEvent 도메인 추가 (목록 조회, 등록, 수정, 삭제, CSV 업로드 미리보기, CSV 확정 저장). CashBalance 도메인 추가 (목록 조회, 스냅샷 등록). Dashboard 집계 도메인 추가 (포트폴리오 요약, 자산 히스토리, 부문별 비중). Market 도메인 추가 (현재가 조회, 환율 조회). |
| [핫픽스] Market Edge Function 인증 | Supabase 프로젝트가 ES256 JWT를 사용하나 플랫폼 레벨 검증이 미지원. `--no-verify-jwt`로 게이트웨이 검증 비활성화 후 `jose` 라이브러리로 함수 내부에서 ES256 직접 검증하도록 변경. |
| [004] 대시보드 기획 수정 (00b3fb9) | TradeEvent 도메인 → AccountEvent 도메인으로 전면 대체 (5종 이벤트 통합, 타입별 필수/선택 필드 규칙 정의, CSV 함수명 변경 및 external_ref 기반 중복 방지 로직 반영). CashBalance 도메인 제거 (account_events 누적 계산으로 대체). Dashboard — 포트폴리오 요약 → KPI 데이터 조회로 확장 (총 평가액/원금/순수익/수익률/예수금(통화별)/누적 배당·수수료·세금 + holdings 집계 포함). 자산 히스토리 → daily_snapshots 기반으로 변경 (3개 라인 + 이벤트 마커 분리 조회, "전체" 기간 추가). 부문별 비중 파이 차트 API 제거. DailySnapshot 도메인 신규 추가 (스냅샷 조회). CorporateAction 도메인 신규 추가 (목록 조회, 관리자 등록). Market — 일별 종가 수집 cron, 일별 스냅샷 생성 cron, 환율 수집 cron 신규 추가. |
