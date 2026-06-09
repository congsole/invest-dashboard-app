# 백엔드 통합 테스트

## 테스트 환경
- Supabase URL: wxznscebhpkfspwphbdv.supabase.co
- 테스트 파일: app/tests/integration/024-user-category-crud.test.ts

## 테스트 결과

| # | 테스트 케이스 | 결과 | 비고 |
|---|------------|------|------|
| 1 | 유효한 이름으로 카테고리를 생성하면 id와 name이 반환된다 | 통과 | |
| 2 | 카테고리 목록 조회 시 본인 카테고리가 포함된다 | 통과 | |
| 3 | 카테고리 이름을 수정하면 변경된 이름이 반환된다 | 통과 | |
| 4 | 카테고리를 삭제하면 목록에서 사라진다 | 통과 | |
| 5 | 동일 사용자가 같은 이름으로 두 번 생성하면 23505 에러가 반환된다 | 통과 | UNIQUE(user_id, name) |
| 6 | 다른 사용자는 동일한 이름으로 카테고리를 생성할 수 있다 | 통과 | |
| 7 | 카테고리에 종목을 추가하면 stocks 조인 결과가 반환된다 | 통과 | |
| 8 | 카테고리 종목 목록 조회 시 추가한 종목이 포함된다 | 통과 | |
| 9 | 카테고리에서 종목을 제거하면 목록에서 사라진다 | 통과 | |
| 10 | 종목 추가 후 카테고리 목록의 종목 수(count)가 1 증가한다 | 통과 | |
| 11 | 동일 category_id + stock_id를 다시 추가하면 23505 에러가 반환된다 | 통과 | 복합 PK 중복 |
| 12 | 미인증 사용자는 user_categories SELECT 불가 (빈 배열 반환) | 통과 | RLS |
| 13 | 미인증 사용자는 user_categories INSERT 불가 | 통과 | RLS |
| 14 | 유저 B는 유저 A의 카테고리를 조회할 수 없다 | 통과 | RLS |
| 15 | 유저 B는 유저 A의 카테고리를 수정할 수 없다 | 통과 | RLS |
| 16 | 유저 B는 유저 A의 카테고리를 삭제할 수 없다 | 통과 | RLS |
| 17 | 유저 B는 유저 A 카테고리의 종목을 조회할 수 없다 | 통과 | RLS (category_id 경유) |
| 18 | 유저 B는 유저 A 카테고리에 종목을 추가할 수 없다 | 통과 | RLS (category_id 경유) |
| 19 | 카테고리 삭제 시 user_category_stocks 레코드가 cascade 삭제된다 | 통과 | CASCADE |
| 20 | memo_categories 테이블에 SELECT 쿼리가 성공한다 (빈 결과 허용) | 통과 | 테이블 존재 확인 |
| 21 | memo_categories에 잘못된 FK로 INSERT 시 에러가 반환된다 | 통과 | FK 제약 |

**전체: 21개 통과 / 0개 실패**

## 수정 내역

### Cycle 1
- `app/tests/integration/024-user-category-crud.test.ts`: `createTestStock` 헬퍼의 `stocks` INSERT 컬럼을 실제 스키마에 맞게 수정. `asset_type` 컬럼이 존재하지 않으며 실제 컬럼은 `market`, `currency`, `is_active`. `asset_type` → `market: 'KR', currency: 'KRW'` 로 교체.

## 수동 확인 필요

- Supabase Dashboard → Authentication > Policies 에서 아래 테이블의 RLS 정책 적용 여부 육안 확인:
  - `user_categories` (4개 정책: SELECT/INSERT/UPDATE/DELETE)
  - `user_category_stocks` (3개 정책: SELECT/INSERT/DELETE)
  - `memo_categories` (3개 정책: SELECT/INSERT/DELETE)

## 최종 결과
통과
