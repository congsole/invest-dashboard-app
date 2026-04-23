# [003] 매매 이벤트 & 예수금 DB 마이그레이션 + 기본 CRUD

<!-- PM-agent 작성 -->
## 개요
대시보드의 핵심 데이터 계층을 구축한다. `trade_events`(매매 이벤트)와 `cash_balances`(예수금 스냅샷) 테이블을 생성하고, RLS 정책을 적용하며, 기본 CRUD 서비스 함수를 구현한다. 이슈 004(집계/외부 API), 005(대시보드 FE), 006(입력 FE)의 선행 작업이다.

## 참조 문서
- 커밋: 1dc2688b212ac64016716fa5c16fccde05a12876 — [Docs] 메인 화면(대시보드) 초기 기획 및 디자인
- 기획서: docs/planning/PRD-002-dashboard.md
- 디자인: docs/design/DESIGN.md

## docs 변경 내역

다음 명령으로 설계 에이전트들이 방금 업데이트한 내역을 파악한다:
```bash
git diff HEAD docs/architecture/domain-model.md
git diff HEAD docs/architecture/db-schema.md
git diff HEAD docs/api/api-spec.md
```
(아직 커밋되지 않은 변경 사항이므로 `HEAD` 기준 diff 사용)

### domain-model.md
- [추가] `TradeEvent` 엔터티 — asset_type (korean_stock/us_stock/crypto), trade_type (buy/sell), ticker, name, trade_date, quantity, price_per_unit, currency, fee, fee_currency, tax, settlement_amount 속성
- [추가] `CashBalance` 엔터티 — balance, currency, recorded_at 속성
- [추가] 관계: User 1:N TradeEvent, User 1:N CashBalance

### db-schema.md
- [추가] `trade_events` 테이블 — user_id FK, asset_type/trade_type CHECK 제약, 인덱스 4개, RLS 정책
- [추가] `cash_balances` 테이블 — user_id FK, currency CHECK (KRW/USD), 인덱스 2개, RLS 정책

### api-spec.md
- [추가] TradeEvent CRUD — 목록조회, 등록, 수정, 삭제 (4개 엔드포인트)
- [추가] CashBalance — 목록조회, 등록 (2개 엔드포인트)

<!-- 구현 단계에서 업데이트 -->
## 구현 현황
- [ ] Supabase 구현
- [ ] 백엔드 테스트
- [ ] 프론트엔드 구현
- [ ] E2E 테스트
