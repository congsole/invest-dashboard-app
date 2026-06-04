# PRD-004: 섹터 계층화 및 배치 섹터 수집

> 상태: 기획 초안
> 선행: PRD-003(메모 — 섹터 서브시스템)
> 변경 대상: `sectors` 테이블, `stocks` 테이블, `kr_sector_map` 테이블, 배치 적재 스크립트

---

## 1. 개요

### 1.1 목적
현재 섹터 분류는 GICS Level 1(11개) + 가상자산 = 12개 플랫 구조다. 이를 **GICS 4단계 전체(Sector → Industry Group → Industry → Sub-Industry)**로 확장하여, 한국·미국 주식 모두 동일한 GICS 기반 분류 체계로 통일한다. 개별 종목은 최하위 Level 4(Sub-Industry)까지 등록하되, 화면별로 노출 수준을 달리한다:
- **메모 필터**: Level 2(Industry Group)까지
- **종목 상세**: Level 4(Sub-Industry)까지

### 1.2 배경
- GICS는 원래 4단계(Sector → Industry Group → Industry → Sub-Industry)이나, 현행은 Level 1만 사용 중.
- 한국 주식은 네이버 업종명 → GICS Level 1 매핑(`kr_sector_map`)으로 처리하고 있으나, 세부 업종 정보가 유실됨.
- yfinance가 한국 주식(`005930.KS`)에도 GICS `sector`(L1)와 `industry`(L3~4)를 제공하므로, US/KR 모두 yfinance 단일 소스로 통일 가능.
- GICS Industry Group(L2, ~25개)은 yfinance가 직접 제공하지 않으나, GICS 공식 매핑 테이블로 Industry → Industry Group 역매핑 가능.

### 1.3 핵심 변경
1. `sectors` 테이블에 `parent_id`를 추가하여 GICS 4단계 계층(Sector → Industry Group → Industry → Sub-Industry) 표현.
2. 종목 배치 적재 시 yfinance에서 `sector` + `industry`(≒Sub-Industry)를 함께 수집, 중간 단계(Industry Group, Industry)는 GICS 매핑 테이블로 결정.
3. `kr_sector_map` 폐기 — yfinance 통일로 더 이상 네이버 업종 매핑 불필요.
4. `stocks.sector_id` → Level 4(Sub-Industry)를 가리킴.
5. 메모 필터에서는 L1 → L2까지만 노출, 종목 상세 화면에서 L4까지 표시.

---

## 2. 범위

### 2.1 포함
- `sectors` 테이블 GICS 4단계 계층 구조 전환 (`parent_id`, `level` 추가)
- 기존 12개 섹터를 Level 1으로 유지, L2(Industry Group ~25개), L3(Industry ~74개), L4(Sub-Industry ~163개) 추가
- 종목 배치 적재(초기 + 월간 cron) 시 yfinance `sector` + `industry` 동시 수집, GICS 매핑으로 L2·L3 역산
- `stocks.sector_id`가 Level 4(Sub-Industry)를 가리키도록 변경
- `kr_sector_map` 테이블 폐기 (마이그레이션으로 DROP)
- 메모 섹터 필터에서 L1 → L2 계층 탐색 지원 (섹터 선택 → 하위 Industry Group 펼침)
- 종목 상세 화면에서 L4(Sub-Industry)까지 표시: `정보기술 > 반도체및반도체장비 > 반도체 > 반도체제조`

### 2.2 제외 (후순위)
- 사용자 정의 커스텀 섹터/업종
- 업종별 수익률 비교 차트

---

## 3. 데이터 모델 변경

### 3.1 sectors 테이블 (변경)

```sql
create table sectors (
  id         serial primary key,
  code       text not null unique,       -- 'IT', 'SEMICON_EQUIP', 'SEMICONDUCTORS', 'SEMI_MFG', ...
  name       text not null,              -- '정보기술', '반도체및반도체장비', '반도체', '반도체제조', ...
  name_en    text null,                  -- 'Information Technology', 'Semiconductors & Semiconductor Equipment', ...
  parent_id  int null references sectors(id),  -- null = L1, non-null = 상위 레벨 참조
  level      int not null default 1,     -- 1 = Sector, 2 = Industry Group, 3 = Industry, 4 = Sub-Industry
  created_at timestamptz not null default now()
);
```

