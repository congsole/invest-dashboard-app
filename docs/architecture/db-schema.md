# DB Schema

*최종 업데이트: 00b3fb9 — 2026-04-27*

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

### account_events
사용자의 계정 이벤트 기록. 매수/매도/입금/출금/배당 5종 이벤트를 단일 테이블로 관리한다. 평단가 계산·원금·예수금·배당 집계의 원천 데이터.

| 컬럼 | 타입 | 기본값 | 제약 | 설명 |
|------|------|--------|------|------|
| id | uuid | gen_random_uuid() | PK | 기본 키 |
| user_id | uuid | — | FK → auth.users(id) ON DELETE CASCADE, not null | 사용자 ID |
| event_type | text | — | not null, CHECK (event_type IN ('buy', 'sell', 'deposit', 'withdraw', 'dividend')) | 이벤트 유형 |
| event_date | date | — | not null | 발생일 |
| asset_type | text | — | nullable, CHECK (asset_type IN ('korean_stock', 'us_stock', 'crypto', 'cash') OR asset_type IS NULL) | 자산 유형. 입출금은 null 또는 'cash'. |
| ticker | text | — | nullable | 종목 코드 또는 코인 티커. 입출금은 null. |
| name | text | — | nullable | 종목명. 입출금은 null. |
| quantity | numeric | — | nullable, CHECK (quantity IS NULL OR quantity > 0) | 수량. 입출금/배당은 null 가능. |
| price_per_unit | numeric | — | nullable, CHECK (price_per_unit IS NULL OR price_per_unit >= 0) | 1주당 체결가. 입출금/배당은 null. |
| currency | text | — | not null | 거래 통화 (KRW / USD / 코인 티커) |
| fee | numeric | 0 | not null, CHECK (fee >= 0) | 수수료 |
| fee_currency | text | — | nullable | 수수료 통화 |
| tax | numeric | 0 | not null, CHECK (tax >= 0) | 세금 (배당의 원천징수 포함) |
| amount | numeric | — | not null | 정산금액 / 입출금액 / 배당금액 (통화 단위) |
| fx_rate_at_event | numeric | — | nullable, CHECK (fx_rate_at_event IS NULL OR fx_rate_at_event > 0) | 이벤트 시점 KRW/USD 환율. 입출금은 필수(원금 KRW 환산용). |
| source | text | — | not null, CHECK (source IN ('csv', 'manual')) | 데이터 출처 |
| external_ref | text | — | nullable | CSV의 거래 식별자 (중복 검출용) |
| created_at | timestamptz | now() | not null | 생성 시각 |

**인덱스**
- `idx_account_events_user_id` ON (user_id) — 사용자별 전체 이벤트 조회
- `idx_account_events_user_id_event_date` ON (user_id, event_date) — 기간별 히스토리 그래프 집계
- `idx_account_events_user_id_ticker` ON (user_id, ticker) — 종목별 평단가 계산
- `idx_account_events_user_id_asset_type` ON (user_id, asset_type) — 부문별 필터 조회
- `idx_account_events_user_id_external_ref` ON (user_id, external_ref) — CSV 중복 검출 (external_ref IS NOT NULL인 경우)

**RLS 방향**
- SELECT: 본인(`auth.uid() = user_id`)만 조회 가능
- INSERT: 본인 user_id로만 삽입 가능 (`auth.uid() = user_id`)
- UPDATE: 본인 레코드만 수정 가능 (`auth.uid() = user_id`)
- DELETE: 본인 레코드만 삭제 가능 (`auth.uid() = user_id`)

---

### daily_snapshots
매일 KST 자정 직후 cron으로 기록하는 자산 스냅샷. 히스토리 그래프 성능 최적화 및 추후 TWR 소급 계산용.

| 컬럼 | 타입 | 기본값 | 제약 | 설명 |
|------|------|--------|------|------|
| id | uuid | gen_random_uuid() | PK | 기본 키 |
| user_id | uuid | — | FK → auth.users(id) ON DELETE CASCADE, not null | 사용자 ID |
| snapshot_date | date | — | not null | 스냅샷 날짜 |
| total_value_krw | numeric | — | not null | 총 평가액 (KRW 환산) |
| principal_krw | numeric | — | not null | 원금 (KRW 환산) |
| cash_krw | numeric | — | not null | 예수금 KRW |
| cash_usd | numeric | — | not null | 예수금 USD |
| net_profit_krw | numeric | — | not null | 순수익 (= total_value_krw − principal_krw) |
| fx_rate_usd | numeric | — | not null, CHECK (fx_rate_usd > 0) | 그날 종가 환율 (USD/KRW) |
| created_at | timestamptz | now() | not null | 생성 시각 |

**인덱스**
- `idx_daily_snapshots_user_id_snapshot_date` ON (user_id, snapshot_date DESC) — 사용자별 날짜 범위 조회 (UNIQUE 제약과 별도로 정렬 최적화)

**UNIQUE 제약**
- `uq_daily_snapshots_user_id_snapshot_date` ON (user_id, snapshot_date)

