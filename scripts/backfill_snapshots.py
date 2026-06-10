"""
daily_snapshots 백필 스크립트 (일회성)

cron-create-snapshots(Edge Function)가 배포되기 전 구간의 일별 자산 스냅샷을
과거 종가/환율로 소급 생성한다. 계산 로직은 cron의 computeSnapshot과 동일.

소스:
  - 한국 주식 종가: 네이버 금융 siseJson (키 불필요)
  - 미국 주식 종가: Yahoo Finance v8 chart API (키 불필요)
  - USD/KRW 환율:  frankfurter.dev (ECB, 영업일만 — 주말은 직전값 carry-forward)

사용법:
  # dry-run (기본): 계산만 하고 샘플 출력 + 운영 6/10 스냅샷과 교차 검증
  python3 scripts/backfill_snapshots.py

  # 실제 upsert
  python3 scripts/backfill_snapshots.py --apply

  # 구간 지정 (기본: 첫 이벤트 날짜 ~ 어제)
  python3 scripts/backfill_snapshots.py --from 2026-04-23 --to 2026-06-09

환경변수 (아래 순서로 탐색):
  1. 셸 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
  2. app/.env.local: EXPO_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY
"""

import argparse
import math
import os
import re
import sys
import time
from bisect import bisect_right
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent.parent
PRICE_LOOKBACK_DAYS = 14  # 휴장일/시차 대비 — 해당일 이전 최신 종가 탐색 범위


# ────────────────────────────────────────────
# 환경 로드 (sync_stocks.py와 동일 패턴)
# ────────────────────────────────────────────

def load_env() -> tuple[str, str]:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if url and key:
        return url, key

    env_path = ROOT / "app" / ".env.local"
    values = {}
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                values[k.strip()] = v.strip()
    url = url or values.get("EXPO_PUBLIC_SUPABASE_URL")
    key = key or values.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        sys.exit("SUPABASE_URL / SUPABASE_SERVICE_KEY를 찾을 수 없습니다 (app/.env.local 확인)")
    return url, key


# ────────────────────────────────────────────
# 데이터 수집
# ────────────────────────────────────────────

def fetch_all_events(client: httpx.Client, url: str) -> list[dict]:
    rows, offset, page = [], 0, 1000
    while True:
        r = client.get(
            f"{url}/rest/v1/account_events",
            params={
                "select": "user_id,event_type,event_date,asset_type,ticker,"
                          "quantity,currency,fee,tax,amount,fx_rate_at_event",
                "order": "event_date.asc",
                "limit": page,
                "offset": offset,
            },
        )
        r.raise_for_status()
        batch = r.json()
        rows.extend(batch)
        if len(batch) < page:
            return rows
        offset += page


def fetch_kr_closes(ticker: str, start: date, end: date) -> dict[date, float]:
    """네이버 siseJson — 실제 거래일 → 종가"""
    u = (
        "https://api.finance.naver.com/siseJson.naver"
        f"?symbol={ticker}&requestType=1"
        f"&startTime={start.strftime('%Y%m%d')}&endTime={end.strftime('%Y%m%d')}&timeframe=day"
    )
    text = httpx.get(u, timeout=30).text
    out = {}
    for m in re.finditer(r'\["(\d{8})",\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),', text):
        d = datetime.strptime(m.group(1), "%Y%m%d").date()
        out[d] = float(m.group(5))
    return out


def fetch_us_closes(ticker: str, start: date, end: date) -> dict[date, float]:
    """Yahoo Finance v8 chart — 실제 거래일(UTC 기준) → 종가"""
    p1 = int(datetime(start.year, start.month, start.day, tzinfo=timezone.utc).timestamp())
    p2 = int(datetime(end.year, end.month, end.day, tzinfo=timezone.utc).timestamp()) + 86400
    u = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?period1={p1}&period2={p2}&interval=1d"
    r = httpx.get(u, headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}, timeout=30)
    r.raise_for_status()
    res = r.json().get("chart", {}).get("result")
    if not res:
        return {}
    ts = res[0].get("timestamp") or []
    closes = res[0]["indicators"]["quote"][0].get("close") or []
    out = {}
    for t, c in zip(ts, closes):
        if c is not None:
            out[datetime.fromtimestamp(t, timezone.utc).date()] = float(c)
    return out


def fetch_fx_rates(start: date, end: date) -> dict[date, float]:
    """frankfurter.dev — 영업일별 USD/KRW"""
    u = f"https://api.frankfurter.dev/v1/{start.isoformat()}..{end.isoformat()}?base=USD&symbols=KRW"
    r = httpx.get(u, timeout=30)
    r.raise_for_status()
    return {
        date.fromisoformat(d): v["KRW"]
        for d, v in r.json().get("rates", {}).items()
    }


