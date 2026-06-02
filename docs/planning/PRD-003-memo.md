# PRD-003: 메모 (투자 일지)

> 상태: 기획 확정 (구현 대기)
> 선행: PRD-001(데이터 모델), PRD-002(대시보드)
> 관련: PRD-003a(향후 확장 — 별도 분리 예정)

---

## 1. 개요

### 1.1 목적
매매·투자 판단의 **맥락(왜 샀고, 무엇을 기대하고, 어떤 뉴스를 봤는지)** 을 기록하는 기능. 기존 브로커리지 앱이 제공하지 않는 투자 일지 역할을 한다. 모든 메모는 작성 일시와 함께 저장되며, 0개 이상의 엔티티(종목·매매이벤트·뉴스·섹터)와 연결될 수 있다.

### 1.2 투자 일지와의 통합
이전에 구상했던 투자 일지의 세 갈래(매수/매도 이유 기록, 목표가 메모, 뉴스 스크랩-메모)는 **별도 기능이 아니라 메모의 연결 유형으로 흡수**한다.
- 매수/매도 이유 → 매매이벤트에 연결된 메모
- 목표가 메모 → 종목에 연결되고 `goal_price`가 채워진 메모
- 뉴스 스크랩 → 뉴스에 연결된 메모

### 1.3 핵심 원칙
- 메모는 **주관적 기록**이므로 자유롭게 수정·삭제 가능하다. 금융 이벤트의 *무수정 원칙(no retroactive modification)* 적용 대상이 **아니다**.
- 엔티티 연결은 **다대다**이며, 한 메모가 여러 엔티티(혼합 타입 포함)에 동시에 연결될 수 있다.

---

## 2. 범위

### 2.1 포함 (MVP)
- 메모 생성·조회·수정·삭제 (CRUD)
- 다중 엔티티 연결: 종목 / 매매이벤트 / 뉴스 / 섹터 / 연결 없음
- 종목 연결 시 `goal_price`(목표가) 입력
- 보기 화면: **달력형**, **리스트형**
- 필터: 종목별 / 매매이벤트 연관 / 뉴스 연관 / 섹터별 / 연결 없음 (조건 AND 결합)
- 엔티티 타입별 색상 표시
- 섹터 분류 체계 도입(GICS 11 + 가상자산), 종목당 섹터 1개, 자동 추천 + 수동 보정
- 매수/매도 입력 폼에서 메모 작성 → 이벤트·종목 자동 연결

### 2.2 제외 (후순위 → PRD-003a)
- 메모 과거 날짜 지정(backdating) — MVP는 `created_at` 기준 고정
- 목표가 도달 알림
- 암호화폐 테마(섹터) 세분화 — MVP는 `가상자산` 단일 버킷
- 목표가 매수/매도 구분(`goal_price_kind`)
- 섹터 비중 파이차트 (별도 PRD)

---

## 3. 데이터 모델

> 컬럼명·테이블명은 기존 스키마와 대조하여 조정. 아래 `stocks` / `account_events` / `news`는 기존 마스터·이벤트 테이블을 가리킴(없으면 신설).
> 모든 테이블에 Supabase RLS 적용: `user_id = auth.uid()` 정책.

