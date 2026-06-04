# Domain Model

*최종 업데이트: 11f2f4c — 2026-06-04*

## 엔터티

### User
Supabase Auth가 관리하는 인증 사용자. `auth.users` 테이블에 저장되며 앱에서 직접 생성하지 않는다. 이메일/비밀번호 및 Google·Apple OAuth 소셜 로그인 모두 동일한 테이블로 통합 관리된다. 동일 이메일의 여러 provider는 Supabase 자동 링킹으로 하나의 User로 병합된다.

| 속성 | 타입 | 설명 | 제약 |
|------|------|------|------|
| id | uuid | 기본 키 (Supabase Auth 생성) | PK, not null |
| email | text | 로그인용 이메일 | unique, not null |
| created_at | timestamptz | 가입 시각 | not null |

### Profile
사용자 추가 프로필 정보. `auth.users`와 1:1 관계. 이메일 가입 시 이메일 인증 완료(`SIGNED_IN` 이벤트) 후 생성, 소셜 로그인 시 첫 로그인(`SIGNED_IN` 이벤트) 시 자동 생성. 소셜 로그인의 닉네임은 provider의 `full_name` 또는 `name` 메타데이터를 사용하며, 없으면 이메일 @ 앞부분으로 대체한다. 테이블 구조는 인증 방식에 무관하게 동일.

| 속성 | 타입 | 설명 | 제약 |
|------|------|------|------|
| id | uuid | 기본 키 (auth.users.id와 동일) | PK, not null |
| user_id | uuid | Supabase Auth 사용자 ID | FK → auth.users(id), unique, not null |
| nickname | text | 닉네임 (2~20자). 소셜 로그인 시 provider display name 자동 설정. | not null |
| created_at | timestamptz | 프로필 생성 시각 | not null |
| updated_at | timestamptz | 프로필 수정 시각 | not null |

### Session
Supabase Auth가 세션을 관리한다. 앱 도메인 엔터티로는 별도 정의하지 않으며, Supabase Auth 내부 세션 메커니즘(JWT + refresh token)을 사용한다. 클라이언트는 `expo-secure-store`에 세션을 저장하여 자동 로그인을 구현한다.

### Identity
Supabase Auth가 관리하는 인증 제공자 연동 정보. `auth.identities` 테이블에 저장되며 앱에서 직접 생성/수정하지 않는다. 동일 User에 여러 provider(email, google, apple)가 연결될 수 있다.

| 속성 | 타입 | 설명 | 제약 |
|------|------|------|------|
| id | uuid | 기본 키 (Supabase Auth 생성) | PK, not null |
| user_id | uuid | 연결된 사용자 ID | FK → auth.users(id), not null |
| provider | text | 인증 제공자 (email / google / apple) | not null |
| identity_data | jsonb | provider별 사용자 정보 (email, name, sub 등) | not null |
| created_at | timestamptz | 연동 시각 | not null |

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

### Stock
종목(주식·코인) 마스터. 거래 여부와 무관한 진짜 마스터 테이블로, 보유 중이지 않은 관심 종목도 등록 가능하다. 시장별로 동일 티커가 중복될 수 있으므로 서로게이트 키 사용. 쓰기는 FastAPI 서버(service role)를 통해서만 허용(upsert). DB 테이블명: `stocks`.

| 속성 | 타입 | 설명 | 제약 |
|------|------|------|------|
| id | uuid | 기본 키 | PK, not null |
| ticker | text | 종목 코드 또는 코인 티커 (KR: '005930', US: 'AAPL', Crypto: 'BTC') | not null |
| name | text | 종목명 (한글 우선, 없으면 영문) | not null |
| market | text | 시장 구분 (KR / US / CRYPTO) | not null |
| currency | text | 거래 통화 (KRW / USD / KRW(업비트)) | not null |
| sector_id | int | 섹터 ID (GICS 분류, 적재 시 자동 추천 후 수동 보정 가능) | FK → sectors(id), nullable |
| is_active | boolean | 상장 여부 (상장폐지·거래중단 시 false, 행은 유지) | not null, default true |
| created_at | timestamptz | 생성 시각 | not null |

