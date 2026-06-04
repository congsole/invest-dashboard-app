# Supabase 구현 내역

## 추가 BE 작업 없음

이슈 013은 UI 컴포넌트 구현 이슈로, 이슈 012(종목 검색 — 데이터/API 레이어)에서 필요한 BE 작업이 모두 완료되었다.

## 이슈 012에서 이미 구현된 항목

### 마이그레이션
- `app/supabase/migrations/20260602000002_stock_search_data_layer.sql`
  - `stocks` 테이블: `asset_type` → `market`/`currency`/`is_active` 컬럼 변경
  - UNIQUE 제약: `uq_stocks_ticker_market`
  - 인덱스: `idx_stocks_ticker_market`, `idx_stocks_name`
  - RLS: 읽기 전체 허용, 쓰기 service_role 전용
  - DB Function: `get_or_recommend_stock_sector`

### 클라이언트 서비스 함수 (`app/services/stocks.ts`)
- `searchStocksLocal(params)` — 로컬 종목 검색 (이슈 013 UI의 1차 검색)
- `searchStocksExternal(params)` — FastAPI 외부 검색 (이슈 013 UI의 2차 검색)
- `searchStocks(params)` — 통합 검색 (로컬 우선, 결과 0건 시 외부 자동 전환)
- `getStock(ticker, market)` — 종목 단건 조회
- `getOrRecommendStockSector(input)` — 섹터 자동 추천 RPC (종목 선택 후 섹터 null 시 사용)
- `updateStockSector(params)` — 종목 섹터 수동 지정 (FastAPI 경유)

### 타입 정의 (`app/types/sector.ts`)
- `StockMarket` — `'KR' | 'US' | 'CRYPTO'`
- `Stock` — `market`/`currency`/`is_active` 포함
- `StockSearchResult` — 로컬 검색 응답 타입
- `GetOrRecommendStockSectorResult` — RPC 응답 타입
- `ExternalStockSearchResult`, `ExternalStockSearchResponse` — FastAPI 응답 타입

## 사전 의존성 체크리스트

이슈 012에서 이어받은 미해결 항목:

- [ ] `EXPO_PUBLIC_FASTAPI_BASE_URL` 환경변수 설정 — `.env` 파일 또는 EAS Secrets — 검증: `searchStocksExternal` 호출 시 오류 없이 응답 수신 여부 (수동 확인 필요)
- [ ] FastAPI 서버 `GET /stocks/search` 엔드포인트 구현 — FastAPI 서버 — 검증: smoke test로 HTTP 200 응답 확인 (수동 확인 필요)
- [ ] FastAPI 서버 `PATCH /stocks/{id}/sector` 엔드포인트 구현 — FastAPI 서버 — 검증: 수동 확인 필요

## 특이사항

이슈 013 UI 컴포넌트에서 호출할 서비스 함수:
- 검색어 입력(2자 이상, debounce 300ms) → `searchStocks()` 또는 `searchStocksLocal()` 직접 호출
- 외부 검색 결과 선택(신규 종목) → FastAPI upsert 후 `getOrRecommendStockSector()` 호출로 섹터 추천 수신
- 섹터 null인 경우 → 섹터 선택 드롭다운 노출, 사용자 선택 후 `updateStockSector()` 호출

frontend-impl-agent가 위 함수들을 그대로 사용하면 된다.
