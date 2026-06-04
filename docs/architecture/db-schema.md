# DB Schema

*최종 업데이트: b892f6d — 2026-06-04*

## 테이블

### profiles
사용자 추가 프로필 정보. Supabase Auth `auth.users`와 1:1 관계. 이메일 가입 시 이메일 인증 완료(`SIGNED_IN` 이벤트) 후 생성, 소셜 로그인(Google / Apple) 시 첫 로그인(`SIGNED_IN` 이벤트) 시 자동 생성. 소셜 로그인의 닉네임은 provider `full_name` / `name` 메타데이터를 사용하며, 없으면 이메일 @ 앞부분으로 대체. 인증 방식에 무관하게 테이블 구조는 동일.

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

### sectors
섹터 마스터. GICS 4단계 계층 구조(Sector → Industry Group → Industry → Sub-Industry). 기존 Level 1 시드 12개(GICS 11 + CRYPTO)는 유지되며, L2(~25개) · L3(~74개) · L4(~163개)가 추가되어 총 ~273개 행. 자기참조 FK(`parent_id`)로 계층 표현. 모든 사용자가 공유하며 앱에서 수정하지 않는다.

| 컬럼 | 타입 | 기본값 | 제약 | 설명 |
|------|------|--------|------|------|
| id | serial | — | PK | 섹터 기본 키. 기존 시드 1~12 유지, 신규는 13부터 자동 증가. |
| code | text | — | unique, not null | 섹터 코드 (L1 예: IT, L4 예: SEMI_MFG) |
| name | text | — | not null | 섹터 이름 한글 (예: 정보기술 / 반도체제조) |
| name_en | text | — | nullable | 섹터 영문명 (yfinance 반환값 및 GICS 공식 영문명 매칭용. 예: Information Technology / Semiconductor Manufacturing) |
| parent_id | int | — | nullable, FK → sectors(id) | 상위 섹터 ID. L1은 null, L2→L1, L3→L2, L4→L3 |
| level | int | 1 | not null, CHECK (level BETWEEN 1 AND 4) | GICS 계층 레벨. 1=Sector, 2=Industry Group, 3=Industry, 4=Sub-Industry |
| created_at | timestamptz | now() | not null | 생성 시각 |

**계층 예시**
```
L1: 정보기술 (Information Technology)
 └ L2: 반도체및반도체장비 (Semiconductors & Semiconductor Equipment)
    └ L3: 반도체 (Semiconductors)
       └ L4: 반도체제조 (Semiconductor Manufacturing)
```

**인덱스**
- `idx_sectors_parent_id` ON (parent_id) — 하위 레벨 조회 (하위 섹터 트리 탐색)
- `idx_sectors_level` ON (level) — 레벨별 필터 (메모 필터에서 L1·L2만 노출)

**마이그레이션 주의사항**
- `id`를 `serial`로 전환 시 시퀀스 시작값을 13 이상으로 설정하여 기존 FK(1~12) 보호.
- 기존 12개 시드에 `level=1`, `parent_id=null`, `name_en` 채움.

**RLS 방향**
- SELECT: 모든 인증 사용자 공개 조회 가능
- INSERT / UPDATE / DELETE: service_role만 허용 (앱에서 수정 불가)

---

### stocks
종목(주식·코인) 마스터. 거래 여부와 무관한 진짜 마스터 테이블로, 보유 중이지 않은 관심 종목도 등록 가능하다. 시장별로 동일 티커가 중복될 수 있으므로 서로게이트 키를 사용한다. 종목 등록 시 yfinance `sector`+`industry`로 `sector_id`를 자동 추천(한국·미국 주식 동일 경로, 암호화폐: CRYPTO 고정) 후 수동 보정 가능. `sector_id`는 가능한 한 GICS Level 4(Sub-Industry)를 가리키며, 매핑 실패 시 매핑 가능한 최하위 레벨까지. 쓰기는 FastAPI 서버(service role)를 통해서만 허용한다.

| 컬럼 | 타입 | 기본값 | 제약 | 설명 |
|------|------|--------|------|------|
| id | uuid | gen_random_uuid() | PK | 기본 키 |
| ticker | text | — | not null | 종목 코드 또는 코인 티커 (KR: '005930', US: 'AAPL', Crypto: 'BTC') |
| name | text | — | not null | 종목명 (한글 우선, 없으면 영문) |
| market | text | — | not null, CHECK (market IN ('KR', 'US', 'CRYPTO')) | 시장 구분 |
| currency | text | — | not null | 거래 통화 (KRW / USD / KRW(업비트)) |
| sector_id | int | — | nullable, FK → sectors(id) | 섹터 ID. 가능한 한 GICS L4(Sub-Industry)를 가리킴. 매핑 실패 시 최하위 매핑 가능 레벨(L1까지). nullable — 미분류 허용. |
| is_active | boolean | true | not null | 상장 여부 (상장폐지·거래중단 시 false, 행은 유지) |
| created_at | timestamptz | now() | not null | 생성 시각 |

