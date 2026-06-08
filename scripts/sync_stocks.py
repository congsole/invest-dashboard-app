"""
종목 배치 적재 스크립트 (PRD-004 GICS 계층화 반영)

소스:
  - 한국 주식: pykrx (KOSPI + KOSDAQ, 시장 구분 포함)
  - 미국 주식: GitHub rreichel3/US-Stock-Symbols
  - 암호화폐:  Upbit 공개 REST API (KRW 마켓)
  - 섹터:      yfinance sector + industry → gics_yfinance_map → sectors (L1~L4)

사용법:
  # 전체 적재 (초기)
  python3 scripts/sync_stocks.py

  # 월간 cron 모드: sector_id is null 종목 + 신규 상장 종목만 처리
  python3 scripts/sync_stocks.py --cron

환경변수 (아래 순서로 탐색):
  1. 셸 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
  2. app/.env.local: EXPO_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY
"""

import argparse
import os
import random
import time
from typing import Optional

import httpx

# ────────────────────────────────────────────
# 환경변수 로드
# ────────────────────────────────────────────

def _load_dotenv() -> dict[str, str]:
    env_path = os.path.join(os.path.dirname(__file__), '..', 'app', '.env.local')
    env: dict[str, str] = {}
    try:
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                key, _, val = line.partition('=')
                env[key.strip()] = val.strip()
    except FileNotFoundError:
        pass
    return env


def _resolve_env() -> tuple[str, str]:
    """(SUPABASE_URL, SERVICE_ROLE_KEY) 반환. 없으면 예외."""
    # 1. 셸 환경변수 우선
    url = os.environ.get('SUPABASE_URL') or os.environ.get('EXPO_PUBLIC_SUPABASE_URL')
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('SUPABASE_SERVICE_KEY')

    # 2. .env.local 폴백
    if not url or not key:
        dotenv = _load_dotenv()
        url = url or dotenv.get('EXPO_PUBLIC_SUPABASE_URL') or dotenv.get('SUPABASE_URL')
        key = key or dotenv.get('SUPABASE_SERVICE_KEY') or dotenv.get('SUPABASE_SERVICE_ROLE_KEY')

    if not url:
        raise EnvironmentError(
            'SUPABASE_URL (또는 EXPO_PUBLIC_SUPABASE_URL)이 설정되지 않았습니다.'
        )
    if not key:
        raise EnvironmentError(
            'SUPABASE_SERVICE_ROLE_KEY (또는 SUPABASE_SERVICE_KEY)가 설정되지 않았습니다.'
        )
    return url.rstrip('/'), key


SUPABASE_URL, SERVICE_KEY = _resolve_env()

HEADERS = {
    'apikey': SERVICE_KEY,
    'Authorization': f'Bearer {SERVICE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates,return=minimal',
}

CRYPTO_SECTOR_ID = 12  # sectors.id = 12 (CRYPTO, L1 고정)

# ────────────────────────────────────────────
# Supabase REST 헬퍼
# ────────────────────────────────────────────

_PAGE_SIZE = 1000


def _supabase_get(path: str, params: Optional[dict] = None) -> list[dict]:
    """Supabase REST GET. 1000건 단위로 페이지네이션하여 전체 결과 반환."""
    url = f'{SUPABASE_URL}/rest/v1/{path}'
    headers = {**HEADERS, 'Prefer': 'count=none'}
    base_params = dict(params or {})
    all_rows: list[dict] = []
    offset = 0

    while True:
        paged_params = {**base_params, 'limit': str(_PAGE_SIZE), 'offset': str(offset)}
        r = httpx.get(url, headers=headers, params=paged_params, timeout=30)
        r.raise_for_status()
        page = r.json()
        if not page:
            break
        all_rows.extend(page)
        if len(page) < _PAGE_SIZE:
            break
        offset += _PAGE_SIZE

    return all_rows


