# PRD-006: 사용자 카테고리

> 상태: 기획 초안
> 선행: PRD-003(메모), PRD-004(섹터 계층화)
> 변경 대상: DB 테이블 신규, `list_memos` RPC, 메모 작성/편집 화면, 메모 필터

---

## 1. 개요

### 1.1 목적
GICS 분류 체계에는 "2차전지", "AI반도체" 같은 한국 시장에서 통용되는 테마 분류가 없다. 사용자가 **직접 카테고리를 만들고, 종목을 카테고리에 배정하고, 메모에 카테고리를 연결**할 수 있도록 한다. GICS 섹터와는 독립적으로 운영되며, 기존 섹터 기능을 대체하지 않는다.

### 1.2 배경
- GICS에서 LG에너지솔루션, 삼성SDI는 "전기부품및장비"(L4)에 분류되어 있으나, 투자자 관점에서는 "2차전지"로 묶어 생각한다.
- WICS, ICB 등 다른 공식 분류 체계에도 "2차전지"라는 카테고리는 없다.
- 네이버 금융 테마 분류는 비공식이며 계층이 없는 플랫 구조.
- 사용자마다 관심 테마가 다르므로, 사용자 정의 카테고리가 가장 유연하다.

### 1.3 핵심 변경
1. `user_categories` 테이블 신규 — 사용자별 카테고리 마스터.
2. `user_category_stocks` 테이블 신규 — 카테고리-종목 N:M 매핑.
3. `memo_categories` 테이블 신규 — 메모-카테고리 N:M 연결.
4. 메모 작성/편집 화면에 카테고리 연결 UI 추가.
5. 메모 필터에 카테고리 필터 행 추가.
6. `list_memos` RPC에 카테고리 필터 로직 추가.

---

## 2. 범위

### 2.1 포함
- 카테고리 CRUD (생성, 조회, 수정, 삭제)
- 카테고리에 종목 추가/제거
- 메모에 카테고리 직접 연결/해제
- 메모 필터에서 카테고리 기반 필터링 (직접 연결 + 종목 경유)
- 카테고리 관리 화면 (카테고리 목록, 종목 편집)

### 2.2 제외 (후순위)
- 카테고리 계층 구조 (현재는 플랫)
- 카테고리 공유 (다른 사용자와)
- 카테고리별 수익률/비중 차트
- 카테고리 아이콘/색상 커스터마이징

---

## 3. 데이터 모델

### 3.1 user_categories (신규)

사용자별 카테고리 마스터. 플랫 구조 (계층 없음).

```sql
create table user_categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,              -- 카테고리명 (예: '2차전지', 'AI반도체')
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, name)                  -- 같은 사용자 내 카테고리명 중복 불가
);
```

**인덱스**
- `idx_user_categories_user_id` ON (user_id) — 사용자별 카테고리 목록 조회

**RLS 방향**
- SELECT / INSERT / UPDATE / DELETE: 본인(`auth.uid() = user_id`)만 허용

### 3.2 user_category_stocks (신규)

카테고리-종목 N:M 매핑. 한 종목이 여러 카테고리에 속할 수 있고, 한 카테고리에 여러 종목이 포함될 수 있다.

```sql
create table user_category_stocks (
  category_id uuid not null references user_categories(id) on delete cascade,
  stock_id    uuid not null references stocks(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (category_id, stock_id)
);
```

**인덱스**
- `idx_user_category_stocks_stock_id` ON (stock_id) — 종목별 소속 카테고리 역방향 조회

**RLS 방향**
- SELECT / INSERT / DELETE: category_id를 통해 user_categories.user_id = auth.uid() 검증

### 3.3 memo_categories (신규)

메모-카테고리 N:M 연결 junction 테이블. 기존 `memo_sectors`와 동일한 패턴.

```sql
create table memo_categories (
  memo_id     uuid not null references memos(id) on delete cascade,
  category_id uuid not null references user_categories(id) on delete cascade,
  primary key (memo_id, category_id)
);
```

**인덱스**
- `idx_memo_categories_category_id` ON (category_id) — 카테고리별 연결 메모 역방향 조회

**RLS 방향**
- SELECT / INSERT / DELETE: memo_id를 통해 memos.user_id = auth.uid() 검증

---

## 4. 메모-카테고리 필터링 규칙

섹터 필터(PRD-004 §3.4)와 동일한 두 경로 합산(OR) 패턴을 따른다:

1. **종목 경로**: 선택된 카테고리에 속하는 종목(`user_category_stocks`)과 연결된 메모(`memo_stocks`).
   - 예: "2차전지" 필터 → 카테고리에 포함된 LG에너지솔루션, 삼성SDI 등과 연결된 메모.
2. **직접 연결 경로**: `memo_categories`로 해당 카테고리에 직접 연결된 메모.
   - 예: 종목 없이 "2차전지 시장 전망" 같은 메모를 카테고리에 직접 연결한 경우.

```sql
-- 카테고리 필터 쿼리 (의사코드)
-- target_category_ids = 선택된 카테고리 ID 집합

-- 1. 종목 경로: 카테고리에 속한 종목과 연결된 메모
SELECT DISTINCT ms.memo_id FROM memo_stocks ms
JOIN user_category_stocks ucs ON ucs.stock_id = ms.stock_id
WHERE ucs.category_id = ANY(:target_category_ids)
UNION
-- 2. 직접 연결 경로
SELECT DISTINCT memo_id FROM memo_categories
WHERE category_id = ANY(:target_category_ids);
```

