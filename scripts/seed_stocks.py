"""
종목 마스터 초기 적재 스크립트

소스:
  - 한국 주식: 네이버 금융 모바일 API (KOSPI + KOSDAQ)
  - 암호화폐: Upbit 공개 REST API (KRW 마켓)

사용법:
  python3 scripts/seed_stocks.py

환경변수 (app/.env.local에서 읽음):
  EXPO_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_KEY
"""

import httpx
import json
import os
import time

# ────────────────────────────────────────────
# 환경변수 로드 (app/.env.local)
# ────────────────────────────────────────────

def load_env():
    env_path = os.path.join(os.path.dirname(__file__), '..', 'app', '.env.local')
    env = {}
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            key, _, val = line.partition('=')
            env[key.strip()] = val.strip()
    return env

env = load_env()
SUPABASE_URL = env['EXPO_PUBLIC_SUPABASE_URL']
SERVICE_KEY = env['SUPABASE_SERVICE_KEY']

HEADERS = {
    'apikey': SERVICE_KEY,
    'Authorization': f'Bearer {SERVICE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates,return=minimal',  # upsert on unique constraint
}

# ────────────────────────────────────────────
# Supabase upsert (배치)
# ────────────────────────────────────────────

def upsert_stocks(rows: list[dict], batch_size: int = 500):
    """stocks 테이블에 배치 upsert. on_conflict=(ticker, market)"""
    url = f'{SUPABASE_URL}/rest/v1/stocks?on_conflict=ticker,market'
    # 모든 행의 키를 통일 + (ticker, market) 중복 제거
    all_keys = {'ticker', 'name', 'market', 'currency', 'is_active', 'sector_id'}
    seen = set()
    normalized = []
    for row in rows:
        key = (row['ticker'], row['market'])
        if key in seen:
            continue
        seen.add(key)
        r = {k: row.get(k) for k in all_keys}
        normalized.append(r)
    print(f'  중복 제거 후: {len(normalized)}개')

    total = 0
    for i in range(0, len(normalized), batch_size):
        batch = normalized[i:i + batch_size]
        r = httpx.post(url, headers=HEADERS, json=batch, timeout=30)
        if r.status_code not in (200, 201):
            print(f'  ERROR batch {i}: {r.status_code} {r.text[:200]}')
        else:
            total += len(batch)
            print(f'  upsert {total}/{len(normalized)}')
    return total

# ────────────────────────────────────────────
# 한국 주식 (네이버 금융)
# ────────────────────────────────────────────

CRYPTO_SECTOR_ID = 12  # sectors 테이블의 CRYPTO id

# ────────────────────────────────────────────
# 미국 주식 (GitHub rreichel3/US-Stock-Symbols)
# ────────────────────────────────────────────

US_SYMBOLS_BASE = 'https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main'

def fetch_us_stocks() -> list[dict]:
    """NYSE + NASDAQ 전종목 수집 (우선주/워런트/유닛 제외)"""
    rows = []
    for exchange in ['nyse', 'nasdaq']:
        url = f'{US_SYMBOLS_BASE}/{exchange}/{exchange}_full_tickers.json'
        data = httpx.get(url, timeout=15).json()
        for s in data:
            sym = s.get('symbol', '')
            name = s.get('name', '')
            if not sym or '^' in sym or len(sym) > 5:
                continue
            rows.append({
                'ticker': sym,
                'name': name,
                'market': 'US',
                'currency': 'USD',
                'is_active': True,
            })
        print(f'  {exchange}: 완료')
    return rows

def fetch_kr_stocks() -> list[dict]:
    """네이버 금융 모바일 API에서 KOSPI + KOSDAQ 전종목 수집"""
    headers = {'User-Agent': 'Mozilla/5.0'}
    rows = []

    for market_code in ['KOSPI', 'KOSDAQ']:
        page = 1
        while True:
            url = f'https://m.stock.naver.com/api/stocks/marketValue/{market_code}?page={page}&pageSize=30'
            r = httpx.get(url, headers=headers, timeout=10)
            data = r.json()
            stocks = data.get('stocks', [])
            if not stocks:
                break
            for s in stocks:
                rows.append({
                    'ticker': s['itemCode'],
                    'name': s['stockName'],
                    'market': 'KR',
                    'currency': 'KRW',
                    'is_active': True,
                })
            page += 1
            time.sleep(0.1)  # rate limit 방지
        print(f'  {market_code}: {page - 1}페이지 완료')

    return rows

# ────────────────────────────────────────────
# 암호화폐 (Upbit)
# ────────────────────────────────────────────

def fetch_crypto_stocks() -> list[dict]:
    """Upbit KRW 마켓 코인 수집"""
    markets = httpx.get('https://api.upbit.com/v1/market/all', timeout=10).json()
    rows = []
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
# 메인
# ────────────────────────────────────────────

if __name__ == '__main__':
    print('=== 종목 마스터 초기 적재 ===\n')

    print('[1/3] 한국 주식 수집 중...')
    kr = fetch_kr_stocks()
    print(f'  총 {len(kr)}개\n')

    print('[2/3] 미국 주식 수집 중...')
    us = fetch_us_stocks()
    print(f'  총 {len(us)}개\n')

    print('[3/3] 암호화폐 수집 중...')
    crypto = fetch_crypto_stocks()
    print(f'  총 {len(crypto)}개\n')

    all_rows = kr + us + crypto
    print(f'전체 {len(all_rows)}개 → Supabase upsert 시작\n')
    total = upsert_stocks(all_rows)
    print(f'\n완료: {total}개 적재됨')
