# PRD-005: 섹터 검색

> 상태: 기획 초안
> 선행: PRD-004(섹터 계층화)
> 변경 대상: `CascadingSectorPicker` 컴포넌트, `sectors` 서비스

---

## 1. 개요

### 1.1 목적
메모 작성/편집 시 섹터를 연결할 때, 현재는 L1부터 단계별로 펼쳐가며 찾아야 한다. GICS 273개 섹터 중 원하는 항목이 어느 계층에 속하는지 모르면 찾기 어렵다. **키워드 검색으로 섹터를 빠르게 찾고, 해당 섹터의 전체 계층 경로(L1→L4)를 확인한 뒤 선택**할 수 있도록 한다.

### 1.2 배경
- 현재 `CascadingSectorMultiPicker`는 L1 → L2 → L3 → L4를 순차적으로 펼쳐가며 선택하는 방식.
- "전기부품및장비"를 찾으려면 `산업재 > 자본재 > 전기장비 > 전기부품및장비` 경로를 알아야 하는데, 이 경로를 모르면 L1 11개를 하나씩 열어봐야 한다.
- 섹터 총 ~273개이므로 전체를 한 번에 가져와 클라이언트에서 검색하는 것이 서버 왕복 대비 가장 빠르고 간단하다.

### 1.3 핵심 변경
1. `CascadingSectorMultiPicker` 상단에 검색 입력 필드 추가.
2. 전체 섹터 데이터를 앱 시작 시(또는 최초 사용 시) 1회 로드하여 클라이언트 캐시.
3. 검색어 입력 시 클라이언트 사이드 필터링으로 매칭 섹터를 계층 경로(breadcrumb)와 함께 표시.
4. 검색 결과에서 섹터를 탭하면 기존 선택/해제 동작과 동일하게 처리.

---

## 2. 범위

### 2.1 포함
- 섹터 검색 입력 필드 (CascadingSectorMultiPicker 내)
- 전체 섹터 1회 로드 및 클라이언트 캐시 (앱 세션 내)
- 클라이언트 사이드 검색 (한글명 + 영문명, 공백 무시 매칭)
- 검색 결과를 계층 경로(breadcrumb)로 표시
- 매칭 섹터 탭 시 선택/해제
- 검색어 비우면 기존 cascading UI로 복귀

### 2.2 제외 (후순위)
- 사용자 커스텀 섹터/테마 (별도 PRD)
- 메모 필터 화면의 섹터 검색 (본 PRD는 메모 작성/편집 화면만 대상)
- 섹터 즐겨찾기/최근 사용

---

## 3. 데이터

### 3.1 전체 섹터 로드

기존 `getSectors()` 서비스를 파라미터 없이 호출하면 전체 ~273개를 반환한다 (이미 지원됨). 이를 한 번 로드하여 메모리에 캐시한다.

```typescript
// 전체 섹터를 1회 로드
const allSectors = await getSectors(); // ~273개, level/parent_id 포함
```

### 3.2 계층 경로 구축

전체 섹터가 메모리에 있으므로 `parent_id`를 따라 올라가며 breadcrumb을 클라이언트에서 직접 구축한다. `get_sector_breadcrumb` RPC 호출 불필요.

```typescript
// parent_id 체인으로 경로 구축
function buildBreadcrumb(sector: Sector, allSectors: Sector[]): Sector[] {
  const path: Sector[] = [sector];
  let current = sector;
  while (current.parent_id !== null) {
    const parent = allSectors.find(s => s.id === current.parent_id);
    if (!parent) break;
    path.unshift(parent);
    current = parent;
  }
  return path; // [L1, L2, L3, L4] 순서
}
```

lookup을 위한 Map은 초기 로드 시 한 번만 생성한다.

---

## 4. 검색 로직

### 4.1 매칭 규칙

1. **최소 입력**: 2글자 이상부터 검색 시작.
2. **공백 무시**: 검색어와 섹터명 모두 공백을 제거한 뒤 비교. "2차 전지" → "2차전지", "전기 장비" → "전기장비".
3. **대소문자 무시**: 영문 검색 시 case-insensitive. "semi" → "Semiconductor Manufacturing".
4. **검색 대상**: `name`(한글명) + `name_en`(영문명) 모두 매칭.
5. **부분 일치**: `includes` 기반. "반도" → "반도체", "반도체제조", "반도체장비" 등.

```typescript
function searchSectors(query: string, allSectors: Sector[]): Sector[] {
  const normalizedQuery = query.replace(/\s/g, '').toLowerCase();
  if (normalizedQuery.length < 2) return [];

  return allSectors.filter(sector => {
    const nameMatch = sector.name.replace(/\s/g, '').toLowerCase().includes(normalizedQuery);
    const nameEnMatch = sector.name_en
      ? sector.name_en.replace(/\s/g, '').toLowerCase().includes(normalizedQuery)
      : false;
    return nameMatch || nameEnMatch;
  });
}
```