### 4.1 섹터 필터와의 결합

- 카테고리 필터는 섹터 필터와 **독립적인 필터 행**으로 존재한다.
- **같은 행 내 복수 선택 → OR**: 카테고리 A + 카테고리 B → 둘 중 하나라도 연관된 메모.
- **다른 행 간 → AND**: 카테고리 + 섹터 + 종목 + 토글이 모두 선택된 경우 교집합.

---

## 5. UI

### 5.1 카테고리 관리 화면

메모 관련 설정 또는 별도 진입점에서 접근.

#### 카테고리 목록
- 사용자의 카테고리를 리스트로 표시 (이름 + 소속 종목 수)
- 추가 버튼: 카테고리명 입력 → 생성
- 스와이프 또는 길게 누르기 → 이름 수정 / 삭제
- 카테고리 삭제 시 확인 다이얼로그 ("연결된 메모에서도 해제됩니다")

#### 카테고리 종목 편집
- 카테고리 탭 → 소속 종목 목록
- 종목 추가: 기존 `StockSearchModal` 재사용 (로컬 검색)
- 종목 제거: 스와이프 또는 X 버튼

### 5.2 메모 작성/편집 — 카테고리 연결

기존 섹터 연결 영역 아래에 카테고리 연결 영역을 추가한다.

```
섹터 연결
┌─────────────────────────────────────┐
│  CascadingSectorMultiPicker         │
└─────────────────────────────────────┘

카테고리 연결
┌─────────────────────────────────────┐
│  [2차전지] [AI반도체] [+ 추가]          │
└─────────────────────────────────────┘
```

- 사용자의 카테고리를 칩으로 나열, 탭하여 선택/해제
- 카테고리가 없으면 "+ 새 카테고리" 버튼 → 인라인으로 이름 입력 후 즉시 생성 및 선택
- 카테고리가 많아질 경우를 대비해 가로 스크롤 또는 검색 입력 지원

### 5.3 메모 필터 — 카테고리 행

기존 필터 구조(토글 행 → 종목 행 → 섹터 행)에 **카테고리 행**을 추가한다.

```
토글 행:    [매매 이벤트] [뉴스 연관] [연결 없음]
종목 행:    [삼성전자] [LG에너지솔루션] [...]
섹터 행:    [산업재 ▼] [IT ▼] [...]
카테고리 행: [2차전지] [AI반도체] [...]
```

- 행 왼쪽에 "카테고리" 헤더 레이블
- 칩 형태, 복수 선택 가능 (같은 행 내 OR)
- 다른 행과의 결합은 AND (기존 규칙 동일)

### 5.4 메모 리스트 — 카테고리 칩 표시

메모에 연결된 카테고리를 엔티티 칩으로 표시한다.

| 타입 | 색상 |
|------|------|
| 종목 | 파랑 `#3B82F6` |
| 매매이벤트 | 초록 `#22C55E` |
| 뉴스 | 보라 `#8B5CF6` |
| 섹터 | 청록 `#14B8A6` |
| **카테고리** | **주황 `#F59E0B`** |
| 연결 없음 | 회색 `#9CA3AF` |

달력형에서는 기존 타입별 점에 카테고리 색상 점이 추가된다 (최대 5개).

### 5.5 카테고리 관리 진입점

- 메모 필터의 카테고리 행 우측에 **편집(톱니바퀴) 아이콘** → 카테고리 관리 화면으로 이동
- 메모 작성 화면의 카테고리 영역에서도 "관리" 링크로 이동 가능

---

## 6. RPC 변경

### 6.1 list_memos

기존 파라미터에 `p_category_ids int[]`를 추가한다.

필터 로직:
- `p_category_ids`가 비어있지 않으면, §4의 두 경로(종목 경유 + 직접 연결)를 합산하여 AND 결합.
- 기존 `p_sector_ids`, `p_stock_ids`, 토글 필터와의 AND 결합은 동일.

### 6.2 create_memo / update_memo

기존 파라미터에 `p_category_ids uuid[]`를 추가한다.
- create: `memo_categories`에 INSERT.
- update: 기존 연결 삭제 후 재삽입 (memo_sectors와 동일 패턴).

---

## 7. 엣지 케이스

- **카테고리 삭제 시**: `memo_categories`, `user_category_stocks` cascade 삭제. 메모 본체는 유지 (카테고리 연결만 해제).
- **종목 삭제 시**: `user_category_stocks`에서 해당 종목 행 cascade 삭제. 카테고리 자체는 유지.
- **카테고리명 중복**: 같은 사용자 내에서 동일 이름 불가 (UNIQUE 제약). 다른 사용자와는 독립.
- **카테고리가 0개인 사용자**: 카테고리 행 자체를 숨기거나 "카테고리를 추가하세요" 안내 표시.
- **"연결 없음" 필터와의 관계**: 기존 규칙 동일 — 종목/섹터/카테고리 어떤 것도 연결되지 않은 메모. 카테고리만 연결된 메모는 "연결 없음"에 해당하지 않는다.

---

## 8. 향후 확장

- 카테고리 계층 구조 (`parent_id` 추가하여 GICS처럼 트리 형태로)
- 카테고리 아이콘/색상 커스터마이징
- 카테고리별 수익률/비중 차트
- 카테고리 공유 (공개 카테고리를 다른 사용자가 구독)
- 프리셋 카테고리 (앱에서 "2차전지", "AI반도체" 등 인기 카테고리를 기본 제공)
