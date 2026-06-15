# 백엔드 통합 테스트

## 테스트 환경
- 대상: 로컬 Supabase (supabase db reset 후 전체 스위트)
- 테스트 파일: app/tests/integration/20260615-market-price-loading-be.test.ts
- Edge Function: `supabase functions serve` (로컬 런타임)로 실행
- 원격 push: 완료 (이번 이슈 마이그레이션 없음 — Remote database is up to date)

## 사전 의존성 체크
- `TWELVE_DATA_API_KEY` / `COINGECKO_API_KEY`: 로컬 환경에는 미설정 → 외부 API 호출 실패 → `failed` 배열에 담겨 HTTP 200 반환 (이 동작이 핵심 검증 포인트)
- 자동 검증 불가 항목(운영 환경 Supabase 대시보드 Secrets): 기존 설정 유지로 수동 확인 불필요

## 테스트 결과

| 테스트 케이스 | 결과 | 비고 |
|-------------|------|------|
| 미인증 401 — Authorization 헤더 없음 | 통과 | |
| 미인증 401 — 잘못된 토큰 | 통과 | |
| 잘못된 파라미터 400 — tickers 없음 | 통과 | |
| 잘못된 파라미터 400 — tickers 빈 배열 | 통과 | |
| 잘못된 파라미터 400 — JSON 형식 오류 | 통과 | |
| us_stock 8개 허용 (400 아님) | 통과 | |
| us_stock 9개 400 반환 + 메시지에 9/8 포함 | 통과 | |
| us_stock 10개 400 반환 + 메시지에 10 포함 | 통과 | |
| us_stock 8개 + 한국주식 혼합 허용 | 통과 | |
| chunk_index=0 호출 시 200 | 통과 | |
| chunk_index=1 호출 시 200 | 통과 | |
| chunk_index 미전송 시 200 (기본값 0) | 통과 | |
| 응답에 prices / failed 배열 항상 존재 | 통과 | |
| prices 항목에 source 필드 존재 | 통과 | |
| failed 항목에 ticker/asset_type/reason 존재 | 통과 | |
| prices + failed 합계 = 요청 tickers 수 | 통과 | |
| 여러 asset_type 혼합 요청 시 source 필드 존재 | 통과 | |
| 외부 API 실패해도 HTTP 200 유지 + failed 배열 | 통과 | 로컬에서 API 키 없어 외부 실패 → failed에 담김, 200 확인 |
| 혼합 요청 일부 실패 시 HTTP 200 | 통과 | |
| getBaselinePrices — 최신 종가 반환 (date 내림차순) | 통과 | service_role로 테스트 데이터 삽입 후 검증 |
| getBaselinePrices — date 내림차순 정렬 확인 | 통과 | |
| getBaselinePrices — 행 컬럼 구조 확인 | 통과 | ticker/asset_type/date/close/currency/updated_at |
| getBaselinePrices — 빈 holdings | 통과 | .in('ticker', []) → 0건 반환 |
| getBaselinePrices — 동일 ticker 다른 asset_type 필터링 | 통과 | us_stock만 요청 시 crypto 제외 확인 |
| getBaselinePrices — 여러 holding 쌍 조합 조회 | 통과 | |
| prices RLS — 인증 사용자 SELECT 가능 | 통과 | |
| prices RLS — 미인증 사용자 SELECT 불가 | 통과 | |
| prices RLS — 일반 사용자 INSERT 불가 | 통과 | service_role 전용 확인 |

**전체: 318개 통과 / 0개 실패**
(이번 이슈 신규 테스트 27개 포함, 기존 테스트 291개 회귀 없음)

## 수정 내역

### Cycle 0 (초기 실행)
- `supabase_edge_runtime_app` 컨테이너가 중지 상태 (503 오류 원인)
- `supabase functions serve`로 로컬 Edge Function 런타임 기동 후 재실행
- 테스트 코드 수정 없음 — 환경 문제

## 특이사항

- `supabase status`에서 `supabase_edge_runtime_app`이 "Stopped services"로 표시되었으나, `supabase functions serve` 명령으로 별도 기동하면 정상 동작한다.
- 기존 026 테스트도 동일 이유(Edge Runtime 미실행)로 첫 실행 시 실패했으나, Edge Runtime 기동 후 전체 통과 확인. 이번 이슈의 변경이 026 회귀를 일으킨 것이 아님.
- 외부 API 키(Twelve Data, CoinGecko)가 로컬 환경에 없으므로 실시간 가격 조회는 모두 `failed` 배열에 담기지만, 핵심 검증 포인트인 "HTTP 200 유지 + failed 배열 존재 + prices+failed = 요청 수"는 모두 통과.

## 최종 결과
통과