> `(ticker, market)` unique 제약. RLS: 읽기는 인증된 사용자 전체 허용, 쓰기는 service role만 허용.

### Sector
섹터 마스터. GICS 11개 + 가상자산 = 12개 고정 시드. 모든 사용자가 공유하며 앱에서 수정하지 않는다. DB 테이블명: `sectors`.

| 속성 | 타입 | 설명 | 제약 |
|------|------|------|------|
| id | int | 기본 키 | PK, not null |
| code | text | 섹터 코드 (IT / HEALTHCARE / FINANCIALS / CONS_DISC / CONS_STAPLES / COMM / INDUSTRIALS / MATERIALS / ENERGY / UTILITIES / REAL_ESTATE / CRYPTO) | unique, not null |
| name | text | 섹터 이름 (정보기술 / 헬스케어 / 금융 / 경기소비재 / 필수소비재 / 커뮤니케이션서비스 / 산업재 / 소재 / 에너지 / 유틸리티 / 부동산 / 가상자산) | not null |

### KrSectorMap
네이버 업종명 → GICS 섹터 매핑 테이블. 한국 주식의 섹터 자동 추천용 시드 테이블. DB 테이블명: `kr_sector_map`.

| 속성 | 타입 | 설명 | 제약 |
|------|------|------|------|
| naver_industry | text | 네이버 업종명 (예: 반도체) | PK, not null |
| sector_id | int | 매핑되는 GICS 섹터 ID | FK → sectors(id), not null |

### Memo
사용자의 투자 일지 메모 본체. 0개 이상의 엔터티(종목·매매이벤트·뉴스·섹터)와 연결될 수 있다. 수정·삭제 가능한 주관적 기록으로 금융 이벤트의 무수정 원칙 적용 대상이 아니다. DB 테이블명: `memos`.

| 속성 | 타입 | 설명 | 제약 |
|------|------|------|------|
| id | uuid | 기본 키 | PK, not null |
| user_id | uuid | 사용자 ID | FK → auth.users(id), not null |
| body | text | 메모 본문 | not null |
| created_at | timestamptz | 작성 일시 (달력 배치 기준) | not null |
| updated_at | timestamptz | 수정 시각 | not null |

### MemoStock
메모-종목 연결 junction 테이블. 종목 연결 시 목표가를 함께 기록할 수 있다. DB 테이블명: `memo_stocks`.

| 속성 | 타입 | 설명 | 제약 |
|------|------|------|------|
| memo_id | uuid | 메모 ID | PK (복합), FK → memos(id) on delete cascade |
| stock_id | uuid | 종목 ID | PK (복합), FK → stocks(id) on delete cascade |
| goal_price | numeric | 목표가 (해당 종목 원통화 기준, 표시 시 KRW 환산) | nullable |

### MemoTradeEvent
메모-매매이벤트 연결 junction 테이블. 매수/매도 이유 기록에 사용. 참조 대상은 `account_events.event_type in ('buy', 'sell')`로 제한. DB 테이블명: `memo_trade_events`.

| 속성 | 타입 | 설명 | 제약 |
|------|------|------|------|
| memo_id | uuid | 메모 ID | PK (복합), FK → memos(id) on delete cascade |
| event_id | uuid | 계정 이벤트 ID | PK (복합), FK → account_events(id) on delete cascade |

### MemoNews
메모-뉴스 연결 junction 테이블. 뉴스 스크랩 메모에 사용. DB 테이블명: `memo_news`.

| 속성 | 타입 | 설명 | 제약 |
|------|------|------|------|
| memo_id | uuid | 메모 ID | PK (복합), FK → memos(id) on delete cascade |
| news_id | uuid | 뉴스 ID | PK (복합), FK → news(id) on delete cascade |

### MemoSector
메모-섹터 연결 junction 테이블. 섹터(테마) 기반 메모에 사용. DB 테이블명: `memo_sectors`.

| 속성 | 타입 | 설명 | 제약 |
|------|------|------|------|
| memo_id | uuid | 메모 ID | PK (복합), FK → memos(id) on delete cascade |
| sector_id | int | 섹터 ID | PK (복합), FK → sectors(id) on delete cascade |

## 관계

