# 백엔드 통합 테스트

## 결론

이슈 013은 UI 컴포넌트 이슈로, 추가 BE 구현이 없다.
이슈 013 UI에서 호출하는 모든 서비스 함수의 백엔드 레이어는 이슈 012 테스트에서 완전히 커버되어 있다.

## 이슈 012 커버리지 확인

테스트 파일: `app/tests/integration/012-stock-search-data-layer.test.ts`

| 이슈 013 UI 호출 경로 | 커버하는 이슈 012 테스트 |
|---|---|
| 검색어 입력 → `searchStocksLocal()` (ilike) | "로컬 종목 검색 (ilike)" — 6개 케이스 |
| 외부 결과 선택 후 → `getOrRecommendStockSector()` | "get_or_recommend_stock_sector RPC" — 7개 케이스 |
| 종목 단건 확인 → `getStock(ticker, market)` | "getStock (ticker + market 단건 조회)" — 5개 케이스 |
| stocks 읽기 RLS | "stocks 테이블 읽기" — 3개 케이스 |
| stocks 쓰기 RLS (일반 사용자 차단) | "stocks RLS 쓰기 (service_role 전용)" — 4개 케이스 |
| market/currency/is_active 스키마 | "stocks 스키마 변경 검증" — 4개 케이스 |

**이슈 012 전체: 29개 통과**

## 추가 테스트 필요 여부

불필요. 이유:

1. 이슈 013은 DB 스키마, RLS 정책, DB Function에 변경을 가하지 않는다 (`04-supabase-impl.md` 확인).
2. 이슈 013 UI가 사용하는 서비스 함수(`searchStocksLocal`, `searchStocks`, `getOrRecommendStockSector`, `updateStockSector`, `getStock`)는 모두 이슈 012에서 구현 및 검증 완료.
3. `updateStockSector()`는 FastAPI 외부 서버 경유 함수로, 수동 확인 대상이며 자동 테스트 범위 밖이다 (이슈 012 `04-supabase-impl.md`의 사전 의존성 체크리스트 항목).

## 수동 확인 필요 항목 (이슈 012에서 이월)

이슈 012 `04-supabase-impl.md`의 사전 의존성 체크리스트에서 자동 검증 불가한 항목:

- `EXPO_PUBLIC_FASTAPI_BASE_URL` 환경변수 설정 — `.env` 파일 또는 EAS Secrets
- FastAPI 서버 `GET /stocks/search` 엔드포인트 구현 및 응답 확인
- FastAPI 서버 `PATCH /stocks/{id}/sector` 엔드포인트 구현 및 응답 확인

## 최종 결과

이슈 012에서 커버됨 — 추가 테스트 불필요
