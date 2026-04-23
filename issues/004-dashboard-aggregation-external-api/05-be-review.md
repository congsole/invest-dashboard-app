# 백엔드 코드 리뷰

## Initial Review
**결과**: 이슈 2건 (high 1, mid 1)

**이슈 목록**
- [high] `20260423000001_dashboard_functions.sql`: `get_asset_history` — `p_period = 'day'` 기간에서 `date_trunc('hour', ...)` 사용. `trade_date`는 `date` 타입으로 시간 정보가 없어 항상 `00:00:00`이 반환되며 시간별 버킷 구분이 불가능함. 'day' 기간도 'day' 단위 버킷을 사용해야 함.
- [mid] `app/services/dashboard.ts` + `app/services/market.ts`: `getMarketPrices`, `getExchangeRate` 함수가 양 파일에 동일하게 중복 구현되어 있음. 호출 측 혼란 및 향후 동기화 이슈 유발 가능.

## Cycle 1
**수정 내용**
- `20260423000001_dashboard_functions.sql`: `v_trunc_unit` 계산에서 `when 'day' then 'hour'`를 `when 'day' then 'day'`로 변경. 주석 추가 (trade_date는 date 타입이므로 'hour' 버킷 불가 설명).
- `app/services/dashboard.ts`: `getMarketPrices`, `getExchangeRate` 함수 및 관련 import(`MarketPricesResponse`, `ExchangeRateResponse`) 제거. `app/services/market.ts`를 Market 도메인 canonical 소스로 일원화. 파일 상단 주석에 market.ts 참조 안내 추가.

**Confirmation 결과**: 합격

잔존 이슈 없음.

**비고 (low, 수정 불필요)**
- `get_portfolio_summary` 재귀 CTE 내 `cum_invested_base` 필드는 최종 결과에 사용되지 않음 (totals CTE가 동일 계산을 독립 수행). 로직 정확성에는 영향 없음.
- `get_sector_allocation` 반환 컬럼 `ticker_count`는 SQL에서 `bigint`이고 TypeScript에서 `number`로 매핑. 보유 종목 수는 현실적으로 `number` 범위를 초과하지 않으므로 실질적 문제 없음.

## 최종 결과
합격