# ────────────────────────────────────────────
# 시계열 lookup: 해당일 이전 최신 값
# ────────────────────────────────────────────

class Series:
    def __init__(self, data: dict[date, float]):
        self.dates = sorted(data)
        self.values = [data[d] for d in self.dates]

    def latest_on_or_before(self, d: date, lookback_days: int | None = None):
        i = bisect_right(self.dates, d)
        if i == 0:
            return None
        found = self.dates[i - 1]
        if lookback_days is not None and (d - found).days > lookback_days:
            return None
        return self.values[i - 1]


# ────────────────────────────────────────────
# 스냅샷 계산 — cron-create-snapshots computeSnapshot 미러
# ────────────────────────────────────────────

def js_round(x: float) -> int:
    return math.floor(x + 0.5)  # JS Math.round (half-up)


def compute_snapshot(events: list[dict], d: date, fx: float, prices: dict[str, Series], warnings: set):
    principal_krw = 0.0
    cash_krw = 0.0
    cash_usd = 0.0

    for ev in events:
        ev_fx = ev["fx_rate_at_event"] if ev["fx_rate_at_event"] is not None else fx
        et, cur = ev["event_type"], ev["currency"]
        amount, tax = ev["amount"], ev["tax"]

        if et in ("deposit", "withdraw"):
            sign = 1 if et == "deposit" else -1
            principal_krw += sign * (amount if cur == "KRW" else amount * ev_fx)

        if cur == "KRW":
            if et == "deposit":
                cash_krw += amount
            elif et in ("withdraw", "buy"):
                cash_krw -= amount if et == "withdraw" else amount
            elif et == "sell":
                cash_krw += amount
            elif et == "dividend":
                cash_krw += amount - tax
        elif cur == "USD":
            if et == "deposit":
                cash_usd += amount
            elif et in ("withdraw", "buy"):
                cash_usd -= amount if et == "withdraw" else amount
            elif et == "sell":
                cash_usd += amount
            elif et == "dividend":
                cash_usd += amount - tax

    net_qty: dict[str, float] = {}
    for ev in events:
        if ev["event_type"] in ("buy", "sell") and ev["ticker"] and ev["asset_type"]:
            key = f"{ev['asset_type']}:{ev['ticker']}"
            q = ev["quantity"] or 0
            net_qty[key] = net_qty.get(key, 0.0) + (q if ev["event_type"] == "buy" else -q)

    holdings_krw = 0.0
    for key, qty in net_qty.items():
        if qty <= 0:
            continue
        series = prices.get(key)
        close = series.latest_on_or_before(d, PRICE_LOOKBACK_DAYS) if series else None
        if close is None:
            if qty > 1e-9:  # 소수점 거래 잔여 dust는 무시
                warnings.add(f"{d} {key} (qty={qty:.6f}) 가격 없음 — 평가액 제외")
            continue
        asset_type = key.split(":")[0]
        holdings_krw += qty * close * (1.0 if asset_type == "korean_stock" else fx)

    total = holdings_krw + cash_krw + cash_usd * fx
    return {
        "snapshot_date": d.isoformat(),
        "total_value_krw": js_round(total),
        "principal_krw": js_round(principal_krw),
        "cash_krw": js_round(cash_krw),
        "cash_usd": js_round(cash_usd * 100) / 100,
        "net_profit_krw": js_round(total - principal_krw),
        "fx_rate_usd": fx,
    }


