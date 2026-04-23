# 백엔드 코드 리뷰

## Initial Review
**결과**: 합격 — 이슈 0건

### 검토 항목별 결과

**SQL (마이그레이션)**
- 컬럼·타입·제약조건: db-schema.md와 완전 일치
- 인덱스 6개 (trade_events 4개, cash_balances 2개): 명세와 이름·대상 컬럼·방향 모두 일치
  - `idx_cash_balances_user_id_currency_recorded_at`: 명세의 `recorded_at DESC` 방향까지 정확히 반영
- RLS: 양쪽 테이블 모두 활성화, SELECT/INSERT/UPDATE/DELETE 4개 정책 적용
  - UPDATE 정책에 `USING` + `WITH CHECK` 이중 조건 적용 — 올바름
  - INSERT 정책에 `WITH CHECK`만 적용 (USING 불필요) — 올바름
- 멱등 패턴: `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `DO $$ ... $$` 블록으로 재실행 안전성 확보

**RLS 정책 상세**
- 모든 정책에서 `auth.uid() = user_id` 조건 사용, 명세와 일치
- SELECT: USING 조건으로 본인 데이터만 노출
- INSERT: WITH CHECK 조건으로 타인 user_id 삽입 차단
- UPDATE: USING + WITH CHECK 이중 조건으로 조회 및 변경 대상 모두 제한
- DELETE: USING 조건으로 타인 레코드 삭제 차단

**API 구현 완전성**
- 매매 이벤트 목록 조회 (`getTradeEvents`): 필터 5종 (asset_type, trade_type, ticker, from, to), trade_date 내림차순 정렬 — 명세 일치
- 매매 이벤트 등록 (`createTradeEvent`): `.select().single()` 패턴으로 삽입된 레코드 반환 — 명세 일치
- 매매 이벤트 수정 (`updateTradeEvent`): 부분 업데이트, result null 체크로 404 처리 — 명세 일치
- 매매 이벤트 삭제 (`deleteTradeEvent`): void 반환 — 명세 일치
- CSV 미리보기 (`uploadTradeCSV`): Edge Function `parse-trade-csv` 호출 — 명세 일치
- CSV 확정 저장 (`confirmTradeCSV`): Edge Function `confirm-trade-csv` 호출 — 명세 일치
- 예수금 목록 조회 (`getCashBalances`): currency 필터, recorded_at 내림차순 — 명세 일치
- 예수금 등록 (`createCashBalance`): `.select().single()` 패턴 — 명세 일치

**TypeScript 타입**
- `any` 미사용
- `TradeEvent`: 명세의 모든 필드 포함, 타입 정확
- `TradeEventInput`: 필수/선택 필드 구분 명세와 일치 (`fee`, `fee_currency`, `tax` optional)
- `TradeEventUpdateInput`: 모든 필드 optional — 부분 수정 패턴에 적합
- `TradeEventFilters`: 필터 파라미터 5종 모두 포함
- `CsvPreviewRow`, `CsvParseError`, `CsvPreviewResult`, `CsvConfirmResult`: 명세 응답 구조와 일치
- `CashBalance`, `CashBalanceInput`, `CashCurrency`: 명세와 완전 일치

**에러 처리**
- 모든 Supabase 호출에서 `if (error) throw error` 패턴 적용
- `updateTradeEvent`에서 result null 체크 추가 — RLS 위반 또는 존재하지 않는 ID 케이스 처리

**보안**
- SQL 인젝션: Supabase 클라이언트 메서드만 사용, 직접 SQL 문자열 없음 — 안전
- 권한 우회 가능성: 없음. 양쪽 테이블 모두 RLS 활성화, 쿼리에서 추가적인 user_id 필터 없이도 RLS가 자동으로 격리 보장

## 최종 결과
합격
