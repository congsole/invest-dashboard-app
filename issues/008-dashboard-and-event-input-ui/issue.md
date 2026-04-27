# [008] 대시보드 화면 + 계정 이벤트 입력 UI 리팩토링

<!-- PM-agent 작성 -->
## 개요

이슈 005(대시보드 화면), 006(이벤트 입력 UI)의 기존 FE 구현을 변경된 기획(PRD-002-dashboard.md)에 맞게 전면 리팩토링한다.

**선행 조건**: 이슈 [007] AccountEvents 데이터 레이어 구축 완료 필요.

**포함 작업**

대시보드 화면:
- KPI 카드 섹션 신규 구현 (1차 행: 총 평가액/원금/순수익 3개 큰 카드, 2차 행: 예수금/누적 배당금/누적 수수료/누적 세금 4개 작은 카드)
- 자산 히스토리 그래프 교체 — 3라인(원금·평가액·예수금) + 이벤트 마커(배당●/출금▽) + 기간 전환(일/주/월/년/전체)
- 부문별 자산 비중 파이 차트 제거
- 부문 필터 탭 연동 로직 업데이트 (KPI 계산 범위 변경)
- 종목 카드 통화 병기 표시 업데이트 (원 통화 + KRW 환산)

계정 이벤트 입력 UI:
- 바텀시트 1단계 — 5종 이벤트 타입 선택 화면으로 교체 (매수/매도/입금/출금/배당)
- 바텀시트 2단계 — 타입별 입력 폼 구현 (매수/매도 공통 폼, 입금 폼, 출금 폼, 배당 수령 폼)
- account_events API 연동 서비스/훅 업데이트
- CSV 파일 업로드 연동 함수 변경 (`parse-account-csv`, `confirm-account-csv`)

## 참조 문서
- 커밋: 00b3fb914fe93fc6fb1fa0ea210865b40009ac28 — [Docs] 대시보드 기획 수정
- 기획서: docs/planning/PRD-002-dashboard.md
- 선행 이슈: [007] AccountEvents 데이터 레이어 구축 (`issues/007-account-events-data-layer/`)

## docs 변경 내역

다음 명령으로 설계 에이전트들이 방금 업데이트한 내역을 파악한다:
```bash
git diff HEAD docs/architecture/domain-model.md
git diff HEAD docs/architecture/db-schema.md
git diff HEAD docs/api/api-spec.md
```
(아직 커밋되지 않은 변경 사항이므로 `HEAD` 기준 diff 사용)

변경된 내용을 요약하여 아래 형식으로 채운다:

### domain-model.md
- [수정] AccountEvent — FE에서 소비하는 5종 이벤트 타입 및 필드 구조 변경 (이슈 007 참조)
- [삭제] CashBalance — 예수금은 account_events 누적 계산으로 대체. FE에서 별도 조회 불필요.
- [추가] DailySnapshot — 히스토리 그래프 3라인 데이터 원천. FE에서 daily_snapshots REST 조회.
- [추가] 계산 규칙 섹션 — KPI 카드 수치 계산 로직 (원금/예수금/총 평가액/순수익/수익률)

### db-schema.md
- [수정] account_events — FE 입력 폼 필드 구조 변경 (5종 이벤트 타입, amount, source 필드)
- [삭제] cash_balances — FE에서 직접 조회 제거
- [추가] daily_snapshots — 히스토리 그래프용 REST 조회 대상

### api-spec.md
- [수정] AccountEvent API — 등록/수정/삭제 시 event_type/amount/source 필드 사용
- [수정] Dashboard — `get_kpi_summary` RPC 호출로 KPI 카드 데이터 수신. daily_snapshots REST + `get_history_markers` RPC로 그래프 데이터 수신
- [삭제] 파이 차트 API — FE에서 관련 컴포넌트 제거
- [수정] CSV Edge Function — `parse-account-csv` / `confirm-account-csv` 연동

<!-- 구현 단계에서 업데이트 -->
## 구현 현황
- [ ] Supabase 구현 (FE 전담 이슈 — 해당 없음, 이슈 007에서 완료)
- [ ] 백��드 테스트 (FE 전담 ���슈 — ��당 없음, 이슈 007에서 완��)
- [x] 프론트엔드 구현
- [ ] E2E 테스트 (수동 트리거)
