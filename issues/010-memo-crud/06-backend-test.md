# 백엔드 통합 테스트

## 테스트 환경
- Supabase URL: wxznscebhpkfspwphbdv.supabase.co
- 테스트 파일: app/tests/integration/010-memo-crud.test.ts

## 사전 작업
- 마이그레이션 `20260602000001_memo_crud.sql` 미적용 상태였음
- `supabase db query --linked -f app/supabase/migrations/20260602000001_memo_crud.sql` 로 적용

## 테스트 결과

| 테스트 케이스 | 결과 | 비고 |
|-------------|------|------|
| 본문만 있는 메모를 생성하면 id와 body가 반환된다 | 통과 | |
| 종목 연결 + goal_price 포함하여 메모를 생성하면 stocks 배열에 종목 정보가 반환된다 | 통과 | |
| 섹터 연결하여 메모를 생성하면 sectors 배열에 섹터 정보가 반환된다 | 통과 | |
| 종목 + 섹터 동시 연결 메모를 생성하면 두 배열 모두 채워진다 | 통과 | |
| 메모 상세 조회 시 연결된 종목과 섹터 정보가 포함된다 | 통과 | |
| 메모 수정 시 본문과 연결이 교체된다 | 통과 | |
| 메모 삭제 시 연결된 junction 레코드도 cascade 삭제된다 | 통과 | |
| 빈 문자열 body로 메모 생성 시 에러가 반환된다 | 통과 | |
| 공백만 있는 body로 메모 생성 시 에러가 반환된다 | 통과 | |
| 미인증 사용자는 create_memo_with_links 호출 불가 | 통과 | |
| 미인증 사용자는 memos SELECT 불가 | 통과 | |
| 오늘 날짜로 날짜 범위 필터 시 생성된 메모가 포함된다 | 통과 | |
| 미래 날짜 범위 필터 시 메모가 없다 | 통과 | |
| p_stock_id 필터 시 해당 종목이 직접 연결된 메모만 반환된다 | 통과 | |
| p_sector_id 필터 시 해당 섹터가 연결된 메모만 반환된다 | 통과 | |
| p_no_links = true 시 아무 연결도 없는 메모만 반환된다 | 통과 | |
| p_limit = 1, p_offset = 0이면 1개 메모만 반환되고 total_count는 전체 수 | 통과 | |
| p_limit = 1, p_offset = 1이면 두 번째 메모가 반환된다 | 통과 | |
| p_limit > 100 시 에러가 반환된다 | 통과 | |
| 미인증 사용자는 list_memos 호출 불가 | 통과 | |
| 종목 연결 추가 후 memo_stocks에 레코드가 생성된다 | 통과 | |
| 종목 연결 해제 후 memo_stocks에서 레코드가 삭제된다 | 통과 | |
| 섹터 연결 추가 후 memo_sectors에 레코드가 생성된다 | 통과 | |
| 섹터 연결 해제 후 memo_sectors에서 레코드가 삭제된다 | 통과 | |
| 다른 유저는 타인의 memo_sectors에 INSERT 불가 | 통과 | |
| 매매이벤트 + 메모를 동시 생성하면 event와 memo 모두 반환된다 | 통과 | |
| p_memo_body = null이면 event만 생성되고 memo는 null이다 | 통과 | |
| p_memo_body = 빈 문자열이면 에러가 반환된다 | 통과 | |
| event_type이 buy/sell이 아니면 에러가 반환된다 | 통과 | |
| 미인증 사용자는 create_trade_event_with_memo 호출 불가 | 통과 | |
| 생성된 메모는 memo_trade_events에 event_id가 연결되어 있다 | 통과 | |
| p_include_trade_events = true 시 매매이벤트로 연결된 메모도 포함된다 | 통과 | |
| p_include_trade_events = false 시 직접 연결된 메모만 반환된다 | 실패 → 수정 완료 | 아래 수정 내역 참조 |

**전체: 33개 통과 / 0개 실패**

## 수정 내역

### Cycle 1
- `010-memo-crud.test.ts`: TypeScript null 체크 오류 2건 수정 (`u2.user.id` → `u2.user!.id`, `s.id` → `s!.id`)

### Cycle 2
- `010-memo-crud.test.ts`: `p_include_trade_events = false` 테스트 시나리오 수정
  - 원인: `create_trade_event_with_memo`는 stocks 마스터에 종목이 있으면 `memo_stocks`에도 자동 연결한다. 기존 테스트에서 동일 ticker로 stocks 마스터를 등록해 두어 `memoViaEvent`에도 직접 연결이 생겼음
  - 수정: adminClient로 account_events를 직접 insert하고 `create_memo_with_links`에서 `p_trade_event_ids`로 연결하는 방식으로 변경. `memo_stocks` 직접 연결 없이 `memo_trade_events`만 연결된 메모를 생성

## 최종 결과
통과
