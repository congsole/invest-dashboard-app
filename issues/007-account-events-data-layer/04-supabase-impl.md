# Supabase 구현 내역

## 마이그레이션

### `app/supabase/migrations/20260427000000_account_events_data_layer.sql`
- 기존 `trade_events`, `cash_balances` 테이블 제거
- 기존 RPC 함수 제거 (`get_portfolio_summary`, `get_asset_history`, `get_sector_allocation`)
- `account_events` 테이블 생성: 5종 이벤트(buy/sell/deposit/withdraw/dividend) 단일 테이블 관리. nullable 필드, external_ref 기반 중복 검출용 인덱스 포함
- `daily_snapshots` 테이블 생성: UNIQUE(user_id, snapshot_date) 제약, 자산 스냅샷 저장
- `corporate_actions` 테이블 생성: 분할/무상증자/합병 등 기업 액션. SELECT 공개, INSERT/UPDATE/DELETE는 service_role 전용
- `prices` 테이블 생성: (ticker, asset_type, date) 복합 PK. service_role 전용 쓰기
- `fx_rates` 테이블 생성: date PK. service_role 전용 쓰기
- 각 테이블 RLS 활성화 및 정책 설정

### `app/supabase/migrations/20260427000001_account_events_rpc.sql`
- `get_kpi_summary(p_asset_type, p_current_prices, p_fx_rate_usd)` DB Function:
  - 원금(입금-출금 KRW 환산 누적), 예수금(KRW/USD), 누적 배당/수수료/세금 집계
  - 종목별 보유수량·평균매수가 재귀 CTE 계산 (corporate_actions ratio 반영)
  - 현재가 파라미터 기반 총 평가액·순수익·수익률 산출
  - jsonb 단일 행 반환
- `get_history_markers(p_from, p_to)` DB Function:
  - 기간 내 배당/출금 이벤트 KRW 환산 목록 반환
  - fx_rates 테이블 조회 후 fallback(1300) 사용

## Edge Functions

### `app/supabase/functions/parse-account-csv/`
기존 `parse-trade-csv` 대체. 5종 이벤트 파싱 지원:
- event_type별 필수/선택 필드 검증 (buy/sell은 ticker/name/quantity/price_per_unit 필수)
- SHA-256 기반 external_ref 해시 자동 생성 (행 번호 + 컬럼값 결합)
- DB에 저장하지 않고 preview 배열 반환

### `app/supabase/functions/confirm-account-csv/`
기존 `confirm-trade-csv` 대체. external_ref 기반 중복 방지:
- `account_events` 테이블에서 기존 external_ref 조회 → skipped 카운트 반환
- `inserted` / `skipped` / `failed` 3종 카운트 응답 (기존은 inserted/failed 2종)

### `app/supabase/functions/cron-collect-fx-rates/`
신규. 매일 KST 00:01 실행:
- ExchangeRate-API에서 USD/KRW 환율 수집
- `fx_rates` 테이블에 upsert (date 기준 중복 시 업데이트)

### `app/supabase/functions/cron-collect-prices/`
신규. 매일 KST 16:30(한국주식) / 익일 07:00(미국주식) / 00:05(코인) 실행:
- `account_events`에서 순매수 > 0인 보유 종목 추출
- 이미 오늘 수집된 종목 제외(skipped)
- Twelve Data(주식) / CoinGecko(코인) API로 일별 종가 수집
- `prices` 테이블에 upsert

### `app/supabase/functions/cron-create-snapshots/`
신규. 매일 KST 00:05 실행:
- `account_events`에 이벤트가 있는 모든 사용자 처리
- `fx_rates` 테이블에서 당일 환율 조회 (없으면 가장 최근 날짜, fallback 1300)
- `prices` 테이블에서 오늘 종가 맵 로드 후 종목 평가액 계산
- principal_krw / cash_krw / cash_usd / total_value_krw / net_profit_krw 산출
- `daily_snapshots` 테이블에 upsert

## 클라이언트 서비스 함수

### `app/services/accountEvents.ts` (기존 tradeEvents.ts 대체)
- `getAccountEvents(filters?)` — event_type/asset_type/ticker/from/to 필터 조회
- `createAccountEvent(input)` — 단건 등록 (source: 'manual')
- `updateAccountEvent(id, input)` — 부분 업데이트. `AccountEventUpdateInput` 타입 사용
- `deleteAccountEvent(id)` — 삭제
- `parseAccountCsv(file, broker?)` — parse-account-csv Edge Function 호출
- `confirmAccountCsv(events)` — confirm-account-csv Edge Function 호출

### `app/services/dashboard.ts` (전면 교체)
- `getKpiSummary(assetType, currentPrices, fxRateUsd)` — get_kpi_summary RPC 호출
- `getDailySnapshots(from, to)` — daily_snapshots REST 조회
- `getHistoryMarkers(from, to)` — get_history_markers RPC 호출
- `periodToDateRange(period)` — period('week'|'month'|'year'|'all') → {from, to} 변환 유틸
- 레거시 함수 deprecated stub 유지 (하위 호환)

### `app/services/dailySnapshots.ts` (신규)
- `getDailySnapshots(from, to)` — 기간 필터 스냅샷 조회
- `getLatestSnapshot()` — 가장 최근 스냅샷 단건 조회

### `app/services/corporateActions.ts` (신규)
- `getCorporateActions(filters)` — ticker/asset_type/from 필터로 기업 액션 목록 조회

## 특이사항

- `get_kpi_summary`는 `jsonb` 단일 행을 반환한다. Supabase RPC는 `.rpc()` 호출 결과가 단일 객체일 때 `data`가 바로 해당 객체이므로 클라이언트에서 별도 캐스팅 없이 `data as KpiSummary` 사용.
- corporate_actions의 INSERT/UPDATE/DELETE에 RLS 정책을 추가하지 않았다. RLS 활성화 상태에서 정책이 없으면 기본 deny이므로 service_role로만 가능.
- prices, fx_rates도 동일하게 쓰기 정책 없이 RLS만 활성화하여 service_role 전용 쓰기를 구현.
- cron Edge Function들은 service_role 키로 Supabase 클라이언트를 초기화하므로 RLS를 우회하여 모든 사용자 데이터에 접근 가능.
- `get_kpi_summary`의 corporate_actions 반영은 분할(split) 및 무상증자(dividend_stock)만 exp(sum(ln(ratio))) 방식으로 누적 적용한다. reverse_split, merger는 ratio를 직접 곱하면 부정확할 수 있어 향후 별도 처리 필요.
- cron-collect-prices에서 Twelve Data의 `/eod` 엔드포인트를 사용하여 당일 종가를 수집한다. 장중에는 전일 종가가 반환될 수 있으므로 장 마감 후 실행 스케줄 준수 필요.