**인덱스**
- `idx_stocks_ticker_market` ON (ticker, market) — 종목 단건 조회 (UNIQUE 제약과 병행)
- `idx_stocks_sector_id` ON (sector_id) — 섹터별 종목 목록 조회
- `idx_stocks_name` ON (name) — 종목명 검색 (ilike 쿼리 지원)

**UNIQUE 제약**
- `uq_stocks_ticker_market` ON (ticker, market)

**RLS 방향**
- SELECT: 모든 인증 사용자 공개 조회 가능
- INSERT / UPDATE / DELETE: service_role만 허용 (앱에서 종목 추가 시 FastAPI 서버를 거쳐 upsert)

---

### ~~kr_sector_map~~ (폐기 — PRD-004)

> **PRD-004에서 DROP됨.** yfinance 통일로 네이버 업종 → GICS 매핑이 불필요해졌다. 마이그레이션 시 `DROP TABLE kr_sector_map` 실행.

---

### gics_yfinance_map
yfinance `industry` 문자열 → GICS Sub-Industry(L4) 매핑 테이블. yfinance 반환값이 GICS L4 코드와 정확히 일치하지 않는 경우를 수동으로 관리한다. 배치 적재 시 `industry` 문자열로 이 테이블을 먼저 조회하고, 없으면 `sectors.name_en` 직접 매칭을 시도한다.

| 컬럼 | 타입 | 기본값 | 제약 | 설명 |
|------|------|--------|------|------|
| yfinance_industry | text | — | PK | yfinance `industry` 반환 문자열 (예: Semiconductor Manufacturing) |
| sector_id | int | — | not null, FK → sectors(id) | 매핑되는 GICS L4 섹터 ID |

**RLS 방향**
- SELECT: 모든 인증 사용자 공개 조회 가능
- INSERT / UPDATE / DELETE: service_role만 허용

---

### memos
사용자의 투자 일지 메모 본체. 0개 이상의 엔터티(종목·매매이벤트·뉴스·섹터)와 연결될 수 있다. 수정·삭제 가능한 주관적 기록으로 금융 이벤트의 무수정 원칙 적용 대상이 아니다. 메모 삭제 시 모든 연결 junction 행이 cascade 삭제된다.

| 컬럼 | 타입 | 기본값 | 제약 | 설명 |
|------|------|--------|------|------|
| id | uuid | gen_random_uuid() | PK | 기본 키 |
| user_id | uuid | — | FK → auth.users(id) ON DELETE CASCADE, not null | 사용자 ID |
| body | text | — | not null | 메모 본문 |
| created_at | timestamptz | now() | not null | 작성 일시 (달력 배치 기준) |
| updated_at | timestamptz | now() | not null | 수정 시각 |

**인덱스**
- `idx_memos_user_id_created_at` ON (user_id, created_at DESC) — 사용자별 최신순 메모 목록 조회 및 달력 날짜 범위 필터

**RLS 방향**
- SELECT: 본인(`auth.uid() = user_id`)만 조회 가능
- INSERT: 본인 user_id로만 삽입 가능 (`auth.uid() = user_id`)
- UPDATE: 본인 레코드만 수정 가능 (`auth.uid() = user_id`)
- DELETE: 본인 레코드만 삭제 가능 (`auth.uid() = user_id`)

---

### memo_stocks
메모-종목 N:M 연결 junction 테이블. 종목 연결 시 목표가(`goal_price`)를 함께 기록할 수 있다. 메모 삭제 시 cascade 삭제. 종목 삭제 시 cascade 삭제(메모 본체는 유지).

| 컬럼 | 타입 | 기본값 | 제약 | 설명 |
|------|------|--------|------|------|
| memo_id | uuid | — | PK (복합), FK → memos(id) ON DELETE CASCADE, not null | 메모 ID |
| stock_id | uuid | — | PK (복합), FK → stocks(id) ON DELETE CASCADE, not null | 종목 ID |
| goal_price | numeric | — | nullable, CHECK (goal_price IS NULL OR goal_price > 0) | 목표가 (해당 종목 원통화 기준, 표시 시 KRW 환산) |

**인덱스**
- `idx_memo_stocks_stock_id` ON (stock_id) — 종목별 연결 메모 역방향 조회

**RLS 방향**
- SELECT / INSERT / DELETE: memo_id를 통해 memos.user_id = auth.uid() 검증 (구현은 supabase-impl-agent)