**변경 사항:**
- `id`: `int` → `serial` (고정 시드 12개에서 동적 추가로 전환)
- `parent_id`: 신규. 자기 참조 FK. L1은 null, L2→L1, L3→L2, L4→L3.
- `level`: 신규. 1~4. 쿼리 편의용.
- `name_en`: 신규. yfinance 반환값 및 GICS 공식 영문명 매칭용.
- 기존 Level 1 시드 12개는 그대로 유지.

**계층 예시:**
```
L1: 정보기술 (Information Technology)
 └ L2: 반도체및반도체장비 (Semiconductors & Semiconductor Equipment)
    └ L3: 반도체 (Semiconductors)
       └ L4: 반도체제조 (Semiconductor Manufacturing)
```

**인덱스:**
- `idx_sectors_parent_id` ON (parent_id) — 하위 레벨 조회
- `idx_sectors_level` ON (level) — 레벨별 필터

### 3.2 stocks 테이블 (변경)

`sector_id`는 가능한 한 **Level 4(Sub-Industry)**를 가리킨다. yfinance에서 Sub-Industry까지 매핑되지 않는 종목은 매핑 가능한 최하위 레벨을 가리킨다.

```sql
-- sector_id 의미 변경: 최하위 매핑 가능 레벨 (목표: Level 4)
-- 타입·제약 변경 없음, FK → sectors(id)
```

### 3.3 kr_sector_map 테이블 (폐기)

```sql
drop table kr_sector_map;
```

yfinance 통일로 더 이상 네이버 업종 → GICS 매핑이 불필요하다.

### 3.4 memo_sectors (변경 없음)

`memo_sectors.sector_id`는 어떤 레벨이든 가리킬 수 있다. 기존 메모에 연결된 Level 1 섹터는 그대로 유지된다. 메모 필터 UI에서는 L1·L2만 선택 가능하지만, 데이터 레벨에서는 제한하지 않는다.

---

## 4. GICS 계층 시드

### 4.1 시드 전략

GICS 4단계 전체를 **초기 시드로 일괄 등록**한다. GICS 분류는 공식적으로 11 Sector → 25 Industry Group → 74 Industry → 163 Sub-Industry = 총 **273개** 행이다. CRYPTO는 L1에 별도 추가.

시드 데이터 소스: GICS 공식 분류표 (S&P/MSCI 공개 PDF 또는 정리된 CSV).

### 4.2 yfinance industry → GICS L4 매핑

yfinance는 `sector`(L1)와 `industry`(≒L3~L4)를 쌍으로 반환한다. 이 `industry` 값을 GICS Sub-Industry(L4)에 매핑하여 `stocks.sector_id`를 결정한다.

```python
# 예시: yfinance 반환값
info = {
    "sector": "Technology",                    # → L1: 정보기술
    "industry": "Semiconductor Manufacturing"  # → L4: 반도체제조
}
# L4에서 parent_id를 타고 올라가면 L3(반도체) → L2(반도체및반도체장비) → L1(정보기술)
```

yfinance `industry`와 GICS Sub-Industry가 정확히 1:1 매칭되지 않는 경우, `industry` 문자열 → GICS L4 code 매핑 테이블(`gics_yfinance_map`)을 별도로 관리한다. 매핑 실패 시 L1까지는 확정하고, 하위는 null로 둔다.

### 4.3 영문명 → 한글명

GICS 공식 분류표에 한글 번역이 있으므로 초기 시드 시 함께 등록한다. GICS 한글 번역이 없는 항목은 `name_en`만 저장하고 `name`에도 영문을 넣은 뒤 점진적으로 보정한다.

### 4.4 암호화폐

기존과 동일하게 `CRYPTO` 섹터(Level 1) 하위에 별도 업종을 두지 않는다. 향후 테마 세분화 시 L2~L4로 확장 가능(DeFi, NFT, L1/L2 체인 등).

---

## 5. 배치 적재 변경

### 5.1 현행 vs 변경

