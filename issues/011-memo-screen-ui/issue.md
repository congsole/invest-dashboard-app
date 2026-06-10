# [011] 메모 화면 UI 및 매수/매도 폼 통합

<!-- PM-agent 작성 -->
## 개요
PRD-003 메모 기능의 프론트엔드 작업이다. 달력형 뷰와 리스트형 뷰를 전환할 수 있는 메모 목록 화면, 필터(종목/매매이벤트/뉴스/섹터/연결 없음 AND 결합), 메모 작성·편집 화면(엔티티 다중 선택, 목표가 입력)을 구현한다. 매수/매도 입력 폼에 메모 작성 옵션을 통합하여 이벤트 저장과 메모 생성을 한 번에 처리한다. 이슈 009(섹터/종목 마스터)와 이슈 010(메모 CRUD)이 선행되어야 한다.

## 참조 문서
- 커밋: 7b4d05104904b8f40f20bd21285c4075af7ad61d — [Docs] memo 기획서 초안
- 기획서: docs/planning/PRD-003-memo.md (섹션 5 색상/표시 규칙, 섹션 6 화면)
- 선행 이슈: [009] 섹터 마스터 및 종목 마스터 데이터 레이어, [010] 메모 CRUD 및 엔티티 연결 데이터 레이어

## docs 변경 내역

다음 명령으로 설계 에이전트들이 방금 업데이트한 내역을 파악한다:
```bash
git diff HEAD docs/architecture/domain-model.md
git diff HEAD docs/architecture/db-schema.md
git diff HEAD docs/api/api-spec.md
```
(아직 커밋되지 않은 변경 사항이므로 `HEAD` 기준 diff 사용)

### domain-model.md
- [추가] Memo, MemoStock, MemoTradeEvent, MemoNews, MemoSector 엔터티 (이슈 010 참조)
- [추가] Sector, Stock 엔터티 (이슈 009 참조)

### db-schema.md
- 이슈 009, 010 구현 결과물을 소비하는 FE 이슈. 스키마 직접 변경 없음.

### api-spec.md
- 이슈 009, 010 구현 결과물을 소비하는 FE 이슈. API 명세 직접 변경 없음.
- 사용 API: `list_memos` RPC (달력형/리스트형), `create_memo_with_links` RPC, `update_memo_with_links` RPC, 섹터 목록 조회 REST, `create_trade_event_with_memo` RPC (폼 통합)

## 구현 현황
- [ ] Supabase 구현
- [ ] 백엔드 테스트
- [x] 프론트엔드 구현
