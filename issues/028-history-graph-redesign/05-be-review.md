# 백엔드 코드 리뷰

## Initial Review
**결과**: 합격 (이슈 0건)

**검토 대상**
- `app/supabase/migrations/20260611000000_history_markers_dividend_only.sql`

**검토 항목별 결과**

- [x] **DROP 시그니처 정확성**: `drop function if exists public.get_history_markers(date, date)` — 원본 함수(`20260427000001_account_events_rpc.sql`)의 시그니처 `get_history_markers(p_from date, p_to date)`와 정확히 일치. IF EXISTS로 안전하게 처리.
- [x] **보안 속성 유지**: 원본과 동일하게 `security definer` + `set search_path = public` 적용. 사전 마이그레이션 전체를 grep하여 함수에 대한 별도 `GRANT EXECUTE` 없음을 확인 — 신규 함수에도 별도 grant 불필요.
- [x] **API 명세 일치**: api-spec.md 라인 637 호출 방식(`supabase.rpc('get_history_markers', {})`) 및 반환 타입(`event_date`, `event_type: 'dividend'`, `amount_krw`)이 마이그레이션 RETURNS TABLE 정의와 일치.
- [x] **필터 정확성**: `event_type = 'dividend'` 단일 필터 적용. 날짜 범위 조건 제거. 명세의 "배당 마커만, 전체 기간" 요건 충족.
- [x] **KRW 환산 로직**: `fx_rate_at_event` 우선 → 당일 `fx_rates` 조회 → fallback 1300. 원본과 동일하게 유지.
- [x] **인증 처리**: `auth.uid()` null 체크 후 `raise exception 'Unauthorized'` — 미인증 호출 차단 정상.
- [x] **마이그레이션 타임스탬프**: `20260611000000` — 직전 `20260610070000`과 중복 없이 순서 보장.
- [x] **RLS**: `security definer` 함수 내부에서 `where ae.user_id = v_user_id`로 사용자 격리 처리. `account_events` 테이블 RLS와 이중 보호.

**이슈 목록**: 없음

## 최종 결과
합격

## services/types 레이어 리뷰 노트
FE 트랙 충돌 방지를 위해 직접 수정 불가. 확인된 내용만 기록.

- `app/services/dashboard.ts` — `getHistoryMarkers()` 파라미터 제거 및 `supabase.rpc('get_history_markers', {})` 호출: 구현 정상. 에러 처리(`if (error) throw error`) 존재.
- `app/types/dashboard.ts` — `HistoryMarker.event_type: 'dividend'` 리터럴 타입: 마이그레이션 반환값과 일치. 문제 없음.
