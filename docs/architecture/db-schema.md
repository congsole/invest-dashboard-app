# DB Schema

*최종 업데이트: 1dc2688 — 2026-04-23*

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

### trade_events
사용자의 매매 이벤트 (매수/매도) 기록. 한국 주식, 미국 주식, 코인을 통합 관리한다. 평단가 계산의 원천 데이터이며 누적 투입 원금·수수료·세금 차트의 기초가 된다.

| 컬럼 | 타입 | 기본값 | 제약 | 설명 |
|------|------|--------|------|------|
| id | uuid | gen_random_uuid() | PK | 기본 키 |
| user_id | uuid | — | FK → auth.users(id) ON DELETE CASCADE, not null | 사용자 ID |
| asset_type | text | — | not null, CHECK (asset_type IN ('korean_stock', 'us_stock', 'crypto')) | 자산 유형 |
| trade_type | text | — | not null, CHECK (trade_type IN ('buy', 'sell')) | 매매 유형 |
| ticker | text | — | not null | 종목 코드 또는 코인 티커 (예: 005930, AAPL, BTC) |
| name | text | — | not null | 종목명 |
| trade_date | date | — | not null | 체결 날짜 |
| quantity | numeric | — | not null, CHECK (quantity > 0) | 수량 |
| price_per_unit | numeric | — | not null, CHECK (price_per_unit >= 0) | 체결가 (1주당) |
| currency | text | — | not null | 거래 통화 (KRW / USD / 코인티커) |
| fee | numeric | 0 | not null, CHECK (fee >= 0) | 수수료 |
| fee_currency | text | 'KRW' | not null | 수수료 통화 (기본 KRW, 코인은 해당 티커) |
| tax | numeric | 0 | not null, CHECK (tax >= 0) | 세금 |
| settlement_amount | numeric | — | not null | 정산금액 (실제 입출금액, 매수는 음수/매도는 양수) |
| created_at | timestamptz | now() | not null | 생성 시각 |

**인덱스**
- `idx_trade_events_user_id` ON (user_id) — 사용자별 전체 매매 이벤트 조회
- `idx_trade_events_user_id_trade_date` ON (user_id, trade_date) — 기간별 히스토리 그래프 집계
- `idx_trade_events_user_id_ticker` ON (user_id, ticker) — 종목별 평단가 계산
- `idx_trade_events_user_id_asset_type` ON (user_id, asset_type) — 부문별 필터 조회

**RLS 방향**
- SELECT: 본인(`auth.uid() = user_id`)만 조회 가능
- INSERT: 본인 user_id로만 삽입 가능 (`auth.uid() = user_id`)
- UPDATE: 본인 레코드만 수정 가능 (`auth.uid() = user_id`)
- DELETE: 본인 레코드만 삭제 가능 (`auth.uid() = user_id`)

---

### cash_balances
예수금 스냅샷. 매매 이벤트 정산금액 누계로 자동 계산하거나, 사용자가 직접 입력하여 기록한다.

| 컬럼 | 타입 | 기본값 | 제약 | 설명 |
|------|------|--------|------|------|
| id | uuid | gen_random_uuid() | PK | 기본 키 |
| user_id | uuid | — | FK → auth.users(id) ON DELETE CASCADE, not null | 사용자 ID |
| balance | numeric | — | not null | 잔고 |
| currency | text | — | not null, CHECK (currency IN ('KRW', 'USD')) | 통화 |
| recorded_at | timestamptz | now() | not null | 기록 시점 |

**인덱스**
- `idx_cash_balances_user_id` ON (user_id) — 사용자별 예수금 목록 조회
- `idx_cash_balances_user_id_currency_recorded_at` ON (user_id, currency, recorded_at DESC) — 통화별 최신 잔고 조회

**RLS 방향**
- SELECT: 본인(`auth.uid() = user_id`)만 조회 가능
- INSERT: 본인 user_id로만 삽입 가능 (`auth.uid() = user_id`)
- UPDATE: 본인 레코드만 수정 가능 (`auth.uid() = user_id`)
- DELETE: 본인 레코드만 삭제 가능 (`auth.uid() = user_id`)

---

## ERD (텍스트)

```
auth.users ||--|| profiles : "1:1 (user_id FK)"
auth.users ||--o{ trade_events : "1:N (user_id FK)"
auth.users ||--o{ cash_balances : "1:N (user_id FK)"
```

## 변경 이력

| 이슈 | 변경 내용 |
|------|----------|
| [001] 사용자 인증 | profiles 테이블 추가. auth.users는 Supabase Auth 관리. |
| [002] 이메일 인증 플로우 | DB 스키마 변경 없음. 재발송 쿨다운은 클라이언트 state로 관리. |
| [003] 메인 대시보드 | trade_events, cash_balances 테이블 추가. ERD 관계 2개 추가. |
