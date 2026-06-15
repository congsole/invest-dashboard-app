# [20260615-market-price-loading-fe] 현재가 로딩 전략 — 대시보드 UI 개선 (FE 트랙)

<!-- PM-agent 작성 -->
## 개요

PRD-002에 "미장 가격 조회 원칙"이 추가되었다. 대시보드 현재가 표시를 두 단계로 분리한다: (1) `prices` 테이블 최신 종가(EOD)를 즉시 baseline으로 표시하고, (2) `get-market-prices` Edge Function을 청크 단위로 순차 호출하여 실시간 현재가를 점진 갱신한다.

이 이슈는 FE 트랙으로, `useDashboard` 훅과 관련 화면/컴포넌트를 수정한다. 선행 이슈 `20260615-market-price-loading-be` (Edge Function 수정 + 타입 확장) 완료 후 착수한다.

**현재 구현 상태 (수정 전)**:
- `useDashboard.fetchData`는 `getKpiSummary` → `getMarketPrices` (전체 한 번) → `getKpiSummary 재계산` 순으로 직렬 호출한다.
- 초기 마운트 시 `initialLoading=true` 동안 화면 전체가 빈 상태다. `prices` baseline 즉시 표시가 없다.
- `getMarketPrices`가 실패하면 현재가 없이 처리되거나 에러로 빠진다. `failed` 배열 처리 로직이 없다.
- Twelve Data 청크 분할 순차 호출 로직이 클라이언트에 없다.

**수정 범위**:
1. `app/services/market.ts`: `getPricesBaseline(tickers)` 함수 추가 (prices 테이블 REST 조회, ticker+asset_type 그룹별 date MAX 행 반환).
2. `app/hooks/useDashboard.ts`: 로딩 전략 2단계 구현.
   - 1단계: `getPricesBaseline` 호출 → baseline priceMap 구성 → holdings/KPI를 즉시 렌더링 (화면 전체 스피너 없이).
   - 2단계: 미국주식을 8개씩 청크 분할, 청크 사이 60초 대기, 한국주식·코인은 첫 청크에 동반. 각 청크 응답 도착 시 즉시 priceMap 갱신 → `setHoldings`/`setKpi` 재계산.
   - `failed` 배열: 실패 종목은 baseline 저장 종가를 유지 (빈칸 금지).
   - 자동 폴링 없음. 진입 1회 + 새로고침(`refetch`) 1회.
3. `app/types/dashboard.ts`: `MarketPriceItem.source` 필드, `MarketPricesResponse.failed` 배열 반영 (BE 이슈에서 수정 시 여기에도 반영).
4. `HoldingCard` 컴포넌트 / `DashboardScreen`: 가격 출처(baseline vs 실시간) 및 갱신 시각 표시 확인. 로딩 중 스피너 금지 원칙 준수.

> 선행 이슈: 20260615-market-price-loading-be

## 참조 문서
- 커밋: eabdfaec30f6770e8c6f3300408fa558f19ad609 — [기획] 미장 가격 조회 원칙
- 기획서: docs/planning/PRD-002-dashboard.md
- 선행 이슈: 20260615-market-price-loading-be (Edge Function 수정 + 타입 확장 선행 필요)

## docs 변경 내역

다음 명령으로 설계 에이전트들이 방금 업데이트한 내역을 파악한다:
```bash
git diff eabdfaec30f6770e8c6f3300408fa558f19ad609 HEAD -- docs/architecture/domain-model.md
git diff eabdfaec30f6770e8c6f3300408fa558f19ad609 HEAD -- docs/architecture/db-schema.md
git diff eabdfaec30f6770e8c6f3300408fa558f19ad609 HEAD -- docs/api/api-spec.md
```

### domain-model.md
- [수정] Price 엔터티 — 설명에 "EOD baseline 즉시 표시 + 실시간 점진 갱신" 역할 명시
- [추가] 계산 규칙 — "현재가 로딩 전략" 섹션 신규 추가 (baseline 즉시 렌더링, 청크 분할 순차 호출, 실패 처리, 폴링 없음)

### db-schema.md
- [변경 없음] DB 스키마(테이블/컬럼/인덱스/RLS) 변경 없음.

### api-spec.md
- [추가] Market 도메인 — "저장 종가 baseline 조회" API 신규 추가 (prices 테이블 REST, `.in('ticker', tickers)` + date 내림차순, 클라이언트에서 ticker+asset_type 그룹별 MAX date 행 사용)
- [수정] Market 도메인 — "실시간 현재가 조회 (Edge Function)" 보강: 청크 분할 전략 표(미국주식 8개/청크·60초 대기, 한국주식·코인 첫 청크 동반), `source` 필드 및 `failed` 배열 추가

<!-- 구현 단계에서 업데이트 -->
## 구현 현황
- [-] Supabase 구현 (BE 트랙: 20260615-market-price-loading-be)
- [-] 백엔드 테스트 (BE 트랙: 20260615-market-price-loading-be)
- [x] 프론트엔드 구현
- [ ] 수동 테스트