def upsert_stocks(rows: list[dict], batch_size: int = 500) -> int:
    """stocks 테이블에 배치 upsert. on_conflict=(ticker, market)"""
    url = f'{SUPABASE_URL}/rest/v1/stocks?on_conflict=ticker,market'
    all_keys = {'ticker', 'name', 'market', 'currency', 'is_active', 'sector_id'}

    seen: set[tuple[str, str]] = set()
    normalized: list[dict] = []
    for row in rows:
        key = (row['ticker'], row['market'])
        if key in seen:
            continue
        seen.add(key)
        normalized.append({k: row.get(k) for k in all_keys})

    print(f'  중복 제거 후: {len(normalized)}개')

    total = 0
    for i in range(0, len(normalized), batch_size):
        batch = normalized[i:i + batch_size]
        r = httpx.post(url, headers=HEADERS, json=batch, timeout=30)
        if r.status_code not in (200, 201):
            print(f'  ERROR batch {i}: {r.status_code} {r.text[:300]}')
        else:
            total += len(batch)
            print(f'  upsert {total}/{len(normalized)}')
    return total


def update_stock_sector(stock_id: str, sector_id: Optional[int]) -> None:
    """stocks.sector_id 단건 업데이트 (service_role)."""
    url = f'{SUPABASE_URL}/rest/v1/stocks?id=eq.{stock_id}'
    r = httpx.patch(
        url,
        headers={**HEADERS, 'Prefer': 'return=minimal'},
        json={'sector_id': sector_id},
        timeout=15,
    )
    if r.status_code not in (200, 201, 204):
        raise RuntimeError(
            f'sector_id 업데이트 실패 (stock_id={stock_id}): '
            f'{r.status_code} {r.text[:200]}'
        )

# ────────────────────────────────────────────
# gics_yfinance_map + sectors 캐시 로드
# ────────────────────────────────────────────

def _load_gics_map() -> dict[str, int]:
    """gics_yfinance_map 전체 로드. {yfinance_industry: sector_id}"""
    rows = _supabase_get('gics_yfinance_map', {'select': 'yfinance_industry,sector_id'})
    return {row['yfinance_industry']: row['sector_id'] for row in rows}


def _load_sectors_l1() -> dict[str, int]:
    """sectors Level-1 전체 로드. {name_en(소문자): sector_id}"""
    rows = _supabase_get(
        'sectors',
        {'select': 'id,name_en', 'level': 'eq.1', 'name_en': 'not.is.null'},
    )
    return {row['name_en'].lower(): row['id'] for row in rows if row.get('name_en')}


def _load_sectors_name_en() -> dict[str, int]:
    """sectors 전체(L1~L4) name_en → id 매핑. ilike 매칭용 fallback."""
    rows = _supabase_get(
        'sectors',
        {'select': 'id,name_en,level', 'name_en': 'not.is.null'},
    )
    # 낮은 레벨(L4)이 우선되도록 level 내림차순 정렬 후 삽입
    sorted_rows = sorted(rows, key=lambda r: r['level'], reverse=True)
    mapping: dict[str, int] = {}
    for row in sorted_rows:
        name_en = (row.get('name_en') or '').lower().strip()
        if name_en:
            mapping.setdefault(name_en, row['id'])
    return mapping

# ────────────────────────────────────────────
# sector_id 결정 로직
# ────────────────────────────────────────────

