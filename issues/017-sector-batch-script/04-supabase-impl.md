# Supabase 구현 내역

## 마이그레이션
해당 없음 — 이 이슈는 DB 스키마 변경 없이 스크립트 레이어만 변경한다.
선행 이슈 016에서 `sectors` 계층 구조와 `gics_yfinance_map` 시드가 적용된 상태를 전제한다.

## Edge Functions
해당 없음.

## 배치 스크립트

### `scripts/sync_stocks.py`

PRD-004 GICS 계층화를 반영하여 `scripts/seed_stocks.py`를 대체하는 신규 스크립트.

**실행 방법**

```bash
# 전체 초기 적재
python3 scripts/sync_stocks.py

# 월간 cron 모드 (sector_id is null 종목만 재시도)
python3 scripts/sync_stocks.py --cron
```

**환경변수 (아래 순서로 탐색)**
1. 셸 환경변수: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
2. `app/.env.local`: `EXPO_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_KEY`

**구현된 함수**

| 함수 | 설명 |
|------|------|
| `SectorResolver` | gics_yfinance_map + sectors 테이블 전체 캐시 로드 후, yfinance sector/industry → sector_id 결정 |
| `SectorResolver.resolve(sector, industry)` | 1) gics_yfinance_map 정확 매칭 → 2) sectors.name_en ilike 매칭 → 3) L1 매칭 → 4) None |
| `fetch_kr_stocks()` | pykrx로 KOSPI + KOSDAQ 전종목 수집. `kr_market_type` 키 포함 (suffix 결정용) |
| `fetch_us_stocks()` | GitHub rreichel3/US-Stock-Symbols에서 NYSE + NASDAQ 수집 |
| `fetch_crypto_stocks()` | Upbit KRW 마켓 수집. sector_id=12(CRYPTO) 고정 |
| `fetch_and_resolve_sector(ticker, market, kr_market_type, resolver)` | KOSPI → `.KS`, KOSDAQ → `.KQ` suffix 결정 후 yfinance 조회 → sector_id 반환 |
| `run_sector_fill(stocks, resolver, kr_market_map)` | stocks 목록 순회 → yfinance 조회 → DB 업데이트. 0.5~1초 rate limit 인터벌. 실패 시 null 유지. |
| `run_full(resolver)` | 전체 적재 모드: 수집 → upsert → sector_id 일괄 채우기 |
| `run_cron(resolver)` | cron 모드: sector_id is null 종목만 재시도 |
| `upsert_stocks(rows)` | stocks 테이블 배치 upsert (on_conflict=ticker,market) |
| `update_stock_sector(stock_id, sector_id)` | stocks.sector_id 단건 PATCH |

### `scripts/requirements.txt`

```
pykrx>=1.0.45
yfinance>=0.2.36
httpx>=0.27.0
```

## 클라이언트 유틸
해당 없음 (배치 스크립트는 앱 외부 레이어).

## 사전 의존성 체크리스트

- [ ] 이슈 016 마이그레이션 완료 — `sectors` L1~L4 시드 및 `gics_yfinance_map` 시드가 DB에 존재해야 함 — `SectorResolver` 초기화 시 테이블 행 수로 확인 가능
- [ ] Python 3.11+ 환경 — `python3 --version` 확인
- [ ] `pip install -r scripts/requirements.txt` 완료 — pykrx, yfinance, httpx 설치 여부 확인
- [ ] Supabase service_role key — `SUPABASE_SERVICE_ROLE_KEY` 또는 `app/.env.local`의 `SUPABASE_SERVICE_KEY` 설정 필요 — 수동 확인 필요
- [ ] stocks 테이블 RLS — service_role로 PATCH 가능해야 함 — smoke test: `update_stock_sector` 호출 결과 확인 가능

## 특이사항

### seed_stocks.py와의 관계
`scripts/seed_stocks.py`는 네이버 금융 API 기반 구버전 스크립트다. PRD-004 이후에는 `sync_stocks.py`가 대체 스크립트이며, `seed_stocks.py`는 제거하거나 deprecated 주석을 추가할 수 있다.

### KOSPI/KOSDAQ suffix 처리
`stocks.market = 'KR'`만으로는 KOSPI/KOSDAQ 구분이 불가하므로, pykrx로 시장 목록 조회 시 `kr_market_type` 키를 임시로 row에 추가한다. upsert 전 `_strip_internal_keys()`로 제거한다.

cron 모드에서는 DB에 저장된 kr_market_type 정보가 없으므로 pykrx를 재조회하여 복원한다. pykrx 미설치 환경에서는 .KS를 기본값으로 사용한다 (yfinance가 .KS 조회 실패 시 .KQ를 시도하는 경우가 있으나, 보장되지 않음 — KOSDAQ 종목 누락 가능성 있음).

### yfinance rate limit
0.5~1초 랜덤 인터벌을 적용한다. 전체 KR+US 종목(~수만 건)에 대해 일괄 조회 시 수 시간 소요 예상. 실패 종목은 sector_id=null로 유지되며, 다음 cron 주기에 자동 재시도된다.

### gics_yfinance_map 미매칭 케이스
yfinance의 industry 문자열이 gics_yfinance_map에도 없고 sectors.name_en과도 일치하지 않는 경우 L1까지만 확정된다. 지속적으로 누락되는 industry 문자열은 `gics_yfinance_map`에 수동으로 추가하여 매핑 커버리지를 높인다.