---

### memo_trade_events
메모-매매이벤트 N:M 연결 junction 테이블. 매수/매도 이유 기록에 사용. 참조 대상은 `account_events.event_type IN ('buy', 'sell')`로 제한(앱 레이어 체크). 메모 삭제 시 cascade 삭제. 이벤트 삭제 시 cascade 삭제(메모 본체는 유지).

| 컬럼 | 타입 | 기본값 | 제약 | 설명 |
|------|------|--------|------|------|
| memo_id | uuid | — | PK (복합), FK → memos(id) ON DELETE CASCADE, not null | 메모 ID |
| event_id | uuid | — | PK (복합), FK → account_events(id) ON DELETE CASCADE, not null | 계정 이벤트 ID (buy/sell만) |

**인덱스**
- `idx_memo_trade_events_event_id` ON (event_id) — 이벤트별 연결 메모 역방향 조회

**RLS 방향**
- SELECT / INSERT / DELETE: memo_id를 통해 memos.user_id = auth.uid() 검증 (구현은 supabase-impl-agent)

---

### memo_news
메모-뉴스 N:M 연결 junction 테이블. 뉴스 스크랩 메모에 사용. 메모 삭제 시 cascade 삭제. 뉴스 삭제 시 cascade 삭제(메모 본체는 유지).

| 컬럼 | 타입 | 기본값 | 제약 | 설명 |
|------|------|--------|------|------|
| memo_id | uuid | — | PK (복합), FK → memos(id) ON DELETE CASCADE, not null | 메모 ID |
| news_id | uuid | — | PK (복합), FK → news(id) ON DELETE CASCADE, not null | 뉴스 ID |

**인덱스**
- `idx_memo_news_news_id` ON (news_id) — 뉴스별 연결 메모 역방향 조회

**RLS 방향**
- SELECT / INSERT / DELETE: memo_id를 통해 memos.user_id = auth.uid() 검증 (구현은 supabase-impl-agent)

---

### memo_sectors
메모-섹터 N:M 연결 junction 테이블. 섹터(테마) 기반 메모에 사용. 메모 삭제 시 cascade 삭제. 섹터 삭제 시 cascade 삭제(메모 본체는 유지).

| 컬럼 | 타입 | 기본값 | 제약 | 설명 |
|------|------|--------|------|------|
| memo_id | uuid | — | PK (복합), FK → memos(id) ON DELETE CASCADE, not null | 메모 ID |
| sector_id | int | — | PK (복합), FK → sectors(id) ON DELETE CASCADE, not null | 섹터 ID |

**인덱스**
- `idx_memo_sectors_sector_id` ON (sector_id) — 섹터별 연결 메모 역방향 조회

**RLS 방향**
- SELECT / INSERT / DELETE: memo_id를 통해 memos.user_id = auth.uid() 검증 (구현은 supabase-impl-agent)

---

### auth.identities (참조 전용 — Supabase 자동 관리)
Supabase Auth가 자동 관리하는 인증 제공자 연동 정보. 앱에서 직접 DDL을 작성하거나 수정하지 않는다. 동일 User에 email / google / apple 등 여러 provider가 연결될 수 있으며, 동일 이메일이면 Supabase 자동 링킹으로 하나의 `auth.users` 레코드에 병합된다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid | 기본 키 (Supabase 생성) |
| user_id | uuid | FK → auth.users(id) |
| provider | text | 인증 제공자 식별자 (email / google / apple) |
| identity_data | jsonb | provider별 사용자 정보 (email, name, sub 등) |
| created_at | timestamptz | 연동 시각 |

**관리 주체**
- Supabase Auth 전용. 앱 마이그레이션 파일에 DDL 작성 불필요.
- 읽기 접근: `auth.uid()`를 통해 자신의 identity만 조회 가능 (Supabase 기본 정책).

---

## ERD (텍스트)

```
auth.users ||--|| profiles : "1:1 (user_id FK)"
auth.users ||--o{ auth.identities : "1:N (user_id FK) — Supabase 관리"
auth.users ||--o{ account_events : "1:N (user_id FK)"
auth.users ||--o{ daily_snapshots : "1:N (user_id FK)"
auth.users ||--o{ memos : "1:N (user_id FK)"
account_events }o--o| prices : "N:1 (ticker + asset_type + event_date → prices)"
corporate_actions }o--o| prices : "N:1 (ticker + asset_type + effective_date → prices)"
stocks }o--o| sectors : "N:1 (sector_id FK, 목표: L4)"
sectors }o--o| sectors : "자기참조 N:1 (parent_id FK, L1 parent_id=null)"
gics_yfinance_map }o--|| sectors : "N:1 (sector_id FK → GICS L4)"
memos ||--o{ memo_stocks : "1:N (memo_id FK, cascade)"
memos ||--o{ memo_trade_events : "1:N (memo_id FK, cascade)"
memos ||--o{ memo_news : "1:N (memo_id FK, cascade)"
memos ||--o{ memo_sectors : "1:N (memo_id FK, cascade)"
memo_stocks }o--|| stocks : "N:1 (stock_id FK, cascade)"
memo_trade_events }o--|| account_events : "N:1 (event_id FK, cascade)"
memo_sectors }o--|| sectors : "N:1 (sector_id FK, cascade)"
```