class SectorResolver:
    """gics_yfinance_map + sectors 테이블 기반 sector_id 결정기."""

    # yfinance sector name → GICS L1 name_en 매핑 (이름이 다른 것만)
    _YF_TO_GICS_L1: dict[str, str] = {
        'technology': 'information technology',
        'consumer cyclical': 'consumer discretionary',
        'consumer defensive': 'consumer staples',
        'basic materials': 'materials',
        'financial services': 'financials',
        'healthcare': 'health care',
    }

    def __init__(self) -> None:
        print('  섹터 매핑 테이블 로드 중...')
        self._gics_map: dict[str, int] = _load_gics_map()
        self._l1_map: dict[str, int] = _load_sectors_l1()
        self._name_en_map: dict[str, int] = _load_sectors_name_en()
        print(
            f'  gics_yfinance_map: {len(self._gics_map)}건, '
            f'sectors L1: {len(self._l1_map)}건, '
            f'sectors 전체: {len(self._name_en_map)}건'
        )

    def resolve(
        self,
        yfinance_sector: Optional[str],
        yfinance_industry: Optional[str],
    ) -> Optional[int]:
        """
        yfinance sector + industry 로 GICS sector_id 결정.

        우선순위:
          1. gics_yfinance_map 정확 매칭 (yfinance_industry → L4 sector_id)
          2. sectors.name_en ilike 매칭 (가능한 한 높은 레벨)
          3. sectors L1 매칭 (yfinance_sector → L1 sector_id)
          4. None (매핑 실패)
        """
        # CRYPTO는 고정
        if yfinance_sector == 'CRYPTO':
            return CRYPTO_SECTOR_ID

        # Step 1: gics_yfinance_map 정확 매칭
        if yfinance_industry:
            sector_id = self._gics_map.get(yfinance_industry)
            if sector_id:
                return sector_id

        # Step 2: sectors.name_en ilike 매칭 (industry)
        if yfinance_industry:
            industry_key = yfinance_industry.lower().strip()
            sector_id = self._name_en_map.get(industry_key)
            if sector_id:
                return sector_id

        # Step 3: L1 매칭 (yfinance sector → GICS name_en 변환 포함)
        if yfinance_sector:
            sector_key = yfinance_sector.lower().strip()
            # yfinance 이름을 GICS 이름으로 변환 시도
            gics_key = self._YF_TO_GICS_L1.get(sector_key, sector_key)
            sector_id = self._l1_map.get(gics_key)
            if sector_id:
                return sector_id

        return None

# ────────────────────────────────────────────
# yfinance 조회
# ────────────────────────────────────────────

def _fetch_yfinance_info(ticker_with_suffix: str) -> dict[str, Optional[str]]:
    """
    yfinance에서 sector + industry + quoteType 조회.
    실패 시 {'sector': None, 'industry': None, 'quoteType': None} 반환.
    """
    import logging
    try:
        import yfinance as yf
        logging.getLogger('yfinance').setLevel(logging.CRITICAL)
        info = yf.Ticker(ticker_with_suffix).info
        return {
            'sector': info.get('sector') or None,
            'industry': info.get('industry') or None,
            'quoteType': info.get('quoteType') or None,
        }
    except Exception:
        return {'sector': None, 'industry': None, 'quoteType': None}


def fetch_and_resolve_sector(
    ticker: str,
    market: str,
    kr_market_type: Optional[str],
    resolver: SectorResolver,
) -> Optional[int]:
    """
    종목 1건에 대해 yfinance 조회 + sector_id 결정.
    rate limit 대응: 호출 전 0.5~1초 sleep (호출부에서 처리).

    kr_market_type: 'KOSPI' | 'KOSDAQ' | None (KR 종목일 때 suffix 결정용)
    """
    if market == 'CRYPTO':
        return CRYPTO_SECTOR_ID

    if market == 'KR':
        # .KS → .KQ 순서로 시도
        for suffix in ['.KS', '.KQ']:
            info = _fetch_yfinance_info(f'{ticker}{suffix}')
            result = resolver.resolve(info['sector'], info['industry'])
            if result is not None:
                return result
        return None
    else:
        info = _fetch_yfinance_info(ticker)
        return resolver.resolve(info['sector'], info['industry'])

# ────────────────────────────────────────────
# 한국 주식 (pykrx)
# ────────────────────────────────────────────

def fetch_kr_stocks() -> list[dict]:
    """
    pykrx로 KOSPI + KOSDAQ 전종목 수집.
    반환 dict에 kr_market_type 키 포함 (KOSPI | KOSDAQ).
    """
    try:
        from pykrx import stock as krx
    except ImportError as e:
        raise ImportError('pykrx 설치 필요: pip install pykrx') from e

    import datetime
    # 직전 영업일 기준으로 종목 목록 조회
    today = datetime.date.today().strftime('%Y%m%d')
    rows: list[dict] = []

    for market_code in ['KOSPI', 'KOSDAQ']:
        try:
            tickers = krx.get_market_ticker_list(today, market=market_code)
        except Exception as e:
            print(f'  pykrx {market_code} 조회 실패: {e}')
            continue

        for ticker in tickers:
            try:
                name = krx.get_market_ticker_name(ticker)
            except Exception:
                name = ticker
            rows.append({
                'ticker': ticker,
                'name': name,
                'market': 'KR',
                'currency': 'KRW',
                'is_active': True,
                'kr_market_type': market_code,  # .KS / .KQ suffix 결정용 (upsert 시 제거)
            })
        print(f'  {market_code}: {len(tickers)}개')

    return rows

