# [006] 매매 이벤트 입력 UI (바텀시트 + CSV 업로드)

<!-- PM-agent 작성 -->
## 개요
대시보드 FAB(+) 버튼으로 열리는 매매 이벤트 입력 바텀시트를 구현한다. 자산 유형/매매 유형/종목/수량/체결가/수수료/세금/정산금액(자동 계산) 입력 폼과, 증권사 CSV 파일 업로드 및 파싱 결과 미리보기 후 저장 기능을 포함한다. 이슈 003(CRUD 서비스 함수)이 선행 완료되어야 한다.

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
- [참조] `TradeEvent` — 입력 폼 필드 구조의 기반 (asset_type, trade_type, ticker, name, trade_date, quantity, price_per_unit, currency, fee, fee_currency, tax, settlement_amount)

### db-schema.md
- 해당 없음 (FE 전용 이슈)

### api-spec.md
- [참조] TradeEvent 등록 엔드포인트 — 수동 입력 저장
- [참조] TradeEvent CSV 미리보기 / CSV 확정 엔드포인트 — CSV 업로드 플로우

<!-- 구현 단계에서 업데이트 -->
## 구현 현황
- [ ] Supabase 구현
- [ ] 백엔드 테스트
- [ ] 프론트엔드 구현
- [ ] E2E 테스트
