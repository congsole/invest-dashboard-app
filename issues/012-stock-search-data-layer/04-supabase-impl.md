# Supabase 구현 내역

## 마이그레이션

- `app/supabase/migrations/20260602000002_stock_search_data_layer.sql`

### 주요 변경 내용

1. **컬럼 변경**: `stocks.asset_type` 제거 → `market`(KR/US/CRYPTO), `currency`, `is_active` 추가
2. **UNIQUE 제약 변경**: `uq_stocks_ticker_asset_type` → `uq_stocks_ticker_market`
3. **인덱스 변경**: `idx_stocks_ticker_asset_type` 삭제, `idx_stocks_ticker_market` + `idx_stocks_name` 신규 추가
4. **RLS 쓰기 정책 제거**: `stocks_insert_authenticated`, `stocks_update_authenticated` 삭제 → service_role 전용
5. **DB Function 추가**: `get_or_recommend_stock_sector` (기존 `upsert_stock_with_sector` 대체)

## Edge Functions

해당 없음 (로컬 검색은 REST, 외부 검색은 FastAPI 서버 경유)

## 클라이언트 유틸

### `app/services/stocks.ts` (전면 재작성)

- `searchStocksLocal(params)` — stocks 테이블 ilike 검색 (ticker/name). market 필터 지원. is_active=true 필터 적용.
- `getStock(ticker, market)` — ticker + market 조합 단건 조회 (asset_type → market으로 변경)
- `getOrRecommendStockSector(input)` — `get_or_recommend_stock_sector` RPC 호출. 섹터 자동 추천.
- `searchStocksExternal(params)` — FastAPI `/stocks/search` 호출. Supabase JWT를 Authorization 헤더에 포함.
- `searchStocks(params)` — 통합 검색. 로컬 우선, 결과 없으면 외부 검색으로 자동 전환.
- `updateStockSector(params)` — FastAPI `PATCH /stocks/{id}/sector` 경유 (service_role 전용이므로 직접 호출 불가)

### `app/services/memo.ts` (일부 수정)

- `getStock(ticker, market)` — `asset_type` 파라미터를 `market`('KR'/'US'/'CRYPTO')으로 변경
- `searchStocks(query)` — `is_active=true` 필터 추가
- `getMemo(memoId)` — select 쿼리에서 `stocks(asset_type)` → `stocks(market, currency, is_active)` 변경
- `getOrRecommendStockSector(input)` — `get_or_recommend_stock_sector` RPC 호출 함수 추가 (기존 `upsertStockWithSector` 대체)

### `app/types/sector.ts` (업데이트)

- `StockMarket` 타입 신규 추가 (`'KR' | 'US' | 'CRYPTO'`)
- `StockAssetType` deprecated 표시 유지 (account_events 등 별도 테이블에서 계속 사용)
- `Stock` 인터페이스: `asset_type` 제거, `market`/`currency`/`is_active` 추가
- `StockSearchResult` 인터페이스 신규 추가 (로컬 검색 응답)
- `GetOrRecommendStockSectorResult` 인터페이스 신규 추가 (RPC 응답)
- `UpsertStockResult` — `GetOrRecommendStockSectorResult`의 alias로 유지 (하위 호환)
- `ExternalStockSearchResult`, `ExternalStockSearchResponse` 인터페이스 신규 추가 (FastAPI 응답)

### `app/types/memo.ts` (업데이트)

- `Stock` 인터페이스: `asset_type` 제거, `market`/`currency`/`is_active` 추가
- `MemoStock` 인터페이스: `asset_type` 제거, `market` 추가
- `MemoDetail.memo_stocks[].stocks`: `asset_type` 제거, `market`/`currency`/`is_active` 추가

## 사전 의존성 체크리스트

- [ ] `EXPO_PUBLIC_FASTAPI_BASE_URL` 환경변수 설정 — `.env` 파일 또는 EAS Secrets — 검증 방법: `searchStocksExternal` 호출 시 오류 없이 응답 수신 여부 확인 (수동 확인 필요)
- [ ] FastAPI 서버 `/stocks/search` 엔드포인트 구현 — FastAPI 서버 — 검증 방법: smoke test로 HTTP 200 응답 확인 (수동 확인 필요)
- [ ] FastAPI 서버 `PATCH /stocks/{id}/sector` 엔드포인트 구현 — FastAPI 서버 — 검증 방법: 수동 확인 필요

## 특이사항

1. **마이그레이션 순서 주의**: `asset_type` 컬럼 제거 전 기존 데이터가 있으면 `market` 컬럼에 데이터를 먼저 채워야 한다. 현재 마이그레이션은 빈 테이블 기준으로 작성됨. 데이터가 있는 환경에서는 `UPDATE stocks SET market = CASE WHEN asset_type = 'korean_stock' THEN 'KR' WHEN asset_type = 'us_stock' THEN 'US' ELSE 'CRYPTO' END` 를 먼저 실행해야 한다.

2. **get_or_recommend_stock_sector 설계 변경**: 기존 `upsert_stock_with_sector`는 stocks에 직접 INSERT했으나, 신규 함수는 INSERT 없이 조회 + 섹터 추천만 수행한다. 실제 INSERT는 FastAPI(service_role) 경유. 따라서 `is_new=true`인 경우 반환되는 `id`는 임시 UUID로, FastAPI upsert 완료 후 재조회가 필요하다.

3. **memo.ts의 upsertStockWithSector 제거**: 기존 함수는 삭제하고 `getOrRecommendStockSector`로 대체. 이전 함수를 사용하던 screens/hooks에서 호출부 변경 필요 (frontend-impl-agent 담당).

4. **하위 호환**: `StockAssetType`은 deprecated 처리하되 삭제하지 않았다. `account_events`, `corporate_actions` 등 별도 테이블에서 여전히 `asset_type` 컬럼을 사용하므로 해당 타입은 유지.