```sql
-- 메모 본체
create table memos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id),
  body        text not null,
  created_at  timestamptz not null default now(),  -- 작성 일시 (달력 배치 기준)
  updated_at  timestamptz not null default now()
);

-- 종목 연결 (목표가 포함)
create table memo_stocks (
  memo_id     uuid not null references memos(id) on delete cascade,
  stock_id    uuid not null references stocks(id) on delete cascade,
  goal_price  numeric null,   -- 해당 종목의 통화 기준값. 표시 시 KRW 환산.
  primary key (memo_id, stock_id)
);

-- 매매이벤트 연결 (매수/매도 이유)
create table memo_trade_events (
  memo_id   uuid not null references memos(id) on delete cascade,
  event_id  uuid not null references account_events(id) on delete cascade,
  -- 참조 대상은 account_events.type in ('buy','sell') 로 제한 (앱/체크 제약)
  primary key (memo_id, event_id)
);

-- 뉴스 연결 (스크랩)
create table memo_news (
  memo_id  uuid not null references memos(id) on delete cascade,
  news_id  uuid not null references news(id) on delete cascade,
  primary key (memo_id, news_id)
);

-- 섹터 연결 (테마)
create table memo_sectors (
  memo_id    uuid not null references memos(id) on delete cascade,
  sector_id  int  not null references sectors(id) on delete cascade,
  primary key (memo_id, sector_id)
);

-- 섹터 마스터 (고정 시드: GICS 11 + 가상자산)
create table sectors (
  id    int primary key,
  code  text not null unique,   -- 'IT', 'HEALTHCARE', ... , 'CRYPTO'
  name  text not null           -- '정보기술', '헬스케어', ... , '가상자산'
);

-- 기존 stocks 테이블에 컬럼 추가 (종목당 섹터 1개)
alter table stocks add column sector_id int null references sectors(id);

-- KR 업종 → GICS 매핑 (자동 추천용 시드 테이블)
create table kr_sector_map (
  naver_industry text primary key,  -- 네이버 업종명 (예: '반도체')
  sector_id      int not null references sectors(id)
);
```

권장 인덱스:
```sql
create index on memo_stocks (stock_id);
create index on memo_trade_events (event_id);
create index on memo_news (news_id);
create index on memo_sectors (sector_id);
create index on memos (user_id, created_at);
```

---

## 4. 엔티티 연결 규칙

- **다대다, 타입별 분리 junction.** 폴리모픽 단일 테이블(`entity_type + entity_id`) 대신 타입별 분리 테이블을 사용한다. 이유: 진짜 FK 제약과 캐스케이드 삭제 확보, ID 타입 상이성 흡수, RLS·인덱스 단순화, 타입별 필터가 조인 한 번으로 해결.
- **종목 ↔ 매매이벤트 암시 관계.** 매매이벤트는 본질적으로 특정 종목에 귀속된다. 메모를 매매이벤트에 연결하면 해당 종목에도 자동 연결하는 것을 권장(아래 4.1).
- 메모 삭제 시 모든 연결 행 cascade 삭제. 연결 엔티티 삭제 시 해당 연결 행만 cascade 삭제되고 **메모 본체는 유지**된다.

### 4.1 종목 필터의 매매이벤트 포함 규칙
"종목 X" 필터 시 다음을 모두 노출(기본값):
1. `memo_stocks`로 X에 직접 연결된 메모
2. X에 속한 매매이벤트(`memo_trade_events`)에 연결된 메모

"직접 연결만 보기" 토글로 (1)만 볼 수 있게 한다.

---

## 5. 색상 / 표시 규칙

엔티티 **타입별** 고정 팔레트(개별 종목 단위 색상은 종목 수 과다로 도입하지 않음).

| 타입 | 색상(예시) |
|------|-----------|
| 종목 | 파랑 `#3B82F6` |
| 매매이벤트 | 초록 `#22C55E` |
| 뉴스 | 보라 `#8B5CF6` (주황은 대시보드 배당 점과 충돌 → 회피) |
| 섹터 | 청록 `#14B8A6` |
| 연결 없음 | 회색 `#9CA3AF` |

- **리스트형**: 메모마다 연결된 엔티티를 칩(태그)으로 표시. 칩 배경 = 타입 색, 라벨 = 엔티티 이름. 다중 연결 시 칩 여러 개.
- **달력형**: 칸 공간 제약상, 그날 메모들의 **타입만 중복 제거**해 작은 점으로 표시(최대 4개). 점 색 = 타입 색.

---

## 6. 화면

### 6.1 달력형
- `created_at` 기준으로 메모를 날짜 칸에 배치.
- 각 칸: 그날 존재하는 연결 타입을 작은 점으로(섹션 5).
- 날짜 탭 → 그날의 리스트형으로 진입.

