# [005] 대시보드 화면 UI

<!-- PM-agent 작성 -->
## 개요
메인 대시보드 화면(`DashboardScreen`)을 구현한다. 부문 필터 탭, 누적 자산 히스토리 꺾은선 그래프(3라인, 기간 전환), 부문별 자산 비중 파이 차트, 종목 카드 리스트를 포함한다. 차트는 `react-native-gifted-charts`를 사용한다. 이슈 003(CRUD)과 004(집계/외부 API)가 선행 완료되어야 한다.

## 참조 문서
- 커밋: 1dc2688b212ac64016716fa5c16fccde05a12876 — [Docs] 메인 화면(대시보드) 초기 기획 및 디자인
- 기획서: docs/planning/PRD-002-dashboard.md
- 디자인: docs/design/DESIGN.md
- 선행 이슈: [003] issues/003-trade-events-cash-balances-crud/issue.md, [004] issues/004-dashboard-aggregation-external-api/issue.md

## docs 변경 내역

다음 명령으로 설계 에이전트들이 방금 업데이트한 내역을 파악한다:
```bash
git diff HEAD docs/architecture/domain-model.md
git diff HEAD docs/architecture/db-schema.md
git diff HEAD docs/api/api-spec.md
```
(아직 커밋되지 않은 변경 사항이므로 `HEAD` 기준 diff 사용)

### domain-model.md
- [참조] `TradeEvent`, `CashBalance` — 화면에서 소비하는 데이터 모델

### db-schema.md
- 해당 없음 (FE 전용 이슈)

### api-spec.md
- [참조] Dashboard 집계 RPC (portfolio-summary, asset-history, sector-allocation) — 화면 데이터 소스
- [참조] Market Edge Function (현재가, 환율) — 종목 카드 현재가 및 수익률 표시

<!-- 구현 단계에서 업데이트 -->
## 구현 현황
- [ ] Supabase 구현
- [ ] 백엔드 테스트
- [ ] 프론트엔드 구현
- [ ] E2E 테스트
