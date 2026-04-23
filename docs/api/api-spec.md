# API Spec

*최종 업데이트: 1dc2688 — 2026-04-23*

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

## TradeEvent (매매 이벤트)

### 매매 이벤트 목록 조회

- **방식**: REST (auto-generated)
- **호출**: `supabase.from('trade_events').select('*').eq('user_id', userId)` (필터 조건 추가)
- **인증**: 필요

**요청 파라미터 (쿼리)**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| asset_type | `'korean_stock' \| 'us_stock' \| 'crypto'` | N | 자산 유형 필터 |
| trade_type | `'buy' \| 'sell'` | N | 매매 유형 필터 |
| ticker | string | N | 종목 코드 필터 |
| from | string (date) | N | 조회 시작일 (YYYY-MM-DD) |
| to | string (date) | N | 조회 종료일 (YYYY-MM-DD) |

**응답**
```typescript
Array<{
  id: string
  user_id: string
  asset_type: 'korean_stock' | 'us_stock' | 'crypto'
  trade_type: 'buy' | 'sell'
  ticker: string
  name: string
  trade_date: string           // YYYY-MM-DD
  quantity: number
  price_per_unit: number
  currency: string             // 'KRW' | 'USD' | 코인티커
  fee: number
  fee_currency: string
  tax: number
  settlement_amount: number
  created_at: string
}>
```

**에러 케이스**
| 코드 | 상황 |
|------|------|
| 401 | 인증 토큰 없음 또는 만료 |

---

### 매매 이벤트 등록

- **방식**: REST (auto-generated)
- **호출**: `supabase.from('trade_events').insert({ ... })`
- **인증**: 필요

**요청 파라미터**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| asset_type | `'korean_stock' \| 'us_stock' \| 'crypto'` | Y | 자산 유형 |
| trade_type | `'buy' \| 'sell'` | Y | 매매 유형 |
| ticker | string | Y | 종목 코드 또는 코인 티커 |
| name | string | Y | 종목명 |
| trade_date | string (date) | Y | 체결 날짜 (YYYY-MM-DD) |
| quantity | number | Y | 수량 (> 0) |
| price_per_unit | number | Y | 체결가 (1주당, >= 0) |
| currency | string | Y | 거래 통화 (KRW / USD / 코인티커) |
| fee | number | N | 수수료 (기본 0) |
| fee_currency | string | N | 수수료 통화 (기본 'KRW') |
| tax | number | N | 세금 (기본 0) |
| settlement_amount | number | Y | 정산금액 (매수 음수, 매도 양수) |

**응답**
```typescript
{
  id: string
  user_id: string
  asset_type: 'korean_stock' | 'us_stock' | 'crypto'
  trade_type: 'buy' | 'sell'
  ticker: string
  name: string
  trade_date: string
  quantity: number
  price_per_unit: number
  currency: string
  fee: number
  fee_currency: string
  tax: number
  settlement_amount: number
  created_at: string
}
```

**에러 케이스**
| 코드 | 상황 |
|------|------|
| 400 | 필수 파라미터 누락 또는 CHECK 제약 위반 (quantity <= 0 등) |
| 401 | 인증 토큰 없음 또는 만료 |
| 403 | RLS 위반 |

---

### 매매 이벤트 수정

- **방식**: REST (auto-generated)
- **호출**: `supabase.from('trade_events').update({ ... }).eq('id', id)`
- **인증**: 필요

**요청 파라미터**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| id | string (uuid) | Y | 수정할 매매 이벤트 ID (경로) |
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

### 매매 이벤트 삭제

- **방식**: REST (auto-generated)
- **호출**: `supabase.from('trade_events').delete().eq('id', id)`
- **인증**: 필요

**요청 파라미터**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| id | string (uuid) | Y | 삭제할 매매 이벤트 ID |

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

증권사 CSV 파일을 업로드하면 파싱하여 미리보기용 데이터를 반환한다. DB에 저장하지 않는다.

- **방식**: RPC (Edge Function)
- **호출**: `supabase.functions.invoke('parse-trade-csv', { body: formData })`
- **인증**: 필요

