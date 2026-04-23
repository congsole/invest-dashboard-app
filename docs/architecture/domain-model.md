# Domain Model

*최종 업데이트: 1dc2688 — 2026-04-23*

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

### TradeEvent
사용자의 매매 이벤트 (매수/매도) 기록. 한국 주식, 미국 주식, 코인을 통합 관리한다. 평단가 계산의 원천 데이터이며 누적 투입 원금·수수료·세금 차트의 기초가 된다.

**평단가 계산 규칙**: 매수 이벤트 기준 가중평균. 매도 시 평균매수가 불변. 전량 매도 후 재매수 시 새로 계산.

| 속성 | 타입 | 설명 | 제약 |
|------|------|------|------|
| id | uuid | 기본 키 | PK, not null |
| user_id | uuid | 사용자 ID | FK → auth.users(id), not null |
| asset_type | enum | 자산 유형 (korean_stock / us_stock / crypto) | not null |
| trade_type | enum | 매매 유형 (buy / sell) | not null |
| ticker | text | 종목 코드 또는 코인 티커 (예: 005930, AAPL, BTC) | not null |
| name | text | 종목명 | not null |
| trade_date | date | 체결 날짜 | not null |
| quantity | numeric | 수량 | not null |
| price_per_unit | numeric | 체결가 (1주당) | not null |
| currency | text | 거래 통화 (KRW / USD / 코인티커) | not null |
| fee | numeric | 수수료 | not null, default 0 |
| fee_currency | text | 수수료 통화 (기본 KRW, 코인은 해당 티커) | not null |
| tax | numeric | 세금 | not null, default 0 |
| settlement_amount | numeric | 정산금액 (실제 입출금액, 자동 계산 또는 수동 수정) | not null |
| created_at | timestamptz | 생성 시각 | not null |

### CashBalance
예수금 스냅샷. 매매 이벤트 정산금액 누계로 자동 계산하거나, 사용자가 직접 입력하여 기록한다. 누적 총 자산 계산 시 현금 부분으로 포함된다.

| 속성 | 타입 | 설명 | 제약 |
|------|------|------|------|
| id | uuid | 기본 키 | PK, not null |
| user_id | uuid | 사용자 ID | FK → auth.users(id), not null |
| balance | numeric | 잔고 | not null |
| currency | text | 통화 (KRW / USD) | not null |
| recorded_at | timestamptz | 기록 시점 | not null |

## 관계

| 관계 | 설명 |
|------|------|
| User 1:1 Profile | 한 사용자는 하나의 프로필을 가진다. 회원가입 시 자동 생성. |
| User 1:N TradeEvent | 한 사용자는 여러 매매 이벤트를 가진다. |
| User 1:N CashBalance | 한 사용자는 여러 예수금 스냅샷을 가진다. |

## 변경 이력

| 이슈 | 변경 내용 |
|------|----------|
| [001] 사용자 인증 | User, Profile 엔터티 추가. Session은 Supabase Auth 위임으로 별도 엔터티 없음. |
| [002] 이메일 인증 플로우 | 기존 엔터티 변경 없음. 프로필 저장 시점 명확화: 이메일 인증 완료(`SIGNED_IN` 이벤트) 후 저장. 닉네임은 회원가입~인증 완료 사이 메모리(state)에 임시 보관. |
| [003] 메인 대시보드 | TradeEvent, CashBalance 엔터티 추가. 관계 User 1:N TradeEvent, User 1:N CashBalance 추가. |
