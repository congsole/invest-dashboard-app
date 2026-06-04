# 백엔드 통합 테스트

## 테스트 환경
- Supabase URL: wxznscebhpkfspwphbdv.supabase.co
- 테스트 파일: app/tests/integration/012-stock-search-data-layer.test.ts

## 마이그레이션 적용

테스트 전 다음 두 마이그레이션이 remote에 미적용 상태였다:
- `20260602000001_memo_crud.sql` — 이미 수동 적용된 상태였으므로 `migration repair --status applied`로 처리
- `20260602000002_stock_search_data_layer.sql` — `supabase db push`로 정상 적용 완료

## 테스트 결과

| 그룹 | 테스트 케이스 | 결과 | 비고 |
|------|-------------|------|------|
| stocks 읽기 | 인증된 사용자가 stocks를 SELECT하면 데이터가 반환된다 | 통과 | |
| stocks 읽기 | sectors join으로 stocks를 조회할 수 있다 | 통과 | |
| stocks 읽기 | 미인증 사용자는 stocks SELECT 불가 | 통과 | |
| RLS 쓰기 | 인증된 일반 사용자는 stocks에 직접 INSERT 불가 | 통과 | |
| RLS 쓰기 | 인증된 일반 사용자는 stocks UPDATE시 영향행 0건 (RLS 차단) | 통과 → 수정 완료 | Cycle 1 수정 |
| RLS 쓰기 | service_role은 stocks INSERT 가능 | 통과 | |
| RLS 쓰기 | service_role은 stocks UPDATE 가능 | 통과 | |
| 로컬 검색 | ticker ilike 검색으로 종목을 찾을 수 있다 | 통과 | |
| 로컬 검색 | name ilike 검색으로 종목을 찾을 수 있다 | 통과 | |
| 로컬 검색 | is_active=true 필터로 비활성 종목은 검색되지 않는다 | 통과 | |
| 로컬 검색 | market 필터로 US 종목만 검색된다 | 통과 | |
| 로컬 검색 | 검색어 1자 미만 시 조건 단위 검증 | 통과 | |
| 로컬 검색 | 2자 이상 검색어로 ilike 검색이 동작한다 | 통과 | |
| getStock | ticker + market으로 종목 단건 조회 성공 | 통과 | |
| getStock | KR market 종목 단건 조회 성공 | 통과 | |
| getStock | CRYPTO market 종목 단건 조회 성공 | 통과 | |
| getStock | 존재하지 않는 종목 조회 시 null 반환 | 통과 | |
| getStock | 같은 ticker라도 다른 market이면 별개 종목 조회 | 통과 | |
| get_or_recommend RPC | 미인증 사용자는 RPC 호출 불가 | 통과 | |
| get_or_recommend RPC | 잘못된 market 값 전달 시 에러 반환 | 통과 | |
| get_or_recommend RPC | CRYPTO market: CRYPTO 섹터(id=12) 자동 추천 | 통과 | |
| get_or_recommend RPC | KR market: naver_industry 있으면 kr_sector_map 기반 추천 | 통과 | |
| get_or_recommend RPC | KR market: naver_industry 미전달 시 sector_id null | 통과 | |
| get_or_recommend RPC | US market: GICS code로 섹터 매핑 | 통과 | |
| get_or_recommend RPC | 기존 종목 조회 시 is_new=false 반환 | 통과 | |
| 스키마 검증 | market 컬럼은 KR/US/CRYPTO 값만 허용 (CHECK 제약) | 통과 | |
| 스키마 검증 | market/currency/is_active 컬럼 올바르게 저장됨 | 통과 | |
| 스키마 검증 | (ticker, market) UNIQUE 제약 — 중복 삽입 불가 | 통과 | |
| 스키마 검증 | 같은 ticker라도 다른 market이면 삽입 가능 | 통과 | |

**전체: 29개 통과 / 0개 실패**

## 수정 내역

### Cycle 1
- `012-stock-search-data-layer.test.ts`: "인증된 일반 사용자 stocks UPDATE 불가" 테스트 기대값 수정

  **원인**: Supabase/PostgreSQL RLS 동작 방식 — UPDATE 정책이 없을 때 에러가 아닌 "영향받은 행 0건"으로 처리된다. using 조건을 만족하는 행이 없는 것으로 간주되어 에러 없이 빈 결과를 반환.

  **수정**: `expect(error).not.toBeNull()` → `expect(data).toHaveLength(0)` (0건 업데이트로 검증)

## 사전 의존성 — 수동 확인 필요 항목

다음 항목은 자동 검증 불가 (FastAPI 서버 미구성):
- `EXPO_PUBLIC_FASTAPI_BASE_URL` 환경변수 설정 필요
- FastAPI 서버 `/stocks/search` 엔드포인트 구현 필요
- FastAPI 서버 `PATCH /stocks/{id}/sector` 엔드포인트 구현 필요

## 최종 결과
통과
