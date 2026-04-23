# Supabase 구현 내역

## 마이그레이션

- `app/supabase/migrations/20260423000001_dashboard_functions.sql`
  - `drop function if exists` 3개 (기존 시그니처가 다를 경우 대비)
  - `get_portfolio_summary(p_asset_type text DEFAULT NULL)` — plpgsql, SECURITY DEFINER
  - `get_asset_history(p_period text, p_asset_type text DEFAULT NULL)` — plpgsql, SECURITY DEFINER
  - `get_sector_allocation()` — plpgsql, SECURITY DEFINER
  - `supabase db push` 적용 완료 (NOTICE: 기존 함수 없음, 정상)

## Edge Functions

- `app/supabase/functions/parse-trade-csv/index.ts`
  - multipart/form-data에서 CSV 파일 수신
  - RFC 4180 호환 CSV 파싱 (쌍따옴표 이스케이프 처리)
  - 헤더 자동 감지, 필수 컬럼 누락 시 400 반환
  - 10MB 파일 크기 제한
  - DB 저장 없이 preview 배열 + errors 배열 반환

- `app/supabase/functions/confirm-trade-csv/index.ts`
  - `{ events: TradeEventInput[] }` 요청 수신
  - 행별 유효성 검사 후 실패 행은 failed 배열에 기록
  - 유효한 행을 trade_events 테이블에 일괄 insert
  - `{ inserted: number, failed: FailedRow[] }` 반환

- `app/supabase/functions/get-market-prices/index.ts`
  - 한국주식·미국주식: Twelve Data API (복수 ticker 동시 조회)
  - 코인: CoinGecko API (주요 ticker→coinId 매핑 내장)
  - 메모리 캐시 TTL 1분, 외부 API 실패 시 만료 캐시로 대체
  - 환경변수: `TWELVE_DATA_API_KEY`, `COINGECKO_API_KEY`

- `app/supabase/functions/get-exchange-rate/index.ts`
  - ExchangeRate-API v6 호출 (`/pair/{from}/{to}` 엔드포인트)
  - 메모리 캐시 TTL 1시간, 외부 API 실패 시 만료 캐시로 대체
  - 지원 통화: USD, KRW, EUR, JPY, GBP
  - 환경변수: `EXCHANGE_RATE_API_KEY`

## 클라이언트 유틸

- `app/services/dashboard.ts` — stub 코드를 실제 Supabase 호출로 전면 교체
  - `getDashboardPortfolioSummary(assetType?)` → `supabase.rpc('get_portfolio_summary', ...)`
  - `getAssetHistory(period, assetType?)` → `supabase.rpc('get_asset_history', ...)`
  - `getSectorAllocation()` → `supabase.rpc('get_sector_allocation')`
  - `getMarketPrices(tickers)` → `supabase.functions.invoke('get-market-prices', ...)`
  - `getExchangeRate(from, to)` → `supabase.functions.invoke('get-exchange-rate', ...)`

- `app/services/market.ts` (신규) — Market 도메인 전용 서비스 파일
  - `getMarketPrices(tickers)` → `supabase.functions.invoke('get-market-prices', ...)`
  - `getExchangeRate(from, to)` → `supabase.functions.invoke('get-exchange-rate', ...)`

- `app/services/tradeEvents.ts` — CSV Edge Function 호출은 이미 구현되어 있었음 (변경 없음)

## 특이사항

### get_portfolio_summary — 재귀 CTE 평단가 계산
평단가 가중평균을 PostgreSQL에서 계산하기 위해 재귀 CTE를 사용했다. 이벤트를 (ticker, trade_date, created_at) 순으로 처리하며:
- 매수: `(기존 수량 × 기존 평단가 + 매수 수량 × 매수가) / (기존 수량 + 매수 수량)`
- 매도: 평단가 불변
- 전량 매도 후 재매수 (기존 cum_quantity = 0): 새 매수가로 초기화

### 기존 함수 충돌 처리
`supabase db push` 시 기존 함수의 반환 타입이 달라 `create or replace`가 실패했다. 마이그레이션 앞에 `drop function if exists`를 추가하여 해결했다.

### Edge Function 캐시 전략
메모리 캐시는 Edge Function 인스턴스 수명 내에서만 유효하다 (cold start 시 초기화). DB 캐시(별도 테이블)는 이번 이슈 범위에서 제외했으며, 현재가 1분/환율 1시간 메모리 캐시로 충분하다고 판단했다.

### 환경변수 설정 필요
배포 전 Supabase 대시보드 또는 CLI로 다음 Secret을 설정해야 한다:
- `TWELVE_DATA_API_KEY`
- `COINGECKO_API_KEY`
- `EXCHANGE_RATE_API_KEY`
