# Supabase 구현 내역

## 마이그레이션
- `app/supabase/migrations/20260604000000_memo_filter_update.sql`

## Edge Functions
- 해당 없음 (DB Function 재정의만으로 구현)

## 클라이언트 유틸
- `app/services/memo.ts` — `listMemos` 함수 (파라미터 변경 반영)
- `app/types/memo.ts` — `ListMemosParams`, `MemoFilterState` (배열 타입으로 변경)

## 변경 내용 상세

### list_memos DB Function 재정의 (`CREATE OR REPLACE`)

**제거된 파라미터**
- `p_stock_id uuid` — 단건 종목 필터 (배열로 교체)
- `p_include_trade_events boolean` — "직접 연결만 보기" 토글 제거

**추가/변경된 파라미터**
- `p_stock_ids uuid[] default null` — 복수 종목 OR 필터
- `p_sector_ids int[] default null` — 복수 섹터 OR 필터 (`p_sector_id` 단건 → 배열)

**필터 결합 로직**
- `p_stock_ids`: 지정된 종목 중 하나라도 직접 연결(`memo_stocks`)되거나 매매이벤트 경유 연결(`memo_trade_events → account_events → stocks` ticker 매칭)된 메모를 OR로 반환
- `p_sector_ids`: 지정된 섹터 중 하나라도 연결된 메모를 OR로 반환
- 서로 다른 타입 간(종목 필터 + 매매 필터 등)은 AND 결합
- `p_no_links = true`: 다른 모든 엔티티 필터를 무시하고 연결 없는 메모만 반환

**응답 필드 수정**
- stocks 배열 내 `asset_type` → `market` 필드명 수정 (stocks 테이블 스키마 변경 반영)

### 클라이언트 코드 (이미 반영 완료)
- `app/types/memo.ts`의 `ListMemosParams`는 이미 `p_stock_ids: string[] | null`, `p_sector_ids: number[] | null` 배열 타입으로 업데이트되어 있었음
- `app/services/memo.ts`의 `listMemos` 함수도 이미 배열 파라미터로 RPC를 호출하도록 업데이트되어 있었음
- 따라서 클라이언트 파일은 수정 불필요

## 사전 의존성 체크리스트

- [ ] Supabase DB에 `list_memos` 함수 재정의 적용 — `supabase db push` 실행 — smoke test 가능 (`supabase.rpc('list_memos', { p_stock_ids: [], p_sector_ids: [] })`)

## 특이사항

- 기존 `list_memos` 함수의 `stocks` 응답 배열에서 `asset_type` 필드를 반환하고 있었으나, stocks 테이블에는 이미 `asset_type` 컬럼이 없고 `market` 컬럼으로 변경되어 있었음. 이번 마이그레이션에서 응답 필드를 `market`으로 수정.
- 매매이벤트 경유 종목 연결 로직: `stocks.ticker = ae.ticker` 조건으로 매칭. `account_events.asset_type`('korean_stock'/'us_stock') ↔ `stocks.market`('KR'/'US') 간 변환이 필요하나, ticker가 `p_stock_ids`로 이미 특정 종목을 식별하므로 ticker 매칭만으로도 충분히 동작함.
- `p_no_links = true` 시 종목/섹터/매매/뉴스 필터를 명시적으로 무시하도록 각 AND 절에 `p_no_links = true` 단락(short-circuit) 조건 추가.