### 4.2 디바운스

입력 후 **300ms** 대기 후 검색 실행 (기존 종목 검색과 동일한 UX 패턴).

---

## 5. UI

### 5.1 검색 입력 필드

`CascadingSectorMultiPicker` 최상단에 검색 입력 필드를 추가한다.

```
┌─────────────────────────────────────┐
│  🔍  섹터 검색...                    │
└─────────────────────────────────────┘
```

- placeholder: "섹터 검색..."
- 우측 X 버튼: 검색어 클리어 → 기존 cascading UI로 복귀
- 키보드 타입: default

### 5.2 검색 결과 표시

검색어가 있으면 기존 cascading UI를 숨기고, 검색 결과 리스트를 표시한다.

#### 결과 항목 레이아웃

각 결과는 **계층 경로(breadcrumb)**로 표시하여 "이 섹터가 어디에 속하는지"를 즉시 파악할 수 있게 한다. 매칭된 섹터 이름은 볼드 처리한다.

```
산업재 > 자본재 > 전기장비 > [전기부품및장비]     L4
소재 > 소재 > 화학 > [다각화화학]                L4
산업재 > 자본재 > [전기장비]                     L3
```

- 경로 구분자: ` > ` (chevron)
- 매칭된 섹터: **볼드 + 포인트 색상**(#003ec7)
- 레벨 배지: 우측에 `L1`~`L4` 표시 (기존 EntityChip의 레벨 배지와 동일한 스타일)
- 이미 선택된 섹터: 체크마크(✓) 또는 선택 상태 배경색

#### 결과 정렬

1. 레벨 오름차순 (L1 → L4): 상위 분류가 먼저 나오도록.
2. 같은 레벨 내에서는 이름 가나다순.

#### 결과 없음

```
검색 결과 없음
```

#### 결과 탭 동작

- 탭 → 해당 섹터를 선택 목록에 추가/제거 (기존 `onToggle`과 동일)
- 선택 후 검색 입력 필드는 유지 (연속 검색 가능)

### 5.3 모드 전환

| 상태 | 표시 내용 |
|------|-----------|
| 검색어 없음 | 기존 cascading UI (L1 칩 목록 → 펼침 → L2 → ...) |
| 검색어 있음 (2글자 미만) | 기존 cascading UI 유지 |
| 검색어 있음 (2글자 이상) | 검색 결과 리스트 |

---

## 6. 적용 범위

### 6.1 MemoEditScreen — CascadingSectorMultiPicker

본 PRD의 주요 대상. 메모 작성/편집 시 섹터를 검색하여 연결한다.

### 6.2 StockSearchModal — CascadingSectorPicker (단일 선택)

종목 등록 시 sector_id가 null인 경우 섹터를 수동 지정하는 `CascadingSectorPicker`(단일 선택 모드)에도 동일한 검색 기능을 추가한다. 동작은 동일하되, 탭 시 즉시 해당 섹터로 확정된다.

---

## 7. 구현 방향

### 7.1 변경 파일

| 파일 | 변경 내용 |
|------|-----------|
| `app/services/sectors.ts` | `getAllSectorsWithCache()` — 전체 섹터 1회 로드 + 캐시 |
| `app/hooks/useSectorSearch.ts` | (신규) 검색 로직 훅: 전체 로드, 디바운스, 필터링, breadcrumb 구축 |
| `app/components/CascadingSectorPicker.tsx` | 검색 입력 필드 추가, 검색 모드/cascading 모드 전환, 검색 결과 리스트 렌더링 |

### 7.2 전체 섹터 캐시 전략

- 모듈 레벨 변수로 캐시 (앱 세션 내 유지, 재시작 시 재로드).
- `getAllSectorsWithCache()`: 캐시가 있으면 즉시 반환, 없으면 `getSectors()`로 전체 로드 후 캐시.
- 추가 테이블 변경이나 AsyncStorage 저장은 불필요 (~273개 × 소량 필드이므로 메모리 부담 없음).

---

## 8. 엣지 케이스

- **한글 자모 미완성 입력**: "ㅈㄱ"처럼 자모만 입력된 경우 매칭되지 않을 수 있음 → 2글자 이상 완성된 글자부터 검색이므로 큰 문제 없음.
- **영문-한글 혼합 검색**: "IT" 입력 시 `name_en`에 "IT"가 포함된 섹터 매칭 (e.g., "Information Technology"). `name`이 "IT"인 섹터는 현재 없으므로 영문 검색으로 처리.
- **전체 섹터 로드 실패**: 네트워크 오류 시 검색 불가 → 에러 메시지 표시, 기존 cascading UI는 정상 동작 (레벨별 개별 로드이므로).
- **검색 결과 다수**: 최대 273개이므로 성능 문제 없음. 별도 페이지네이션 불필요.