**RLS 방향**
- SELECT: 본인(`auth.uid() = user_id`)만 조회 가능
- INSERT: 본인 user_id로만 삽입 가능 (`auth.uid() = user_id`). cron Edge Function은 service_role로 모든 사용자에 INSERT.
- UPDATE: 본인 레코드만 수정 가능 (`auth.uid() = user_id`)
- DELETE: 허용하지 않음

---

### corporate_actions
주식 분할·무상증자·합병 등 기업 액션 기록. 과거 거래 기록은 절대 수정하지 않고 effective_date 이후 보유수량을 이 테이블의 ratio로 조정한다. 종목 단위로 모든 사용자가 공유.

| 컬럼 | 타입 | 기본값 | 제약 | 설명 |
|------|------|--------|------|------|
| id | uuid | gen_random_uuid() | PK | 기본 키 |
| ticker | text | — | not null | 종목 코드 |
| asset_type | text | — | not null, CHECK (asset_type IN ('korean_stock', 'us_stock')) | 자산 유형 |
| action_type | text | — | not null, CHECK (action_type IN ('split', 'reverse_split', 'dividend_stock', 'merger')) | 액션 유형 |
| effective_date | date | — | not null | 효력 발생일 |
| ratio | numeric | — | not null, CHECK (ratio > 0) | 분할 비율 (예: 4:1 분할 → 4) |
| metadata | jsonb | — | nullable | 합병 등 복잡한 케이스용 추가 정보 |
| created_at | timestamptz | now() | not null | 생성 시각 |

**인덱스**
- `idx_corporate_actions_ticker_asset_type` ON (ticker, asset_type) — 종목별 기업 액션 조회
- `idx_corporate_actions_ticker_effective_date` ON (ticker, effective_date) — 특정 날짜 이후 유효한 액션 필터

**RLS 방향**
- SELECT: 모든 인증 사용자 공개 조회 가능
- INSERT / UPDATE / DELETE: service_role만 허용 (일반 사용자 불가)

---

### prices
일별 종가 캐시. 매일 cron으로 신규 종가만 수집. SELECT는 공개, 적재는 service_role 전용.

| 컬럼 | 타입 | 기본값 | 제약 | 설명 |
|------|------|--------|------|------|
| ticker | text | — | PK (복합) | 종목 코드 또는 코인 티커 |
| asset_type | text | — | PK (복합), CHECK (asset_type IN ('korean_stock', 'us_stock', 'crypto')) | 자산 유형 |
| date | date | — | PK (복합) | 날짜 |
| close | numeric | — | not null, CHECK (close >= 0) | 종가 |
| currency | text | — | not null | 가격 통화 (KRW / USD 등) |
| updated_at | timestamptz | now() | not null | 갱신 시각 |

**기본 키**
- `(ticker, asset_type, date)` 복합 PK

**RLS 방향**
- SELECT: 모든 인증 사용자 공개 조회 가능
- INSERT / UPDATE: service_role만 허용
- DELETE: 허용하지 않음

---

### fx_rates
일별 USD/KRW 환율 캐시. 매일 cron으로 적재. SELECT는 공개, 적재는 service_role 전용.

| 컬럼 | 타입 | 기본값 | 제약 | 설명 |
|------|------|--------|------|------|
| date | date | — | PK | 날짜 |
| usd_krw | numeric | — | not null, CHECK (usd_krw > 0) | USD/KRW 환율 |
| updated_at | timestamptz | now() | not null | 갱신 시각 |

**RLS 방향**
- SELECT: 모든 인증 사용자 공개 조회 가능
- INSERT / UPDATE: service_role만 허용
- DELETE: 허용하지 않음

---

## ERD (텍스트)

```
auth.users ||--|| profiles : "1:1 (user_id FK)"
auth.users ||--o{ account_events : "1:N (user_id FK)"
auth.users ||--o{ daily_snapshots : "1:N (user_id FK)"
account_events }o--o| prices : "N:1 (ticker + asset_type + event_date → prices)"
corporate_actions }o--o| prices : "N:1 (ticker + asset_type + effective_date → prices)"
```

## 변경 이력

| 이슈 | 변경 내용 |
|------|----------|
| [001] 사용자 인증 | profiles 테이블 추가. auth.users는 Supabase Auth 관리. |
| [002] 이메일 인증 플로우 | DB 스키마 변경 없음. 재발송 쿨다운은 클라이언트 state로 관리. |
| [003] 메인 대시보드 | trade_events, cash_balances 테이블 추가. ERD 관계 2개 추가. |
| [004] 대시보드 기획 수정 (00b3fb9) | trade_events → account_events로 대체 (5종 이벤트 통합, nullable 필드, fx_rate_at_event/source/external_ref 추가). cash_balances 제거 (account_events 누적 계산으로 대체). daily_snapshots 테이블 추가. corporate_actions 테이블 추가. prices 테이블 추가. fx_rates 테이블 추가. ERD 관계 업데이트. |