# ────────────────────────────────────────────
# 미국 주식 (GitHub rreichel3/US-Stock-Symbols)
# ────────────────────────────────────────────

US_SYMBOLS_BASE = 'https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main'


def fetch_us_stocks() -> list[dict]:
    """NYSE + NASDAQ 전종목 수집 (우선주/워런트/유닛 제외)."""
    rows: list[dict] = []
    for exchange in ['nyse', 'nasdaq']:
        url = f'{US_SYMBOLS_BASE}/{exchange}/{exchange}_full_tickers.json'
        try:
            data = httpx.get(url, timeout=15).json()
        except Exception as e:
            print(f'  {exchange} 조회 실패: {e}')
            continue
        for s in data:
            sym = s.get('symbol', '')
            name = s.get('name', '')
            # 우선주(. 포함), 워런트(W 말미), 5자 초과 제외
            if not sym or '.' in sym or '^' in sym or len(sym) > 5:
                continue
            rows.append({
                'ticker': sym,
                'name': name,
                'market': 'US',
                'currency': 'USD',
                'is_active': True,
            })
        print(f'  {exchange}: {len(rows)}개 누적')
    return rows

# ────────────────────────────────────────────
# 암호화폐 (Upbit)
# ────────────────────────────────────────────

def fetch_crypto_stocks() -> list[dict]:
    """Upbit KRW 마켓 코인 수집. sector_id는 CRYPTO(12) 고정."""
    try:
        markets = httpx.get('https://api.upbit.com/v1/market/all', timeout=10).json()
    except Exception as e:
        print(f'  Upbit API 조회 실패: {e}')
        return []

    rows: list[dict] = []
    for m in markets:
        if m['market'].startswith('KRW-'):
            coin = m['market'].split('-')[1]
            rows.append({
                'ticker': coin,
                'name': m['korean_name'],
                'market': 'CRYPTO',
                'currency': 'KRW',
                'is_active': True,
                'sector_id': CRYPTO_SECTOR_ID,
            })
    return rows

# ────────────────────────────────────────────
# cron 모드: sector_id is null 종목 조회
# ────────────────────────────────────────────

def fetch_stocks_without_sector() -> list[dict]:
    """
    stocks 테이블에서 sector_id is null이거나 신규 상장(최근 30일 이내)인
    KR/US 종목 목록 반환. CRYPTO는 항상 고정이므로 제외.
    """
    # Supabase REST: sector_id is null AND market != CRYPTO
    params = {
        'select': 'id,ticker,market',
        'sector_id': 'is.null',
        'market': 'neq.CRYPTO',
        'is_active': 'eq.true',
        'order': 'created_at.asc',
    }
    rows = _supabase_get('stocks', params)
    return rows

# ────────────────────────────────────────────
# 섹터 일괄 수집 (배치)
# ────────────────────────────────────────────

def _sleep_rate_limit() -> None:
    """yfinance rate limit 대응: 0.2~0.5초 랜덤 인터벌."""
    time.sleep(random.uniform(0.2, 0.5))


def run_sector_fill(
    stocks: list[dict],
    resolver: SectorResolver,
    kr_market_map: Optional[dict[str, str]] = None,
) -> tuple[int, int]:
    """
    stocks 목록을 순회하며 yfinance 조회 + sector_id 결정 + DB 업데이트.

    stocks 각 항목: {'id': str, 'ticker': str, 'market': str}
    kr_market_map: {ticker: 'KOSPI'|'KOSDAQ'} — KR 종목 suffix 결정용
    반환: (성공 건수, 실패 건수)
    """
    ok = 0
    fail = 0
    total = len(stocks)

    for i, stock in enumerate(stocks, 1):
        ticker = stock['ticker']
        market = stock['market']
        stock_id = stock['id']
        kr_market_type = (kr_market_map or {}).get(ticker)

        try:
            _sleep_rate_limit()
            sector_id = fetch_and_resolve_sector(ticker, market, kr_market_type, resolver)
            update_stock_sector(stock_id, sector_id)
            status = f'sector_id={sector_id}' if sector_id else 'null (매핑 실패)'
            print(f'  [{i}/{total}] {ticker} ({market}): {status}')
            ok += 1
        except Exception as e:
            print(f'  [{i}/{total}] {ticker} ({market}): ERROR — {e}')
            fail += 1

    return ok, fail

