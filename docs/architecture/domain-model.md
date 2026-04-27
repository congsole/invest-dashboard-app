# Domain Model

*최종 업데이트: 00b3fb9 — 2026-04-27*

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

### AccountEvent
사용자의 계정 이벤트 기록. 기존 `TradeEvent` (매수/매도만)를 확장하여 5종 이벤트(매수/매도/입금/출금/배당)를 단일 테이블로 관리한다. DB 테이블명: `account_events`.

평단가 계산 규칙: 매수 이벤트 기준 가중평균. 매도 시 평균매수가 불변. 전량 매도 후 재매수 시 새로 계산. 기업 액션(분할 등) 발생 시 비율에 따라 조정.

| 속성 | 타입 | 설명 | 제약 |
|------|------|------|------|
| id | uuid | 기본 키 | PK, not null |
| user_id | uuid | 사용자 ID | FK → auth.users(id), not null |
| event_type | enum | 이벤트 유형 (buy / sell / deposit / withdraw / dividend) | not null |
| event_date | date | 발생일 | not null |
| asset_type | enum | 자산 유형 (korean_stock / us_stock / crypto / cash). 입출금은 null 허용. | nullable |
| ticker | text | 종목 코드 또는 코인 티커. 입출금은 null. | nullable |
| name | text | 종목명. 입출금은 null. | nullable |
| quantity | numeric | 수량. 입출금/배당은 null 허용. | nullable |
| price_per_unit | numeric | 1주당 체결가. 입출금/배당은 null. | nullable |
| currency | text | 거래 통화 (KRW / USD / 코인 티커) | not null |
| fee | numeric | 수수료 | not null, default 0 |
| fee_currency | text | 수수료 통화 | nullable |
| tax | numeric | 세금 (배당의 원천징수 포함) | not null, default 0 |
| amount | numeric | 정산금액 / 입출금액 / 배당금액 (통화 단위) | not null |
| fx_rate_at_event | numeric | 이벤트 시점 KRW/USD 환율. 입출금은 필수(원금 KRW 환산용). | nullable |
| source | enum | 데이터 출처 (csv / manual) | not null |
| external_ref | text | CSV의 거래 식별자 (중복 검출용) | nullable |
| created_at | timestamptz | 생성 시각 | not null |

### DailySnapshot
매일 KST 자정 직후 cron으로 기록하는 자산 스냅샷. 그래프 성능 최적화 및 추후 TWR 소급 계산용. DB 테이블명: `daily_snapshots`.

| 속성 | 타입 | 설명 | 제약 |
|------|------|------|------|
| id | uuid | 기본 키 | PK, not null |
| user_id | uuid | 사용자 ID | FK → auth.users(id), not null |
| snapshot_date | date | 스냅샷 날짜 | not null |
| total_value_krw | numeric | 총 평가액 (KRW 환산) | not null |
| principal_krw | numeric | 원금 (KRW 환산) | not null |
| cash_krw | numeric | 예수금 KRW | not null |
| cash_usd | numeric | 예수금 USD | not null |
| net_profit_krw | numeric | 순수익 (= total_value − principal) | not null |
| fx_rate_usd | numeric | 그날 종가 환율 | not null |
| created_at | timestamptz | 생성 시각 | not null |

> `(user_id, snapshot_date)` unique 제약.

### CorporateAction
주식 분할·무상증자·합병 등 기업 액션 기록. 과거 거래 기록은 절대 수정하지 않고 이 테이블의 이벤트로 effective_date 이후 보유수량을 조정한다. 종목 단위로 모든 사용자가 공유하며 RLS는 SELECT only. DB 테이블명: `corporate_actions`.

| 속성 | 타입 | 설명 | 제약 |
|------|------|------|------|
| id | uuid | 기본 키 | PK, not null |
| ticker | text | 종목 코드 | not null |
| asset_type | enum | 자산 유형 (korean_stock / us_stock) | not null |
| action_type | enum | 액션 유형 (split / reverse_split / dividend_stock / merger) | not null |
| effective_date | date | 효력 발생일 | not null |
| ratio | numeric | 분할 비율 (예: 4:1 분할 → 4) | not null |
| metadata | jsonb | 합병 등 복잡한 케이스용 추가 정보 | nullable |
| created_at | timestamptz | 생성 시각 | not null |

### Price
일별 종가 캐시. 매일 cron으로 신규 종가만 수집. DB 테이블명: `prices`.

| 속성 | 타입 | 설명 | 제약 |
|------|------|------|------|
| ticker | text | 종목 코드 또는 코인 티커 | PK (복합) |
| asset_type | enum | 자산 유형 (korean_stock / us_stock / crypto) | PK (복합) |
| date | date | 날짜 | PK (복합) |
| close | numeric | 종가 | not null |
| currency | text | 가격 통화 | not null |
| updated_at | timestamptz | 갱신 시각 | not null |