# ────────────────────────────────────────────
# 메인
# ────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="date_from", help="시작일 (기본: 첫 이벤트 날짜)")
    ap.add_argument("--to", dest="date_to", help="종료일 (기본: 어제)")
    ap.add_argument("--apply", action="store_true", help="실제 upsert 수행 (기본: dry-run)")
    args = ap.parse_args()

    url, key = load_env()
    client = httpx.Client(headers={"apikey": key, "Authorization": f"Bearer {key}"}, timeout=60)

    print("account_events 조회 중...")
    events = fetch_all_events(client, url)
    print(f"  {len(events)}건")

    today = date.today()
    first_event = date.fromisoformat(min(e["event_date"] for e in events))
    d_from = date.fromisoformat(args.date_from) if args.date_from else first_event
    d_to = date.fromisoformat(args.date_to) if args.date_to else today - timedelta(days=1)
    if d_to >= today:
        sys.exit(f"종료일은 어제({today - timedelta(days=1)})까지만 — 오늘 스냅샷은 cron 담당")
    print(f"백필 구간: {d_from} ~ {d_to}")

    # 종목별 가격 시계열 수집 (첫 거래 14일 전부터)
    ticker_first: dict[str, date] = {}
    for ev in events:
        if ev["event_type"] in ("buy", "sell") and ev["ticker"] and ev["asset_type"]:
            k = f"{ev['asset_type']}:{ev['ticker']}"
            d = date.fromisoformat(ev["event_date"])
            if k not in ticker_first or d < ticker_first[k]:
                ticker_first[k] = d

    prices: dict[str, Series] = {}
    print(f"가격 시계열 수집 중 ({len(ticker_first)}종목)...")
    for k, first in sorted(ticker_first.items()):
        asset_type, ticker = k.split(":")
        start = first - timedelta(days=PRICE_LOOKBACK_DAYS)
        # d_to가 아닌 today까지 수집 — 교차 검증(오늘 스냅샷 재계산)에 당일 종가 필요
        if asset_type == "korean_stock":
            data = fetch_kr_closes(ticker, start, today)
        elif asset_type == "us_stock":
            data = fetch_us_closes(ticker, start, today)
        else:
            print(f"  [경고] {k}: 지원하지 않는 asset_type — 건너뜀")
            continue
        prices[k] = Series(data)
        print(f"  {k}: {len(data)}일")
        time.sleep(0.5)

    print("환율 시계열 수집 중...")
    fx_data = fetch_fx_rates(d_from - timedelta(days=PRICE_LOOKBACK_DAYS), today)
    fx_series = Series(fx_data)
    print(f"  {len(fx_data)}일 (영업일)")

    # 사용자별 일별 스냅샷 계산
    users = sorted({e["user_id"] for e in events})
    warnings: set = set()
    all_rows: list[dict] = []

    for uid in users:
        u_events = [e for e in events if e["user_id"] == uid]
        u_first = date.fromisoformat(min(e["event_date"] for e in u_events))
        d = max(d_from, u_first)
        while d <= d_to:
            fx = fx_series.latest_on_or_before(d)
            if fx is None:
                sys.exit(f"{d} 환율 없음 — frankfurter 범위 확인")
            day_events = [e for e in u_events if e["event_date"] <= d.isoformat()]
            row = compute_snapshot(day_events, d, fx, prices, warnings)
            row["user_id"] = uid
            all_rows.append(row)
            d += timedelta(days=1)

    print(f"\n계산 완료: 사용자 {len(users)}명, 스냅샷 {len(all_rows)}행")
    if warnings:
        print(f"\n[경고] 가격 누락 {len(warnings)}건:")
        for w in sorted(warnings)[:20]:
            print(f"  - {w}")
        if len(warnings) > 20:
            print(f"  ... 외 {len(warnings) - 20}건")

    # 교차 검증: 오늘 스냅샷을 같은 로직으로 재계산해 cron이 만든 운영 row와 비교
    print("\n── 교차 검증 (오늘 스냅샷, cron 결과와 비교) ──")
    r = client.get(
        f"{url}/rest/v1/daily_snapshots",
        params={"select": "*", "snapshot_date": f"eq.{today.isoformat()}"},
    )
    for db_row in r.json():
        uid = db_row["user_id"]
        u_events = [e for e in events if e["user_id"] == uid and e["event_date"] <= today.isoformat()]
        fx_db = db_row["fx_rate_usd"]  # cron이 쓴 환율 그대로 사용해 가격 소스 차이만 본다
        calc = compute_snapshot(u_events, today, fx_db, prices, set())
        for f in ("total_value_krw", "principal_krw", "cash_krw", "cash_usd"):
            a, b = calc[f], db_row[f]
            diff_pct = abs(a - b) / abs(b) * 100 if b else 0.0
            mark = "OK" if diff_pct < 1.0 else "확인 필요"
            print(f"  {f:18s} 계산={a:>15,.2f}  운영={b:>15,.2f}  차이 {diff_pct:.3f}% [{mark}]")

    # 샘플 출력
    print("\n── 샘플 (처음/중간/끝 3행) ──")
    for row in all_rows[:3] + all_rows[len(all_rows) // 2: len(all_rows) // 2 + 3] + all_rows[-3:]:
        print(f"  {row['snapshot_date']}  총평가 {row['total_value_krw']:>12,}  "
              f"원금 {row['principal_krw']:>12,}  예수금 ₩{row['cash_krw']:>11,} / ${row['cash_usd']:>9,.2f}")

    if not args.apply:
        print("\ndry-run 종료 — 실제 반영하려면 --apply")
        return

    print(f"\ndaily_snapshots upsert 중 ({len(all_rows)}행)...")
    for i in range(0, len(all_rows), 500):
        chunk = all_rows[i: i + 500]
        r = client.post(
            f"{url}/rest/v1/daily_snapshots",
            params={"on_conflict": "user_id,snapshot_date"},
            headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
            json=chunk,
        )
        r.raise_for_status()
        print(f"  {i + len(chunk)}/{len(all_rows)}")
    print("완료 ✅")


if __name__ == "__main__":
    main()
