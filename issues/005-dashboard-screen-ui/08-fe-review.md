# 프론트엔드 코드 리뷰 — 이슈 005

## Initial Review
**결과**: 이슈 3건 (high 2, mid 1)

**이슈 목록**
- [high] `app/hooks/useDashboard.ts:6-7` — `getMarketPrices`, `getExchangeRate`를 `services/dashboard`에서 import하지만 해당 함수는 존재하지 않음. `services/market`에 있음. 대시보드 데이터 로딩 자체가 런타임 오류로 실패.
- [high] `app/components/NewTradeEventSheet.tsx:16` — `createTradeEvent`를 `services/dashboard`에서 import하지만 존재하지 않음. 이슈 006 fe-review에서 이미 수정 완료.
- [mid] `app/components/AssetHistoryChart.tsx:50` — `item.total_fee_tax * exchangeRate * 0.1` stub 계산 부적절. USD/KRW 환율(~1380)에 0.1을 곱하는 것은 의미 없음.

## Cycle 1
**수정 내용**
- `useDashboard.ts:2-8`: import 분리 — `getMarketPrices`, `getExchangeRate`를 `services/market`에서 import.
- `AssetHistoryChart.tsx:50`: stub 계산 제거, `total_invested` 그대로 사용 + TODO 주석으로 현재가 연동 시점 명시.
- `NewTradeEventSheet.tsx`: 이슈 006 리뷰 시 수정 완료 (import 경로 fix).

**Confirmation 결과**: 합격

잔존 이슈 없음.

**비고 (정상)**
- `AssetHistoryChart.tsx`의 `exchangeRate` prop은 `totalAssetsLine` stub 제거 후 미사용 상태이나, 향후 현재가 연동 시 필요하므로 유지.
- DESIGN.md No-Line Rule 준수, 색상 토큰 일치, loading/error 상태 처리 완비.

## 최종 결과
합격
