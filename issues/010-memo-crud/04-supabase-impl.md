# Supabase 구현 내역

## 마이그레이션

- `app/supabase/migrations/20260602000001_memo_crud.sql`

### 포함 내용

**테이블**
- `memos` — uuid PK, user_id FK(→ auth.users, cascade), body, created_at, updated_at
- `memo_stocks` — (memo_id, stock_id) 복합 PK, goal_price nullable CHECK > 0
- `memo_trade_events` — (memo_id, event_id) 복합 PK
- `memo_news` — (memo_id, news_id) 복합 PK. news 테이블 미정의로 news_id는 FK 없이 uuid만 관리
- `memo_sectors` — (memo_id, sector_id) 복합 PK

**RLS**
- `memos`: 본인(user_id = auth.uid()) SELECT/INSERT/UPDATE/DELETE
- junction 4종: memo_id → memos.user_id = auth.uid() 서브쿼리로 소유권 확인 후 SELECT/INSERT/DELETE

**인덱스**
- `idx_memos_user_id_created_at` ON (user_id, created_at DESC)
- `idx_memo_stocks_stock_id` ON (stock_id)
- `idx_memo_trade_events_event_id` ON (event_id)
- `idx_memo_news_news_id` ON (news_id)
- `idx_memo_sectors_sector_id` ON (sector_id)

**트리거**
- `memos_set_updated_at` — `set_updated_at()` 함수로 updated_at 자동 갱신

**DB Functions**
- `create_memo_with_links(p_body, p_stocks, p_trade_event_ids, p_news_ids, p_sector_ids)` — 메모 + 연결 단일 트랜잭션 생성
- `list_memos(p_from, p_to, p_stock_id, p_include_trade_events, p_trade_events_only, p_news_only, p_sector_id, p_no_links, p_limit, p_offset)` — 필터 + 페이지네이션 조회
- `update_memo_with_links(p_memo_id, p_body, p_stocks, p_trade_event_ids, p_news_ids, p_sector_ids)` — 연결 전체 교체 방식 수정
- `create_trade_event_with_memo(p_event, p_memo_body, p_goal_price)` — 매매이벤트 + 메모 동시 생성

## Edge Functions

없음 (모두 DB Function으로 처리)

## 클라이언트 유틸

- `app/services/memo.ts` — 구현된 함수 목록:
  - `getSectors()` — 섹터 목록 조회
  - `getStock(ticker, assetType)` — 종목 단건 조회
  - `searchStocks(query)` — 종목 검색 (이름/티커 ilike)
  - `listMemos(params)` — list_memos RPC 호출
  - `getMemo(memoId)` — 메모 상세 조회 (REST, 연결 포함)
  - `createMemo(input)` — create_memo_with_links RPC 호출
  - `updateMemo(input)` — update_memo_with_links RPC 호출
  - `deleteMemo(memoId)` — 메모 삭제 (REST)
  - `createTradeEventWithMemo(input)` — create_trade_event_with_memo RPC 호출
  - `linkMemoStock(memoId, stockId, goalPrice)` — 종목 연결 추가
  - `linkMemoTradeEvent(memoId, eventId)` — 매매이벤트 연결 추가
  - `linkMemoNews(memoId, newsId)` — 뉴스 연결 추가
  - `linkMemoSector(memoId, sectorId)` — 섹터 연결 추가
  - `unlinkMemoStock(memoId, stockId)` — 종목 연결 해제
  - `unlinkMemoTradeEvent(memoId, eventId)` — 매매이벤트 연결 해제
  - `unlinkMemoNews(memoId, newsId)` — 뉴스 연결 해제
  - `unlinkMemoSector(memoId, sectorId)` — 섹터 연결 해제
  - `upsertStockWithSector(input)` — upsert_stock_with_sector RPC 호출
  - `updateStockSector(stockId, sectorId)` — 종목 섹터 수동 변경

- `app/types/memo.ts` — 기존 파일 유지 (FE 에이전트 작성, 수정 불필요)

## 사전 의존성 체크리스트

- [ ] `supabase db push` 실행 — Supabase 대시보드 또는 CLI로 적용 — smoke test 가능: `supabase.from('memos').select('id').limit(1)` 반환 오류 없음 확인
- [ ] DB Functions 배포 확인 — 마이그레이션에 포함되어 push 시 자동 등록 — smoke test 가능: `supabase.rpc('list_memos', {})` 호출 결과 확인
- [ ] `set_updated_at` 트리거 함수 — 마이그레이션에 포함 — 수동 확인 불필요

## 특이사항

### news 테이블 FK 미적용
`memo_news.news_id`는 `news(id)` FK를 참조해야 하지만 `news` 테이블이 아직 스키마에 정의되어 있지 않다. 현재는 uuid 컬럼만 관리하며, 추후 news 기능 구현 시 FK 추가 마이그레이션을 별도 작성해야 한다.

### `supabase db push` 미실행
지시에 따라 DB 적용 명령은 실행하지 않았다. 백엔드 테스트 단계에서 `supabase db push` 후 통합 테스트를 진행한다.

### create_memo_with_links 파라미터 형태
`p_stocks`는 `jsonb` 타입으로 정의했다 (`uuid[]`로는 goal_price를 함께 전달 불가). Supabase RPC 호출 시 클라이언트에서 `p_stocks: [{ stock_id: '...', goal_price: 50000 }]` 형태로 전달하면 자동 jsonb 변환된다.

### list_memos 종목 필터 + 매매이벤트 포함 로직
`p_stock_id` 지정 + `p_include_trade_events: true`일 때, 해당 종목의 ticker/asset_type으로 account_events를 조인하여 매매이벤트로 연결된 메모도 포함한다. 종목이 stocks 테이블에 없으면 이 경로로 매칭되는 메모가 없다.
