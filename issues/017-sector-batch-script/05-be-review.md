# 백엔드 코드 리뷰

## Initial Review

**결과**: 이슈 3건 (high 1, mid 1, low 1)

**이슈 목록**

- [high] `sync_stocks.py` — `_supabase_get`: 페이지네이션 미처리. Supabase REST 기본 row limit(1000)이 있어 `gics_yfinance_map`·`sectors` 전체 로드 및 `fetch_stocks_without_sector` 결과가 1000건 초과 시 truncated 데이터로 동작. `_load_gics_map`, `_load_sectors_name_en`, `fetch_stocks_without_sector` 모두 `_supabase_get` 경유이므로 일괄 수정 필요.
- [mid] `sync_stocks.py` — `run_full` 단계 번호 오류: 5단계임에도 `[1/4]`~`[4/4]` 출력 후 `[5/4]`가 출력됨. 진행 로그의 분모가 잘못되어 있음.
- [low] `sync_stocks.py` — `CRYPTO_SECTOR_ID = 12` 하드코딩: sectors 시드 재배포 시 깨질 수 있으나 04-supabase-impl.md에 "sectors.id = 12 (CRYPTO, L1 고정)"으로 명시되고 기존 시드 1~12 유지가 보장되므로 허용 범위. 별도 수정 불필요.

**검토 결과 이상 없는 항목**

- SectorResolver.resolve 우선순위: (1) gics_yfinance_map 정확 매칭 → (2) sectors.name_en ilike 매칭(L4 우선) → (3) L1 매칭 → (4) None. 04-supabase-impl.md 명세 및 기획서 §4.2와 일치.
- KOSPI/KOSDAQ suffix 처리: `kr_market_type == 'KOSDAQ'` → `.KQ`, 나머지 → `.KS`. pykrx에서 시장 구분 수집 후 `kr_market_map`으로 전달하는 구조 정확.
- cron 모드 KR suffix 복원: pykrx 재조회 우선, ImportError 시 `.KS` 기본값 사용하며 주석으로 KOSDAQ 누락 가능성 명시. 허용 가능한 설계.
- yfinance rate limit: `random.uniform(0.5, 1.0)` sleep, 실패 시 null 유지 후 다음 cron 재시도. 기획서 §5.4와 일치.
- 환경변수 탐색 순서: 셸 환경변수 우선 → `app/.env.local` 폴백. 04-supabase-impl.md와 일치.
- upsert_stocks: `on_conflict=ticker,market`, service_role 헤더 사용, 배치 500건. DB 스키마의 UNIQUE 제약 `uq_stocks_ticker_market`과 일치.
- update_stock_sector: PATCH 방식, 성공 코드 200/201/204 처리, 실패 시 RuntimeError 발생 후 run_sector_fill에서 catch하여 fail 카운트. 에러 처리 적절.
- `_strip_internal_keys`: upsert 전 `kr_market_type` 제거 확인. DB 컬럼에 없는 키 유출 방지 정상 동작.
- 사전 의존성: 이슈 016 마이그레이션(sectors 시드, gics_yfinance_map 시드) 필수임을 체크리스트로 명시.
- requirements.txt: pykrx>=1.0.45, yfinance>=0.2.36, httpx>=0.27.0 — 스크립트에서 사용하는 모든 외부 패키지 포함. 버전 하한 지정 적절.

---

## Cycle 1

**수정 내용**

- `sync_stocks.py` — `_supabase_get`: 단일 GET → offset/limit 기반 while 루프로 교체. 1000건 미만 페이지에서 루프 종료. `_load_gics_map`, `_load_sectors_l1`, `_load_sectors_name_en`, `fetch_stocks_without_sector` 모두 이 함수를 경유하므로 일괄 페이지네이션 적용됨.
- `sync_stocks.py` — `run_full` 단계 번호: `[1/4]`~`[5/4]` → `[1/5]`~`[5/5]` 수정.

**Confirmation 결과**: 합격

수정된 두 이슈 해결 확인. 신규 이슈 없음.
- `_supabase_get`이 `_PAGE_SIZE = 1000` 기준으로 `limit`/`offset`을 params에 추가하여 전체 결과를 누적 반환. 기존 호출부 시그니처 변경 없음.
- `run_full` 진행 로그 `[1/5]`~`[5/5]` 정상 출력 확인.

---

## 최종 결과

합격
