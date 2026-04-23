# 백엔드 통합 테스트

## 테스트 환경
- Supabase URL: wxznscebhpkfspwphbdv.supabase.co
- 테스트 파일: app/tests/integration/trade-events-cash-balances-crud.test.ts

## 테스트 결과

| 테스트 케이스 | 결과 | 비고 |
|---|---|---|
| **trade_events CREATE** | | |
| 필수 필드 모두 제공 시 레코드 생성 성공 및 id 반환 | 통과 | |
| 선택 필드(fee, tax) 생략 시에도 등록 성공 | 통과 | fee_currency는 NOT NULL이므로 포함 필요 확인 |
| 잘못된 asset_type(CHECK 위반) 시 에러 반환 | 통과 | |
| 잘못된 trade_type(CHECK 위반) 시 에러 반환 | 통과 | |
| 미인증 상태에서 INSERT 시 RLS 차단 | 통과 | |
| **trade_events READ** | | |
| 등록된 레코드 목록 조회 성공 | 통과 | |
| asset_type 필터: 지정 타입만 반환 | 통과 | |
| ticker 필터: 정확한 종목만 반환 | 통과 | |
| from/to 날짜 필터: 범위 내 데이터만 반환 | 통과 | |
| 미인증 상태에서 SELECT 시 RLS 차단 | 통과 | |
| **trade_events UPDATE** | | |
| 부분 업데이트: 지정 필드만 변경되고 나머지 유지 | 통과 | |
| 존재하지 않는 id 업데이트 시 null 반환 | 통과 | |
| 다른 유저의 레코드 업데이트 시 RLS 차단 | 통과 | |
| **trade_events DELETE** | | |
| 본인 레코드 삭제 성공 | 통과 | |
| 다른 유저의 레코드 삭제 시 RLS 차단 (원본 유지) | 통과 | |
| **cash_balances CREATE** | | |
| KRW 잔액 등록 성공 및 id 반환 | 통과 | |
| USD 잔액 등록 성공 | 통과 | |
| recorded_at 명시적 지정 시 해당 값으로 저장 | 통과 | DB 반환 포맷(+00:00 vs Z) 고려하여 UTC 밀리초 비교 |
| 잘못된 currency(CHECK 위반) 시 에러 반환 | 통과 | |
| 미인증 상태에서 INSERT 시 RLS 차단 | 통과 | |
| **cash_balances READ** | | |
| 등록된 잔액 목록 조회 성공 및 recorded_at 내림차순 정렬 | 통과 | |
| currency 필터: KRW만 조회 시 USD 미포함 | 통과 | |
| 미인증 상태에서 SELECT 시 RLS 차단 | 통과 | |
| **RLS 격리** | | |
| 유저 A의 cash_balance가 유저 B에게 보이지 않음 | 통과 | |

**전체: 24개 통과 / 0개 실패**

## 수정 내역

### Cycle 1 (최초 실행 후 수정)

- `trade-events-cash-balances-crud.test.ts`: `fee_currency` NOT NULL 제약 확인 — DB 스키마가 NOT NULL이므로 해당 테스트의 입력 데이터에 `fee_currency: 'KRW'` 추가. `TradeEventInput` 타입 정의의 optional 선언과 실제 DB 제약 간 불일치 발견 (타입 정의 버그이나 이슈 범위 외).
- `trade-events-cash-balances-crud.test.ts`: `recorded_at` 포맷 불일치 — Supabase가 `+00:00` 형식으로 반환하므로 문자열 동등 비교 대신 `new Date().getTime()` UTC 밀리초 비교로 수정.

## 발견된 부가 사항

- `TradeEventInput.fee_currency` 타입이 `optional`로 정의되어 있으나 실제 DB 컬럼은 NOT NULL. 타입 정의와 스키마 간 불일치. 서비스 레이어에서 런타임 오류가 발생할 수 있으므로 별도 이슈로 추적 권장.

## 최종 결과
통과