### 6.2 리스트형
- 최신순(`created_at desc`) 정렬.
- 각 행: 본문 미리보기 + 작성 일시 + 연결 엔티티 칩.

### 6.3 필터 (AND 결합)
- 종목별(가장 중요) — 4.1 규칙 적용, "직접 연결만" 토글
- 매매이벤트 연관 메모만
- 뉴스 연관 메모만
- 섹터별
- 연결 없음(일반 메모)

### 6.4 메모 작성/편집
- 본문 입력 + 엔티티 연결 선택(종목/이벤트/뉴스/섹터, 복수 선택).
- 종목 선택 시 목표가 입력 필드 노출(선택 입력).
- 작성 후 수정·삭제 가능.

### 6.5 매수/매도 폼 통합
- 매수/매도 입력 폼에 "메모 작성" 옵션 → 저장 시 메모 생성 + 해당 이벤트 및 종목에 자동 연결.
- 기존 이벤트에 나중에 메모를 붙이는 경로도 제공.

---

## 7. 섹터 서브시스템

### 7.1 분류 체계
**GICS 11개 + 가상자산 = 12개.** 시장(KR/US)에 관계없이 단일 체계로 통일(포트폴리오 전체 섹터 비중 합산을 위해).

| code | name |
|------|------|
| IT | 정보기술 |
| HEALTHCARE | 헬스케어 |
| FINANCIALS | 금융 |
| CONS_DISC | 경기소비재 |
| CONS_STAPLES | 필수소비재 |
| COMM | 커뮤니케이션서비스 |
| INDUSTRIALS | 산업재 |
| MATERIALS | 소재 |
| ENERGY | 에너지 |
| UTILITIES | 유틸리티 |
| REAL_ESTATE | 부동산 |
| CRYPTO | 가상자산 |

### 7.2 종목 → 섹터 지정 (자동 추천 + 수동 보정)
- **미국 주식**: Yahoo Finance가 GICS 섹터를 직접 제공 → 그대로 매핑.
- **한국 주식**: 네이버가 자체 업종만 제공 → `kr_sector_map` 매핑 테이블을 거쳐 GICS로 변환. (매핑 테이블 1회 구축·시드 필요)
- **암호화폐**: `가상자산` 고정.
- 종목 등록 시 위 규칙으로 `sector_id`를 자동 추천(pre-fill)하고, 사용자가 수동으로 변경(보정) 가능.

### 7.3 선행 작업
- `sectors` 시드 12행 삽입.
- `kr_sector_map` 초기 매핑 시드(보유/관심 종목 업종 위주로 시작, 점진 확장).

---

## 8. 엣지 케이스 / 미해결

- **다중 타입 메모의 달력 점**: 타입 중복 제거 후 점이 4개를 초과할 가능성은 낮으나, 초과 시 우선순위(종목 > 매매이벤트 > 뉴스 > 섹터) 또는 "+N" 처리 — 추후 결정.
- **목표가 통화/환산**: 비교는 종목 원통화로, 표시만 KRW 환산. 환율은 기존 `fx_rates` 캐시 사용.
- **연결 엔티티 삭제**: 연결 행만 삭제, 메모 본체 유지(섹션 4). 연결이 전부 사라지면 자동으로 "연결 없음" 메모가 됨.
- **stocks 키 설계**: 위 DDL은 `stocks(id)` 서로게이트 키를 가정. 동일 티커가 시장별로 중복될 수 있으므로 티커 단독 키는 지양.

---

## 9. 향후 확장 (PRD-003a 후보)
- 메모 과거 날짜 지정(backdating) 및 캘린더 배치 기준 선택
- 목표가 도달 알림(목표 매수/매도가 구분 `goal_price_kind` 포함)
- 암호화폐 테마(섹터) 세분화
- 섹터 비중 파이차트(대시보드 연계, 별도 PRD)
- 메모 검색(전문 검색), 태그/즐겨찾기