**요청 파라미터**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| file | File (multipart/form-data) | Y | 증권사 CSV 파일 |
| broker | string | N | 증권사 식별자 (자동 감지 시도, 실패 시 필수) |

**응답**
```typescript
{
  preview: Array<{
    row: number                  // 원본 CSV 행 번호
    asset_type: 'korean_stock' | 'us_stock' | 'crypto'
    trade_type: 'buy' | 'sell'
    ticker: string
    name: string
    trade_date: string
    quantity: number
    price_per_unit: number
    currency: string
    fee: number
    fee_currency: string
    tax: number
    settlement_amount: number
  }>
  errors: Array<{
    row: number                  // 실패한 행 번호
    reason: string               // 실패 사유
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

미리보기에서 확인한 데이터를 trade_events 테이블에 일괄 저장한다.

- **방식**: RPC (Edge Function)
- **호출**: `supabase.functions.invoke('confirm-trade-csv', { body: { events } })`
- **인증**: 필요

**요청 파라미터**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| events | Array<TradeEventInput> | Y | parse-trade-csv 응답의 preview 배열 (수정 가능) |

**응답**
```typescript
{
  inserted: number      // 저장 성공 건수
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

## CashBalance (예수금)

### 예수금 목록 조회

- **방식**: REST (auto-generated)
- **호출**: `supabase.from('cash_balances').select('*').eq('user_id', userId).order('recorded_at', { ascending: false })`
- **인증**: 필요

**요청 파라미터 (쿼리)**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| currency | `'KRW' \| 'USD'` | N | 통화 필터 |

**응답**
```typescript
Array<{
  id: string
  user_id: string
  balance: number
  currency: 'KRW' | 'USD'
  recorded_at: string
}>
```

**에러 케이스**
| 코드 | 상황 |
|------|------|
| 401 | 인증 토큰 없음 또는 만료 |

---

### 예수금 스냅샷 등록

- **방식**: REST (auto-generated)
- **호출**: `supabase.from('cash_balances').insert({ ... })`
- **인증**: 필요

**요청 파라미터**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| balance | number | Y | 잔고 |
| currency | `'KRW' \| 'USD'` | Y | 통화 |
| recorded_at | string (timestamptz) | N | 기록 시점 (기본 now()) |

**응답**
```typescript
{
  id: string
  user_id: string
  balance: number
  currency: 'KRW' | 'USD'
  recorded_at: string
}
```

**에러 케이스**
| 코드 | 상황 |
|------|------|
| 400 | 필수 파라미터 누락 또는 currency CHECK 위반 |
| 401 | 인증 토큰 없음 또는 만료 |
| 403 | RLS 위반 |

---

## Dashboard (대시보드 집계)

### 포트폴리오 요약 (DB Function)

부문별 평가금액, 수익률, 평단가를 집계하여 반환한다. 현재가는 클라이언트에서 별도 조회 후 합산한다.

- **방식**: RPC (DB Function)
- **호출**: `supabase.rpc('get_portfolio_summary', { p_asset_type })`
- **인증**: 필요

**요청 파라미터**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| p_asset_type | `'korean_stock' \| 'us_stock' \| 'crypto' \| null` | N | null이면 전체 부문 집계 |

**응답**
```typescript
Array<{
  ticker: string
  name: string
  asset_type: 'korean_stock' | 'us_stock' | 'crypto'
  quantity: number              // 보유 수량 (매수 - 매도)
  avg_buy_price: number         // 평균 매수가 (가중평균)
  currency: string              // 거래 통화
  total_invested: number        // 투입 원금 (settlement_amount 누계)
  total_fee: number             // 누적 수수료
  total_tax: number             // 누적 세금
}>
```

**에러 케이스**
| 코드 | 상황 |
|------|------|
| 401 | 인증 토큰 없음 또는 만료 |

---

### 자산 히스토리 그래프 데이터 (DB Function)

누적 자산 변화 그래프 데이터를 기간 단위별로 집계하여 반환한다.

- **방식**: RPC (DB Function)
- **호출**: `supabase.rpc('get_asset_history', { p_period, p_asset_type })`
- **인증**: 필요

**요청 파라미터**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| p_period | `'day' \| 'week' \| 'month' \| 'year'` | Y | 기간 단위 |
| p_asset_type | `'korean_stock' \| 'us_stock' \| 'crypto' \| null` | N | null이면 전체 |

**응답**
```typescript
Array<{
  bucket: string               // 집계 기준 시각 (ISO 8601)
  total_invested: number       // 누적 투입 원금 (KRW 환산)
  total_fee_tax: number        // 누적 수수료 + 세금 (KRW 환산)
  // 누적 총 자산은 클라이언트에서 현재가 + 예수금을 합산하여 계산
}>
```

**에러 케이스**
| 코드 | 상황 |
|------|------|
| 400 | p_period 값 오류 |
| 401 | 인증 토큰 없음 또는 만료 |

---

### 부문별 비중 파이 차트 데이터 (DB Function)

현재가 없이 투입 원금 기준으로 부문별 비중을 반환한다. 현재 평가금액 기준 비중은 클라이언트에서 현재가 합산 후 계산한다.

- **방식**: RPC (DB Function)
- **호출**: `supabase.rpc('get_sector_allocation')`
- **인증**: 필요

**요청 파라미터**
없음

**응답**
```typescript
Array<{
  asset_type: 'korean_stock' | 'us_stock' | 'crypto'
  total_invested: number        // 해당 부문 투입 원금 합계 (KRW 환산 기준)
  ticker_count: number          // 보유 종목 수
}>
```

**에러 케이스**
| 코드 | 상황 |
|------|------|
| 401 | 인증 토큰 없음 또는 만료 |

---

## Market (외부 시장 데이터 — Edge Function)

### 현재가 조회

한국 주식·미국 주식은 Twelve Data, 코인은 CoinGecko API를 호출하여 현재가를 반환한다. API 키는 Edge Function 내부에서 관리한다.

- **방식**: RPC (Edge Function)
- **호출**: `supabase.functions.invoke('get-market-prices', { body: { tickers } })`
- **인증**: 필요

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
    currency: string             // 'KRW' | 'USD' | 코인티커
    fetched_at: string           // 데이터 수신 시각 (ISO 8601)
    is_cached: boolean           // 캐시 데이터 여부
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
- **인증**: 필요

**요청 파라미터**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| from | string | N | 원본 통화 (기본 'USD') |
| to | string | N | 대상 통화 (기본 'KRW') |

**응답**
```typescript
{
  from: string                   // 'USD'
  to: string                     // 'KRW'
  rate: number                   // 환율 (예: 1380.5)
  fetched_at: string             // 데이터 수신 시각 (ISO 8601)
  is_cached: boolean             // 캐시 데이터 여부 (캐시 유효기간 1시간)
}
```

**에러 케이스**
| 코드 | 상황 |
|------|------|
| 400 | 지원하지 않는 통화 쌍 |
| 401 | 인증 토큰 없음 또는 만료 |
| 502 | 외부 API(ExchangeRate-API) 호출 실패 (캐시 값으로 대체 시 is_cached: true) |

---

## 변경 이력

| 이슈 | 변경 내용 |
|------|----------|
| [001] 사용자 인증 | Auth 도메인 추가 (signup, createProfile, signIn, signOut, getSession, onAuthStateChange) |
| [002] 이메일 인증 플로우 | Auth — resendVerificationEmail 추가. createProfile 호출 시점을 이메일 인증 완료 후로 명확화. |
| [003] 메인 대시보드 | TradeEvent 도메인 추가 (목록 조회, 등록, 수정, 삭제, CSV 업로드 미리보기, CSV 확정 저장). CashBalance 도메인 추가 (목록 조회, 스냅샷 등록). Dashboard 집계 도메인 추가 (포트폴리오 요약, 자산 히스토리, 부문별 비중). Market 도메인 추가 (현재가 조회, 환율 조회). |
