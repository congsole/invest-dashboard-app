# [004] 대시보드 집계 DB Function + 외부 API Edge Function

<!-- PM-agent 작성 -->
## 개요
대시보드 표시에 필요한 서버 측 집계 로직과 외부 API 연동을 구현한다. Supabase DB Function(get_portfolio_summary, get_asset_history, get_sector_allocation)과 Edge Function(현재가: Twelve Data/CoinGecko, 환율: ExchangeRate-API)을 구현한다. 클라이언트에 API 키를 노출하지 않고 Edge Function에서만 외부 API를 호출한다. 이슈 003 선행 필요. 이슈 005(대시보드 FE)의 선행 작업이다.

## 참조 문서
- 커밋: 1dc2688b212ac64016716fa5c16fccde05a12876 — [Docs] 메인 화면(대시보드) 초기 기획 및 디자인
- 기획서: docs/planning/PRD-002-dashboard.md
- 디자인: docs/design/DESIGN.md
- 선행 이슈: [003] issues/003-trade-events-cash-balances-crud/issue.md

## docs 변경 내역

다음 명령으로 설계 에이전트들이 방금 업데이트한 내역을 파악한다:
```bash
git diff HEAD docs/architecture/domain-model.md
git diff HEAD docs/architecture/db-schema.md
git diff HEAD docs/api/api-spec.md
```
(아직 커밋되지 않은 변경 사항이므로 `HEAD` 기준 diff 사용)

### domain-model.md
- [추가] `TradeEvent`, `CashBalance` 엔터티 (이슈 003과 동일 — 집계 함수의 입력 데이터)

### db-schema.md
- [추가] DB Function `get_portfolio_summary` — 포트폴리오 요약 집계 (보유 종목별 수량, 평균매수가, 투입원금)
- [추가] DB Function `get_asset_history` — 기간별 자산 히스토리 집계 (총 자산, 투입 원금, 수수료+세금 라인)
- [추가] DB Function `get_sector_allocation` — 부문별 자산 비중 집계 (korean_stock / us_stock / crypto)

### api-spec.md
- [추가] Dashboard 집계 RPC — portfolio-summary, asset-history, sector-allocation (3개 엔드포인트)
- [추가] Market Edge Function — 현재가 조회 (Twelve Data + CoinGecko), 환율 조회 (ExchangeRate-API) (2개 엔드포인트)
- [추가] TradeEvent CSV — CSV 미리보기, CSV 확정 (2개 엔드포인트)

<!-- 구현 단계에서 업데이트 -->
## 구현 현황
- [ ] Supabase 구현
- [ ] 백엔드 테스트
- [ ] 프론트엔드 구현
- [ ] E2E 테스트