## 변경 이력

| 이슈 | 변경 내용 |
|------|----------|
| [001] 사용자 인증 | profiles 테이블 추가. auth.users는 Supabase Auth 관리. |
| [002] 이메일 인증 플로우 | DB 스키마 변경 없음. 재발송 쿨다운은 클라이언트 state로 관리. |
| [003] 메인 대시보드 | trade_events, cash_balances 테이블 추가. ERD 관계 2개 추가. |
| [004] 대시보드 기획 수정 (00b3fb9) | trade_events → account_events로 대체 (5종 이벤트 통합, nullable 필드, fx_rate_at_event/source/external_ref 추가). cash_balances 제거 (account_events 누적 계산으로 대체). daily_snapshots 테이블 추가. corporate_actions 테이블 추가. prices 테이블 추가. fx_rates 테이블 추가. ERD 관계 업데이트. |
| [005] 소셜 로그인 추가 (7ab2e6f) | auth.identities 참조 섹션 추가 (Supabase 자동 관리, DDL 불필요). profiles 테이블 설명 보강 (소셜 로그인 시 생성 조건 및 닉네임 자동 설정 로직). ERD에 auth.users → auth.identities 관계 추가. |
| [006] 메모/투자 일지 (7b4d051) | sectors 테이블 추가 (GICS 11 + 가상자산 12개 고정 시드). stocks 테이블 추가 (sector_id FK 포함, ticker+asset_type unique). kr_sector_map 테이블 추가 (네이버 업종 → GICS 매핑 시드). memos 테이블 추가. memo_stocks junction 테이블 추가 (goal_price 포함). memo_trade_events junction 테이블 추가. memo_news junction 테이블 추가. memo_sectors junction 테이블 추가. ERD 관계 9건 추가. |
| [006] 종목 검색 기능 (78dfc50) | stocks 테이블 수정: `asset_type` 컬럼 제거, `market`(KR/US/CRYPTO) · `currency` · `is_active` 컬럼 추가. UNIQUE 제약 `(ticker, asset_type)` → `(ticker, market)` 변경. 인덱스 `idx_stocks_ticker_asset_type` → `idx_stocks_ticker_market` 변경, `idx_stocks_name` 추가. RLS 쓰기 정책 변경: 본인 직접 허용 → service_role 전용 (FastAPI 서버 경유 upsert). |
| [006] 메모 필터 기능 수정 (11f2f4c) | DB 스키마 변경 없음. 필터 UX 동작 규칙 변경(필터 항목명 "매매이벤트 연관" → "매매 연관", 종목 필터 "직접 연결만 보기" 토글 제거, 같은 타입 내 OR · 타입 간 AND 결합 명확화, "연결 없음" 필터의 다른 필터와 상호 배타적 동작)은 앱 레이어에만 영향. |
| [006] 메모 필터 UI 수정 (6aab87b) | DB 스키마 변경 없음. 필터 UI 레이아웃 변경(단일 목록 → 세 줄 구조: 토글 행 / 종목 행 / 섹터 행, "연결 없음"의 토글 행 이동, 결합 규칙 표현 변경)은 앱 레이어에만 영향. |
| [007] 종목 분류 GICS 계층화 (b892f6d) | sectors 테이블 전면 개편: `id` int → serial(시퀀스 시작값 13 이상), `name_en`/`parent_id`/`level`/`created_at` 컬럼 추가, GICS 4단계(L1~L4) 자기참조 계층 구조 도입, 인덱스 `idx_sectors_parent_id`·`idx_sectors_level` 추가. stocks 테이블: `sector_id` 의미 변경(L1 고정 → 가능한 한 L4 Sub-Industry, 매핑 실패 시 최하위 레벨). kr_sector_map 테이블 폐기(DROP). gics_yfinance_map 테이블 신규 추가(yfinance industry 문자열 → GICS L4 sector_id 매핑). ERD 관계 업데이트: kr_sector_map 제거, sectors 자기참조·gics_yfinance_map 추가. |
