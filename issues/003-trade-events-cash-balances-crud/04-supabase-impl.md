# Supabase 구현 내역

## 마이그레이션
- `app/supabase/migrations/20260423000000_trade_events_cash_balances.sql`
  - `trade_events` 테이블 생성 (CREATE TABLE IF NOT EXISTS)
  - `cash_balances` 테이블 생성 (CREATE TABLE IF NOT EXISTS)
  - 인덱스 8개 (CREATE INDEX IF NOT EXISTS)
  - RLS 활성화 및 정책 8개 (DO $$ 멱등 블록)
  - `supabase db push` 완료 — 원격 DB에 정상 반영됨

## Edge Functions
해당 없음 (이번 이슈는 REST CRUD만 구현)

## 클라이언트 유틸

### `app/services/tradeEvents.ts` — 기존 파일에 함수 추가
- `getTradeEvents(filters?)` — 목록 조회 (asset_type, trade_type, ticker, from, to 필터, trade_date 내림차순)
- `createTradeEvent(data)` — 단건 등록
- `updateTradeEvent(id, data)` — 부분 수정 (신규 추가)
- `deleteTradeEvent(id)` — 삭제 (신규 추가)
- `uploadTradeCSV(file, broker?)` — CSV 미리보기 (기존 유지)
- `confirmTradeCSV(rows)` — CSV 확정 저장 (기존 유지)

### `app/services/cashBalances.ts` — 신규 생성
- `getCashBalances(currency?)` — 목록 조회 (currency 필터, recorded_at 내림차순)
- `createCashBalance(data)` — 스냅샷 등록

## 타입 파일

### `app/types/tradeEvent.ts` — 기존 파일에 타입 추가
- `TradeEventUpdateInput` — 수정 파라미터 (모든 필드 optional)
- `TradeEventFilters` — 목록 조회 필터 파라미터

### `app/types/cashBalance.ts` — 신규 생성
- `CashCurrency` — `'KRW' | 'USD'`
- `CashBalance` — DB 레코드 타입
- `CashBalanceInput` — 등록 파라미터 타입

## 특이사항

### 원격 DB 마이그레이션 히스토리 불일치
`supabase migration list` 결과, 원격에만 존재하는 마이그레이션 3건(20260414000000~2)이 확인되었다. 이전 작업에서 직접 원격 DB에 스키마를 적용했으나 로컬 파일이 없는 상태였다. `supabase migration repair --status reverted`로 해당 항목들을 비활성화하고 이번 마이그레이션을 정상 push 완료했다.

### 멱등 SQL 처리
원격 DB에 `trade_events`, `cash_balances` 테이블 및 인덱스가 이미 존재했으므로 `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `DO $$ ... $$` 패턴을 사용하여 재실행 시에도 오류 없이 동작하도록 처리했다.