| 항목 | 현행 (PRD-003) | 변경 (PRD-004) |
|------|---------------|----------------|
| KR 종목 목록 | pykrx | pykrx (유지) |
| KR 섹터 | 네이버 업종 → `kr_sector_map` → GICS L1 | yfinance `sector` + `industry` → GICS L1~L4 |
| US 종목 목록 | GitHub 정적 파일 | GitHub 정적 파일 (유지) |
| US 섹터 | yfinance `sector` (L1만) | yfinance `sector` + `industry` → GICS L1~L4 |
| CRYPTO | Upbit API, CRYPTO 고정 | Upbit API, CRYPTO 고정 (유지) |

### 5.2 적재 흐름 (변경 후)

```python
import yfinance as yf

def fetch_sector_and_industry(ticker: str, market: str) -> dict:
    """yfinance에서 섹터 + 업종을 함께 조회"""
    if market == "CRYPTO":
        return {"sector": "CRYPTO", "industry": None}

    suffix = ".KS" if market == "KR" else ""  # KOSDAQ은 .KQ
    info = yf.Ticker(f"{ticker}{suffix}").info
    return {
        "sector": info.get("sector"),       # e.g. "Technology"
        "industry": info.get("industry"),   # e.g. "Semiconductors"
    }

def resolve_sector_id(sector_name: str, industry_name: str) -> int:
    """
    yfinance sector + industry로 GICS L4 sector_id를 결정.
    GICS 시드가 이미 등록되어 있으므로, 매핑 테이블로 조회만 한다.
    반환: 최하위 매핑 가능 sector_id (목표: L4, 실패 시 L1)
    """
    # 1. L1 조회 (yfinance sector → GICS Sector)
    l1 = find_sector(name_en=sector_name, level=1)
    if not l1:
        return None

    if not industry_name:
        return l1.id

    # 2. yfinance industry → GICS L4 매핑 조회
    l4 = find_gics_by_yfinance_industry(industry_name)
    if l4:
        return l4.id

    # 3. 매핑 실패 시 L1 반환
    return l1.id
```

### 5.3 KOSPI / KOSDAQ suffix 처리

yfinance에서 한국 주식 조회 시:
- KOSPI: `{ticker}.KS` (예: `005930.KS`)
- KOSDAQ: `{ticker}.KQ` (예: `373220.KQ`)

pykrx에서 시장 구분(`KOSPI`/`KOSDAQ`)을 알 수 있으므로 suffix를 결정할 수 있다.

### 5.4 yfinance rate limit 대응

yfinance는 Yahoo Finance를 스크래핑하므로, 대량 조회 시 rate limit에 주의한다.

- 초기 적재: 전 종목을 대상으로 하되, 0.5~1초 간격으로 조회. 미조회 종목은 `sector_id = null`로 남기고 다음 cron에서 보충.
- 월간 cron: `sector_id is null`인 종목 + 신규 상장 종목만 조회.
- 실패 시 `sector_id = null` 유지, 다음 주기에 재시도.

---

## 6. 종목 검색/등록 시 섹터 처리 변경

### 6.1 현행 (PRD-003 섹션 8)

1. 로컬 DB 검색 → 없으면 FastAPI 외부 검색
2. 외부 검색 시 종목 upsert
3. 섹터는 별도 RPC(`get_or_recommend_stock_sector`)로 추천

### 6.2 변경

1~2는 동일.
3. FastAPI 외부 검색 시 yfinance `sector` + `industry`를 **함께 조회**하여 `sectors` 테이블에 upsert 후, 해당 `sector_id`를 종목에 즉시 반영.
4. `get_or_recommend_stock_sector` RPC에서 `kr_sector_map` 참조 로직 제거, yfinance 단일 경로로 통일.

---

## 7. UI 변경

### 7.1 메모 필터 — 섹터 행

**현행**: 12개 섹터를 플랫 칩으로 나열.

**변경**: L1 → L2 계층 탐색 (L3·L4는 필터에 노출하지 않음).
- 기본: Level 1 섹터 칩 나열 (현행과 동일한 모습).
- Level 1 칩 탭 → 하위 Level 2(Industry Group) 칩이 아래에 펼쳐짐 (아코디언 또는 하위 행 추가).
- Level 1 선택 시: 해당 섹터의 **모든 하위 종목**(L2·L3·L4 포함)과 연결된 메모 표시.
- Level 2 선택 시: 해당 Industry Group **하위 종목**(L3·L4 포함)과 연결된 메모 표시.
- Level 1과 Level 2 동시 선택 가능 (OR 결합, 기존 규칙 동일).

