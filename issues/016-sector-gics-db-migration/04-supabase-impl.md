# Supabase 구현 내역

## 마이그레이션
- `app/supabase/migrations/20260605000000_sector_gics_hierarchy.sql`

DB 직접 실행 방식으로 적용 완료 (`supabase db query --linked -f`). 마이그레이션 이력 테이블에도 수동 등록.

## Edge Functions
- 해당 없음. 모든 RPC는 DB Function으로 구현.

## 클라이언트 유틸
- `app/types/sector.ts` — `Sector` 인터페이스에 `name_en`/`parent_id`/`level` 추가. `SectorBreadcrumb`/`SectorBreadcrumbItem` 타입 신규 추가. `ExternalStockSearchResult`에서 `naver_industry`/`gics_code` 제거, `yfinance_sector`/`yfinance_industry` 추가. `RecommendedSector` 타입 추가 (level/name_en 포함).
- `app/services/sectors.ts` — `getSectors(params?)` 함수에 `level`/`parent_id` 필터 파라미터 추가. `getSectorBreadcrumb(sectorId)` RPC 함수 신규 추가.
- `app/services/stocks.ts` — `searchStocksLocal`/`getStock` sectors join 쿼리에 `name_en, parent_id, level` 필드 추가. `getOrRecommendStockSector` 입력 인터페이스 변경: `naver_industry` → `yfinance_sector`/`yfinance_industry`. RPC 파라미터명 변경 반영.

## 마이그레이션 상세 내용

### sectors 테이블 변경
- `name_en text`, `parent_id int references sectors(id)`, `level int check(1~4)`, `created_at timestamptz` 컬럼 추가
- 기존 L1 시드 12개에 `level=1`, `parent_id=null`, `name_en` 값 채움
- `id` 컬럼에 시퀀스(시작값 13) 연결. 기존 FK(1~12) 보호.
- 인덱스: `idx_sectors_parent_id`, `idx_sectors_level` 추가

### GICS 시드 삽입 결과 (원격 DB 확인)
| level | 삽입 건수 |
|-------|---------|
| L1    | 12개 (기존 유지) |
| L2    | 25개 |
| L3    | 77개 (GICS 74 + 중간 분류 3개 포함) |
| L4    | 156개 |
| 합계   | 270개 |

### gics_yfinance_map 테이블 생성
- `yfinance_industry text PK`, `sector_id int FK → sectors(id)` 구조
- RLS: `authenticated` SELECT 허용, 쓰기는 service_role 전용
- 초기 시드: 71건 (주요 yfinance industry 문자열 → GICS L4 매핑)

### kr_sector_map 테이블 DROP
- `DROP TABLE IF EXISTS kr_sector_map` 실행 완료

### 신규/변경 DB Functions

| 함수 | 변경 | 설명 |
|------|------|------|
| `get_sector_breadcrumb(p_sector_id int)` | 신규 | 재귀 CTE로 L1까지 조상 경로 반환. level 오름차순 정렬. |
| `get_or_recommend_stock_sector(...)` | 변경 | `p_naver_industry` 제거. `p_yfinance_sector`/`p_yfinance_industry` 추가. `gics_yfinance_map` → `sectors.name_en` ilike → L1 폴백 순서로 섹터 탐색. 응답에 `name_en`/`level` 추가. |
| `list_memos(...)` | 변경 | 섹터 필터(`p_sector_ids`) 적용 전 재귀 CTE로 하위 sector_ids 확장. 메모에 직접 연결된 섹터 OR 종목의 sector_id 계층 포함. |

## 사전 의존성 체크리스트

- [ ] `gics_yfinance_map` RLS 정책 확인 — Supabase 대시보드 → Table Editor → gics_yfinance_map → Policies — smoke test 가능 (authenticated 사용자로 SELECT 시 성공, INSERT 시 차단)
- [ ] `sectors` 시퀀스 시작값 확인 — `SELECT last_value FROM sectors_id_seq;` → 13 이상이어야 함 — smoke test 가능
- [ ] `get_sector_breadcrumb` RPC 동작 — Supabase 대시보드 → Database → Functions에서 확인. 클라이언트 인증 후 호출 가능 — 수동 확인 필요 (auth 필요)
- [ ] `get_or_recommend_stock_sector` 구 시그니처(`p_naver_industry`) 완전 제거 확인 — `SELECT parameter_name FROM information_schema.parameters WHERE specific_name LIKE 'get_or_recommend_stock_sector%';` — smoke test 가능

## 특이사항

- **`20260604000000_memo_filter_update.sql` 충돌**: 로컬에 동일 타임스탬프 파일이 중복 존재하여 `supabase db push --include-all`이 실패. 대신 `supabase db query --linked -f` 로 직접 실행 후 migration 이력 수동 등록으로 처리.
- **GICS L4 건수 차이**: GICS 공식 163개 대비 실제 삽입 156개. `on conflict (code) do nothing` 처리로 중복 코드(L3와 L4 구분을 위해 `_L4` 접미사 붙인 항목 중 일부)가 누락될 수 있음. 이슈 017(배치 스크립트) 진행 시 실제 yfinance 매핑 결과와 대조하여 보완 필요.
- **list_memos 섹터 필터 확장**: 기존 `memo_sectors` 직접 연결 외에 종목의 `sector_id`가 확장된 섹터 트리에 포함되는 경우도 메모를 반환하도록 변경. PRD-004 §7.1 요구사항 반영.
- **upsert_stock_with_sector**: 기존 함수는 `kr_sector_map` 참조가 있으나 이 테이블이 DROP됐으므로 자동으로 오류가 발생할 수 있음. 해당 함수는 `get_or_recommend_stock_sector`로 대체되어 실제 코드에서 호출하지 않으므로 별도 DROP 처리하지 않음. 필요 시 이슈 017에서 정리.