> `(ticker, asset_type, date)` 복합 PK.

### FxRate
일별 환율 캐시. DB 테이블명: `fx_rates`.

| 속성 | 타입 | 설명 | 제약 |
|------|------|------|------|
| date | date | 날짜 | PK, not null |
| usd_krw | numeric | USD/KRW 환율 | not null |
| updated_at | timestamptz | 갱신 시각 | not null |

## 관계

| 관계 | 설명 |
|------|------|
| User 1:1 Profile | 한 사용자는 하나의 프로필을 가진다. 회원가입 시 자동 생성. |
| User 1:N AccountEvent | 한 사용자는 여러 계정 이벤트(매수/매도/입금/출금/배당)를 가진다. |
| User 1:N DailySnapshot | 한 사용자는 날짜별 자산 스냅샷을 가진다. (user_id, snapshot_date) unique. |
| AccountEvent N:1 Price | 매수/매도 이벤트의 ticker+asset_type+date로 Price 조회. |
| CorporateAction N:1 Price | 종목 분할 등 기업 액션은 해당 ticker의 가격 데이터와 연계. |

## 계산 규칙

### 원금

```
원금(t) = Σ(deposit amount × fx_rate_at_event KRW 환산)
        − Σ(withdraw amount × fx_rate_at_event KRW 환산)
```

입출금 시점의 환율을 고정해 KRW로 환산. 원금이 환율 변동에 흔들리지 않게 함. 환율 변동은 평가액 쪽에서만 반영.

### 예수금 (통화별)

```
예수금(t, c) = Σ(c 통화 deposit amount)
            + Σ(c 통화 sell amount)
            + Σ(c 통화 dividend amount)
            − Σ(c 통화 withdraw amount)
            − Σ(c 통화 buy amount)
            − Σ(c 통화 fee)
            − Σ(c 통화 tax)
```

c ∈ {KRW, USD, ...}.

### 총 평가액

```
총 평가액(t) = Σ_종목i (보유수량_i(t) × 종가_i(t) × 환율_i(t))
            + Σ_통화c (예수금(t, c) × 환율_c(t))
```

환율과 종가는 t 시점의 값. 그래프 표시 시 환율 변동까지 반영.

### 순수익

```
순수익(t) = 총 평가액(t) − 원금(t)
```

### 수익률 (단순)

```
수익률(t) = 순수익(t) / 원금(t) × 100
```

단순 방식. 정확한 TWR은 PRD-002a-future 참조. `daily_snapshots` 보유 시 소급 계산 가능.

### 보유수량

매수 누적 − 매도 누적. `corporate_actions` 적용 시 effective_date 이후 보유수량은 ratio에 따라 자동 조정 (과거 거래 수량은 그대로 유지).

### 평균 매수가

```
평균매수가 = (기존 보유수량 × 기존 평균매수가 + 금번 매수수량 × 금번 체결가)
             ÷ (기존 보유수량 + 금번 매수수량)
```

매도 시 평균매수가 불변. 전량 매도 후 재매수 시 새로 계산. 기업 액션 발생 시 ratio에 따라 조정.

### 환율 처리 정책

- **차트·KPI 표시**: 모든 외화 자산을 t 시점 환율로 KRW 환산 (현재 환율 방식).
- **DB 저장**: 모든 거래는 원 통화 그대로 저장 + `fx_rate_at_event` 함께 기록. 추후 환차익/종목차익 분리(PRD-002a) 시 소급 계산 가능.
- **예수금 KPI 카드**: 통화별로 분리 표시 + 환산 합계 병기.

## 변경 이력

| 이슈 | 변경 내용 |
|------|----------|
| [001] 사용자 인증 | User, Profile 엔터티 추가. Session은 Supabase Auth 위임으로 별도 엔터티 없음. |
| [002] 이메일 인증 플로우 | 기존 엔터티 변경 없음. 프로필 저장 시점 명확화: 이메일 인증 완료(`SIGNED_IN` 이벤트) 후 저장. 닉네임은 회원가입~인증 완료 사이 메모리(state)에 임시 보관. |
| [003] 메인 대시보드 | TradeEvent, CashBalance 엔터티 추가. 관계 User 1:N TradeEvent, User 1:N CashBalance 추가. |
| [004] 대시보드 기획 수정 (00b3fb9) | TradeEvent → AccountEvent 전환 (5종 이벤트: buy/sell/deposit/withdraw/dividend, nullable 필드 추가, fx_rate_at_event/source/external_ref 추가). CashBalance 엔터티 제거 (account_events 누적 계산으로 대체). DailySnapshot 엔터티 추가. CorporateAction 엔터티 추가. Price 엔터티 추가. FxRate 엔터티 추가. 계산 규칙 섹션 추가 (원금/예수금/총 평가액/순수익/수익률/보유수량/평균매수가/환율 정책). 관계 업데이트. |