| 관계 | 설명 |
|------|------|
| User 1:1 Profile | 한 사용자는 하나의 프로필을 가진다. 이메일: 인증 완료 후 생성. 소셜: 첫 로그인 시 자동 생성. |
| User 1:N Identity | 한 사용자는 여러 인증 제공자(email / google / apple)와 연동될 수 있다. 동일 이메일 시 Supabase 자동 링킹. |
| User 1:N AccountEvent | 한 사용자는 여러 계정 이벤트(매수/매도/입금/출금/배당)를 가진다. |
| User 1:N DailySnapshot | 한 사용자는 날짜별 자산 스냅샷을 가진다. (user_id, snapshot_date) unique. |
| AccountEvent N:1 Price | 매수/매도 이벤트의 ticker+asset_type+date로 Price 조회. |
| CorporateAction N:1 Price | 종목 분할 등 기업 액션은 해당 ticker의 가격 데이터와 연계. |
| Stock N:1 Sector | 종목은 하나의 섹터에 속한다 (nullable). 종목 등록 시 자동 추천 후 수동 보정 가능. |
| KrSectorMap N:1 Sector | 네이버 업종명은 하나의 GICS 섹터로 매핑된다. |
| User 1:N Memo | 한 사용자는 여러 메모를 가진다. |
| Memo N:M Stock | 한 메모는 여러 종목에 연결될 수 있고, 하나의 종목은 여러 메모에 연결될 수 있다 (MemoStock junction). |
| Memo N:M AccountEvent | 한 메모는 여러 매매이벤트에 연결될 수 있다 (MemoTradeEvent junction, buy/sell만). |
| Memo N:M News | 한 메모는 여러 뉴스에 연결될 수 있다 (MemoNews junction). |
| Memo N:M Sector | 한 메모는 여러 섹터에 연결될 수 있다 (MemoSector junction). |

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
| [005] 소셜 로그인 추가 (7ab2e6f) | Identity 엔터티 추가 (auth.identities, Supabase 관리). User 엔터티 설명에 소셜 로그인 통합 관리 및 자동 링킹 개념 추가. Profile 엔터티 설명에 소셜 로그인 첫 가입 시 닉네임 자동 설정 로직 추가. 관계에 User 1:N Identity 추가. |
| [006] 메모/투자 일지 (7b4d051) | Stock 엔터티 추가 (sector_id 컬럼 포함). Sector 엔터티 추가 (GICS 11 + 가상자산 12개 고정 시드). KrSectorMap 엔터티 추가 (네이버 업종 → GICS 매핑). Memo 엔터티 추가. MemoStock junction 엔터티 추가 (goal_price 포함). MemoTradeEvent junction 엔터티 추가. MemoNews junction 엔터티 추가. MemoSector junction 엔터티 추가. 관계 7건 추가 (Stock-Sector, KrSectorMap-Sector, User-Memo, Memo-Stock N:M, Memo-AccountEvent N:M, Memo-News N:M, Memo-Sector N:M). |
| [006] 종목 검색 기능 (78dfc50) | Stock 엔터티 재정의: `asset_type` 제거, `market`(KR/US/CRYPTO) 추가, `currency` 추가, `is_active` 추가. unique 제약 `(ticker, asset_type)` → `(ticker, market)` 변경. RLS 정책 명확화(읽기 전체 허용, 쓰기 service role 전용). 엔터티 설명에 "진짜 마스터 테이블" 역할(관심 종목 포함) 및 FastAPI 경유 upsert 정책 반영. |
| [006] 메모 필터 기능 수정 (11f2f4c) | 엔터티·속성·관계 변경 없음. 필터 동작 규칙 변경: (1) 필터 항목명 "매매이벤트 연관" → "매매 연관". (2) 종목 필터 4.1 규칙에서 "직접 연결만 보기" 토글 제거 — 대신 "종목 X + 매매 연관" 동시 선택으로 동일 효과 구현. (3) 필터 결합 방식 명확화: 같은 타입 내 복수 선택 → OR, 타입 간 → AND. (4) "연결 없음" 필터는 다른 필터와 상호 배타적으로 동작(선택 시 나머지 자동 해제). |
