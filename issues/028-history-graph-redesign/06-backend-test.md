# 백엔드 통합 테스트

## 테스트 환경
- 대상: 로컬 Supabase (supabase db reset 후 전체 스위트)
- 신규 테스트 파일: app/tests/integration/028-history-markers-dividend-only.test.ts
- 갱신 테스트 파일: app/tests/integration/007-account-events.test.ts (get_history_markers RPC 블록 — 구 시그니처 → 신 시그니처)
- 원격 push: 완료 (20260611000000_history_markers_dividend_only.sql)

## 테스트 결과

| 테스트 케이스 | 결과 | 비고 |
|-------------|------|------|
| 파라미터 없이 호출 시 성공 (에러 없음, 배열 반환) | ✅ 통과 | |
| 배당 이벤트(KRW) 반환 — event_date/event_type/amount_krw 구조 | ✅ 통과 | |
| withdraw 이벤트가 있어도 반환되지 않음 | ✅ 통과 | 이슈 028 핵심 변경 |
| 배당과 출금이 함께 있을 때 배당만 반환 | ✅ 통과 | |
| 전체 기간 조회 — 과거(2020년) 배당도 반환됨 | ✅ 통과 | p_from/p_to 제거 확인 |
| USD 배당 — fx_rate_at_event로 KRW 환산 | ✅ 통과 | 100 USD * 1400 = 140,000 KRW |
| USD 배당 — fx_rate_at_event 없으면 fallback 1300 적용 | ✅ 통과 | 50 USD * 1300 = 65,000 KRW |
| 미인증(anon) 상태에서 호출 시 에러 반환 | ✅ 통과 | |
| 유저1 배당 마커를 유저2가 조회하면 포함되지 않음 (RLS) | ✅ 통과 | |
| 007 기존 테스트: 미인증 에러 반환 (신 시그니처) | ✅ 통과 | 구 p_from/p_to → 파라미터 없음 갱신 |
| 007 기존 테스트: 배당 마커 반환 검증 (신 시그니처) | ✅ 통과 | |
| 007 기존 테스트: withdraw 마커 미포함 (신 시그니처) | ✅ 통과 | |
| 007 기존 테스트: buy 마커 미포함 (신 시그니처) | ✅ 통과 | |
| 007 기존 테스트: 전체 기간 조회 — 과거 배당 반환 | ✅ 통과 | |

**전체 스위트: 290개 통과 / 0개 실패 (13개 테스트 스위트)**

## 수정 내역

### 사전 갱신 (구 시그니처 테스트 제거)
- `app/tests/integration/007-account-events.test.ts`: `get_history_markers RPC` describe 블록 전체 교체
  - 구 시그니처 `rpc('get_history_markers', { p_from, p_to })` → `rpc('get_history_markers')` (파라미터 없음)
  - "배당/출금 이벤트 마커 반환 검증" 테스트: withdraw 반환 검증 제거, 배당 반환만 검증
  - "기간 외 이벤트는 마커에 포함되지 않음" 테스트: "전체 기간 조회 — 과거 배당도 반환됨"으로 의미 반전 갱신
  - "buy 이벤트는 마커에 포함되지 않음" 테스트: 파라미터 없는 호출로 변경

### 신규 테스트 (이슈 028 전용)
- `app/tests/integration/028-history-markers-dividend-only.test.ts` 신규 작성
  - 이슈 028 변경 전 항목 모두 포함 (파라미터 없는 호출, withdraw 미포함, 전체 기간, KRW 환산, 미인증 차단, RLS)

## 최종 결과
통과