> 필터 쿼리 시 종목의 `sector_id`(L4)에서 parent를 타고 올라가 L2·L1에 속하는지 판단한다.

### 7.2 종목 상세 — 섹터 표시

종목 정보에 GICS 4단계 전체를 breadcrumb으로 표시한다.

```
섹터: 정보기술 > 반도체및반도체장비 > 반도체 > 반도체제조
```

L4까지 매핑되지 않은 종목은 매핑된 최하위 레벨까지만 표시.

### 7.3 섹터 수동 보정

종목의 섹터를 수동 보정할 때, L1 → L2 → L3 → L4 순차 드롭다운(cascading select)으로 변경한다. 각 단계에서 선택하면 하위 드롭다운이 필터링된다.

---

## 8. 마이그레이션 전략

### 8.1 단계

1. **`sectors` 테이블 스키마 변경**: `parent_id`, `level`, `name_en` 추가, `id`를 serial로 전환.
2. **기존 12개 시드에 `level=1`, `parent_id=null`, `name_en` 채움**.
3. **GICS 전체 시드 등록**: L2(25개) + L3(74개) + L4(163개) = 262개 행 추가. 시퀀스 시작값을 13 이상으로 설정하여 기존 FK 보호.
4. **yfinance industry → GICS L4 매핑 테이블 구축** (`gics_yfinance_map`).
5. **배치 스크립트로 전 종목 yfinance 조회** → L4 매핑 + `stocks.sector_id` 업데이트.
6. **`kr_sector_map` DROP**.
7. **RPC/함수 수정**: `get_or_recommend_stock_sector`, `upsert_stock_with_sector` 등.

### 8.2 하위 호환

- 기존 `sector_id`가 Level 1을 가리키는 종목은, L4 매핑이 완료될 때까지 그대로 유지.
- 프론트엔드에서 `sector_id`로 조회 시, 어떤 레벨이든 동일하게 동작. parent를 타고 올라가 상위 분류를 도출.
- `memo_sectors`에 연결된 Level 1 섹터는 유지 — 하위 레벨이 추가되어도 기존 메모 필터에 영향 없음.

---

## 9. 엣지 케이스 / 미해결

- **yfinance 데이터 누락**: 일부 소형주·신규 상장주는 yfinance에서 sector/industry가 null일 수 있음 → `sector_id = null` 유지, 사용자 수동 보정 경로 제공.
- **yfinance industry ↔ GICS L4 매핑 불일치**: yfinance `industry` 문자열이 GICS Sub-Industry와 정확히 일치하지 않는 경우 있음 → `gics_yfinance_map` 매핑 테이블로 수동 관리. 매핑 실패 시 L1까지는 확정, 하위는 null.
- **KOSPI/KOSDAQ 구분**: pykrx에서 시장 정보를 가져와야 yfinance suffix(`.KS`/`.KQ`)를 결정할 수 있음. 현행 `stocks.market = 'KR'`만으로는 구분 불가 → 배치 스크립트에서 pykrx 시장 정보를 활용.
- **GICS 한글명**: GICS 공식 한글 번역을 시드에 포함. 번역이 없는 항목은 영문으로 두고 점진 보정.
- **`sectors.id` 전환**: 기존 고정 시드(1~12)에서 serial로 전환 시, 기존 FK 참조가 깨지지 않도록 시퀀스 시작값을 13 이상으로 설정.
- **메모 필터 성능**: 종목의 `sector_id`(L4)에서 L2·L1을 역산해야 하므로, `sectors` 테이블 자기 조인 또는 Materialized Path 패턴 검토 필요.

---

## 10. 향후 확장

- 암호화폐 테마 세분화 (DeFi, NFT, L1/L2 체인 등을 L2~L4로)
- 업종별 수익률/비중 차트 (대시보드 연계)
- 메모 필터에서 L3·L4까지 펼쳐 보기 (현재는 L2까지)