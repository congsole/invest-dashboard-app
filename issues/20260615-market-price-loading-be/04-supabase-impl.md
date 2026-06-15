# Supabase 구현 내역

## 마이그레이션

DB 스키마 변경 없음. 마이그레이션 파일 미생성.

`prices` 테이블은 기존 구조(ticker, asset_type, date, close, currency, updated_at)로 baseline 조회를 지원하므로 인덱스 추가도 불필요하다고 판단했다. `ticker` 컬럼에는 기존 인덱스가 있고, `.in('ticker', tickers)` + `order('date', { ascending: false })` 쿼리는 현재 규모에서 충분하다.

## Edge Functions

### `app/supabase/functions/get-market-prices/index.ts` 수정

변경 사항:
1. **`chunk_index` 파라미터 수신**: 요청 body에서 `chunk_index`(기본 0) 수신. 로그에 포함하여 청크별 추적 가능.
2. **us_stock 8개 초과 400 반환**: 요청 내 `us_stock` 종목 수를 검증하여 8개 초과 시 400 에러 반환. 에러 메시지에 실제 종목 수 포함.
3. **`source` 필드 추가**: 각 `PriceResult`에 `source: 'realtime' | 'cached'` 필드 추가.
   - 외부 API 직접 조회 성공 → `source: 'realtime'`, `is_cached: false`
   - 유효 캐시 히트 → `source: 'cached'`, `is_cached: true`
   - 만료된 stale 캐시 폴백 → `source: 'cached'`, `is_cached: true`
4. **`failed` 배열 추가**: `FailedResult` 인터페이스 및 `failed: FailedResult[]` 배열 추가. 조회 실패 종목(API 오류 또는 응답 누락 + 캐시도 없는 경우)을 `failed`에 추가하고 HTTP 200 유지.
5. **에러 출처 구분**: `fetchAndMerge` 내부에서 fetch 에러 메시지를 `fetchError`로 캡처하여 `failed.reason`에 상세 사유 포함. `Promise.all` 각 항목에 `.catch`로 예상치 못한 오류 출처 명시.
6. **완료 로그**: 처리 시작/완료 시 `chunk_index`, 총 prices/failed 수를 로그 출력.

## 클라이언트 유틸

### `app/types/dashboard.ts` 수정

- `MarketPriceItem`에 `source: 'realtime' | 'cached'` 필드 추가
- `MarketPriceFailedItem` 인터페이스 신규 추가: `{ ticker, asset_type, reason }`
- `MarketPricesResponse`에 `failed: MarketPriceFailedItem[]` 필드 추가

### `app/services/market.ts` 수정

- `getMarketPrices` 함수에 `chunk_index = 0` 파라미터 추가. 기본값 0이므로 기존 호출부는 변경 불필요.
- 에러 발생 시 `chunk_index` 포함한 상세 메시지로 throw (기존 단순 `throw error`에서 개선)
- `getBaselinePrices` 함수 신규 추가: `prices` 테이블에서 `.in('ticker', tickers).order('date', { ascending: false })` REST 조회. `BaselinePriceItem` 타입 정의 포함.

## 사전 의존성 체크리스트

- [x] `TWELVE_DATA_API_KEY` Edge Function 환경 변수 — Supabase 대시보드 → Edge Functions → Secrets — 기존 설정 유지, 변경 없음
- [x] `COINGECKO_API_KEY` Edge Function 환경 변수 — 동일, 기존 설정 유지

## 특이사항

- `fetchAndMerge`가 throw하지 않는 설계(내부 try/catch)이므로 `Promise.all` `.catch`는 사실상 방어 코드이지만, 향후 리팩토링 시 동작이 바뀌는 경우를 대비해 유지한다.
- stale 캐시 폴백(캐시 TTL 만료 후에도 만료된 값 사용) 동작은 기존 구현에서도 동일하게 존재하던 패턴이다. 이 이슈에서는 `source: 'cached'`로 명시적으로 표기하여 클라이언트가 baseline 저장 종가로 대체할지 판단할 수 있게 했다.
- `getBaselinePrices`는 FE 트랙(`20260615-market-price-loading-fe`)에서 baseline 즉시 렌더링에 사용한다.
