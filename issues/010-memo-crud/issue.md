# [010] 메모 CRUD 및 엔티티 연결 데이터 레이어

<!-- PM-agent 작성 -->
## 개요
PRD-003 메모 기능의 핵심 BE 작업이다. memos 본체 테이블과 타입별 junction 테이블(memo_stocks, memo_trade_events, memo_news, memo_sectors) 4개를 생성하고, 메모 생성·목록 조회·수정 RPC 및 삭제·단건 조회 REST API를 구현한다. 매수/매도 폼에서 메모를 동시 생성하는 `create_trade_event_with_memo` RPC도 이 이슈에서 처리한다. 이슈 009(섹터/종목 마스터)가 선행되어야 한다. 이슈 011(메모 화면 UI)의 선행 이슈다.

## 참조 문서
- 커밋: 7b4d05104904b8f40f20bd21285c4075af7ad61d — [Docs] memo 기획서 초안
- 기획서: docs/planning/PRD-003-memo.md (섹션 2 범위, 섹션 3 데이터 모델, 섹션 4 엔티티 연결 규칙)
- 선행 이슈: [009] 섹터 마스터 및 종목 마스터 데이터 레이어

## docs 변경 내역

다음 명령으로 설계 에이전트들이 방금 업데이트한 내역을 파악한다:
```bash
git diff HEAD docs/architecture/domain-model.md
git diff HEAD docs/architecture/db-schema.md
git diff HEAD docs/api/api-spec.md
```
(아직 커밋되지 않은 변경 사항이므로 `HEAD` 기준 diff 사용)

### domain-model.md
- [추가] Memo 엔터티 — user_id FK, body, created_at(달력 배치 기준), updated_at
- [추가] MemoStock junction 엔터티 — goal_price(nullable, 원통화 기준) 포함
- [추가] MemoTradeEvent junction 엔터티 — event_id FK (buy/sell만 허용)
- [추가] MemoNews junction 엔터티 — news_id FK
- [추가] MemoSector junction 엔터티 — sector_id FK
- [추가] 관계: User 1:N Memo, Memo N:M Stock, Memo N:M AccountEvent, Memo N:M News, Memo N:M Sector

### db-schema.md
- [추가] memos 테이블 — uuid PK, user_id FK cascade, body, created_at, updated_at. RLS: 본인 user_id만 CRUD
- [추가] memo_stocks 테이블 — (memo_id, stock_id) 복합 PK, goal_price nullable CHECK > 0. 인덱스: stock_id
- [추가] memo_trade_events 테이블 — (memo_id, event_id) 복합 PK. 인덱스: event_id
- [추가] memo_news 테이블 — (memo_id, news_id) 복합 PK. 인덱스: news_id
- [추가] memo_sectors 테이블 — (memo_id, sector_id) 복합 PK. 인덱스: sector_id
- [추가] ERD 관계: memos 1:N memo_stocks/memo_trade_events/memo_news/memo_sectors, junction → 참조 테이블 N:1

### api-spec.md
- [추가] Memo 도메인 — 메모 생성 `create_memo_with_links` (RPC, 단일 트랜잭션)
- [추가] Memo 도메인 — 메모 목록 조회 `list_memos` (RPC, 필터·페이지네이션 지원, 종목 필터 시 매매이벤트 포함 옵션)
- [추가] Memo 도메인 — 메모 상세 조회 (REST auto-generated, 연결 엔티티 포함)
- [추가] Memo 도메인 — 메모 수정 `update_memo_with_links` (RPC, 단일 트랜잭션, 연결 전체 교체)
- [추가] Memo 도메인 — 메모 삭제 (REST auto-generated, cascade)
- [추가] Memo 도메인 — 엔티티 연결 추가 4종 (memo_stocks/memo_trade_events/memo_news/memo_sectors insert, REST)
- [추가] Memo 도메인 — 엔티티 연결 해제 4종 (delete, REST)
- [추가] Memo 도메인 — 매매이벤트+메모 동시 생성 `create_trade_event_with_memo` (RPC, 단일 트랜잭션)

## 구현 현황
- [x] Supabase 구현
- [x] 백엔드 테스트
- [ ] 프론트엔드 구현
