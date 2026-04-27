# [007] AccountEvents 데이터 레이어 구축 (DB 마이그레이션 + RPC + Edge Functions)

<!-- PM-agent 작성 -->
## 개요

기존 `trade_events` / `cash_balances` 기반 구현(이슈 003, 004)을 `account_events` 중심 아키텍처로 전면 교체한다.
5종 이벤트(매수/매도/입금/출금/배당)를 단일 테이블로 관리하고, 일별 자산 스냅샷 자동 기록(cron), 종가·환율 수집(cron), 기업 액션 관리, KPI 집계 RPC, 히스토리 마커 RPC를 구축한다.

변경 범위가 크고 외부 API 연동(Twelve Data 종가 수집, ExchangeRate-API 환율 수집)이 포함되어 있으므로 BE 단독 이슈로 분리한다. 이슈 008(FE)이 이 이슈에 선행 의존한다.

**포함 작업**
- DB 마이그레이션: `trade_events` → `account_events` 대체, `cash_balances` 제거, `daily_snapshots` / `corporate_actions` / `prices` / `fx_rates` 신규 테이블 생성
- RLS 정책 업데이트
- DB Function(RPC): `get_kpi_summary`, `get_history_markers`
- Edge Function 교체: `parse-account-csv`, `confirm-account-csv` (기존 `parse-trade-csv`, `confirm-trade-csv` 대체)
- Edge Function 신규: `cron-collect-prices`, `cron-create-snapshots`, `cron-collect-fx-rates`
- 서비스 레이어 업데이트: `app/services/` 내 account_events / dashboard / market 서비스 함수

## 참조 문서
- 커밋: 00b3fb914fe93fc6fb1fa0ea210865b40009ac28 — [Docs] 대시보드 기획 수정
- 기획서: docs/planning/PRD-002-dashboard.md

## docs 변경 내역

다음 명령으로 설계 에이전트들이 방금 업데이트한 내역을 파악한다:
```bash
git diff HEAD docs/architecture/domain-model.md
git diff HEAD docs/architecture/db-schema.md
git diff HEAD docs/api/api-spec.md
```
(아직 커밋되지 않은 변경 사항이므로 `HEAD` 기준 diff 사용)

변경된 내용을 요약하여 아래 형식으로 채운다:

### domain-model.md
- [수정] TradeEvent → AccountEvent — 5종 이벤트(buy/sell/deposit/withdraw/dividend) 통합. nullable 필드(asset_type/ticker/name/quantity/price_per_unit) 추가, `settlement_amount` → `amount` 개명, `fx_rate_at_event`/`source`/`external_ref` 필드 추가
- [삭제] CashBalance — account_events 누적 계산으로 대체
- [추가] DailySnapshot — 매일 cron으로 기록하는 자산 스냅샷 (total_value_krw / principal_krw / cash_krw / cash_usd / net_profit_krw / fx_rate_usd)
- [추가] CorporateAction — 주식 분할·무상증자·합병 등 기업 액션 기록 (ticker/asset_type/action_type/effective_date/ratio/metadata)
- [추가] Price — 일별 종가 캐시 (ticker+asset_type+date 복합 PK)
- [추가] FxRate — 일별 USD/KRW 환율 캐시
- [추가] 계산 규칙 섹션 — 원금/예수금/총 평가액/순수익/수익률/보유수량/평균매수가/환율 처리 정책

### db-schema.md
- [수정] trade_events → account_events — 컬럼 전면 개편 (event_type enum 5종, event_date, nullable 필드 다수, amount, fx_rate_at_event, source, external_ref), 인덱스 5개 (external_ref 인덱스 추가)
- [삭제] cash_balances — 테이블 제거
- [추가] daily_snapshots — 자산 스냅샷 테이블 (UNIQUE: user_id+snapshot_date). cron이 service_role로 INSERT.
- [추가] corporate_actions — 기업 액션 테이블. SELECT 공개, INSERT/UPDATE/DELETE는 service_role 전용
- [추가] prices — 일별 종가 캐시 테이블. (ticker, asset_type, date) 복합 PK. service_role 전용 쓰기
- [추가] fx_rates — 일별 환율 캐시 테이블. date PK. service_role 전용 쓰기
- [수정] ERD 관계 업데이트 — auth.users ↔ account_events, auth.users ↔ daily_snapshots, account_events/corporate_actions ↔ prices

### api-spec.md
- [수정] TradeEvent → AccountEvent 도메인 — 목록조회/등록/수정/삭제 API 전면 개편 (event_type 필터 추가, 필드 구조 변경)
- [삭제] CashBalance 도메인 — 예수금 목록 조회 / 스냅샷 등록 API 제거
- [수정] CSV Edge Function — `parse-trade-csv` → `parse-account-csv`, `confirm-trade-csv` → `confirm-account-csv`. 5종 이벤트 파싱 지원, external_ref 기반 중복 방지 (skipped 필드 추가)
- [수정] Dashboard — 포트폴리오 요약 → `get_kpi_summary` RPC (총 평가액/원금/순수익/수익률/예수금 통화별/누적 배당·수수료·세금 + holdings). 자산 히스토리 → daily_snapshots REST + `get_history_markers` RPC로 분리. "전체" 기간 추가.
- [삭제] Dashboard 부문별 비중 파이 차트 API — 제거
- [추가] DailySnapshot 도메인 — 스냅샷 목록 조회 API
- [추가] CorporateAction 도메인 — 목록 조회 / 관리자 등록 API
- [추가] Market 도메인 cron 3종 — `cron-collect-prices` (일별 종가 수집), `cron-create-snapshots` (일별 스냅샷 생성), `cron-collect-fx-rates` (환율 수집)

<!-- 구현 단계에서 업데이트 -->
## 구현 현황
- [x] Supabase 구현
- [x] 백엔드 테스트
- [ ] 프론트��드 구현 (BE 전담 이슈 — 해당 없음)
- [ ] E2E 테스트 (수동 트리거)