# ────────────────────────────────────────────
# 메인
# ────────────────────────────────────────────

def _build_kr_market_map(kr_rows: list[dict]) -> dict[str, str]:
    """pykrx 결과에서 {ticker: kr_market_type} 맵 생성."""
    return {row['ticker']: row.get('kr_market_type', 'KOSPI') for row in kr_rows}


def _strip_internal_keys(rows: list[dict]) -> list[dict]:
    """upsert 전 내부용 키(kr_market_type 등) 제거."""
    internal = {'kr_market_type'}
    return [{k: v for k, v in row.items() if k not in internal} for row in rows]


def run_full(resolver: SectorResolver) -> None:
    """초기 전체 적재 모드."""
    print('\n[1/5] 한국 주식 수집 중 (pykrx)...')
    kr_rows = fetch_kr_stocks()
    print(f'  총 {len(kr_rows)}개\n')

    print('[2/5] 미국 주식 수집 중 (GitHub)...')
    us_rows = fetch_us_stocks()
    print(f'  총 {len(us_rows)}개\n')

    print('[3/5] 암호화폐 수집 중 (Upbit)...')
    crypto_rows = fetch_crypto_stocks()
    print(f'  총 {len(crypto_rows)}개\n')

    print('[4/5] Supabase upsert 시작...')
    all_rows = _strip_internal_keys(kr_rows) + _strip_internal_keys(us_rows) + crypto_rows
    total = upsert_stocks(all_rows)
    print(f'\n기본 upsert 완료: {total}개\n')

    # upsert 완료 후 sector_id null 종목(KR/US)에 대해 yfinance 조회
    print('[5/5] yfinance 섹터 수집 시작 (KR/US)...')
    kr_market_map = _build_kr_market_map(kr_rows)
    stocks_to_fill = fetch_stocks_without_sector()
    print(f'  sector_id 미설정 종목: {len(stocks_to_fill)}개')

    if stocks_to_fill:
        ok, fail = run_sector_fill(stocks_to_fill, resolver, kr_market_map)
        print(f'\nyfinance 섹터 수집 완료: 성공 {ok}건, 실패(null 유지) {fail}건')
    else:
        print('  sector_id 미설정 종목 없음')


def run_cron(resolver: SectorResolver) -> None:
    """월간 cron 모드: sector_id is null 종목만 재시도."""
    print('\n[cron] sector_id 미설정 종목 조회 중...')
    stocks_to_fill = fetch_stocks_without_sector()
    print(f'  대상: {len(stocks_to_fill)}개\n')

    if not stocks_to_fill:
        print('처리할 종목 없음. 종료.')
        return

    # KR 종목은 .KS 기본값 사용 (KOSDAQ도 yfinance가 알아서 처리)
    kr_market_map: dict[str, str] = {}

    ok, fail = run_sector_fill(stocks_to_fill, resolver, kr_market_map)
    print(f'\ncron 완료: 성공 {ok}건, 실패(null 유지) {fail}건')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='종목 배치 적재 스크립트 (PRD-004)')
    parser.add_argument(
        '--cron',
        action='store_true',
        help='cron 모드: sector_id is null 종목 + 신규 상장 종목만 처리',
    )
    args = parser.parse_args()

    print('=== 종목 배치 적재 (GICS 계층화) ===\n')
    print(f'모드: {"cron (sector_id 재시도)" if args.cron else "전체 적재"}\n')

    resolver = SectorResolver()

    if args.cron:
        run_cron(resolver)
    else:
        run_full(resolver)
