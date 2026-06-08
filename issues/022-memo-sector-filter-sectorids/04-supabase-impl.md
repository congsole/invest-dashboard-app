# Supabase 구현 내역

## 마이그레이션
- `app/supabase/migrations/20260608000000_memo_sector_filter_self_inclusive.sql`

## Edge Functions
해당 없음.

## 클라이언트 유틸
- `app/services/memo.ts` — 변경 없음. 기존 `listMemos` 함수가 `p_sector_ids` 파라미터를 그대로 RPC에 전달하므로 서비스 레이어 수정 불필요.

## 분석 및 구현 상세

### 현황 파악

이슈 022는 `list_memos` RPC의 직접 연결 경로(`memo_sectors`)가 지정된 섹터의 "하위 레벨만" 탐색하는 것을 "자신 및 하위 레벨" 포함으로 수정하는 것을 요구한다.

기존 마이그레이션 히스토리를 추적한 결과:

| 마이그레이션 | 섹터 필터 구현 방식 |
|---|---|
| `20260604000002_memo_filter_recreate.sql` | `mse.sector_id = any(p_sector_ids)` — 재귀 없음, 지정된 id만 단순 매칭 |
| `20260605000001_memo_sector_filter_rpc.sql` | 재귀 CTE `sector_descendants` 도입. anchor에 `p_sector_ids` 자신 포함 → **이미 올바른 구현** |

원격 DB에 이미 `20260605000001`이 적용되어 있으며, 해당 함수의 `sector_descendants` CTE anchor가:
```sql
select id from sectors where id = any(p_sector_ids)
```
로 섹터 자신을 포함하므로, L1 id만 전달해도 L1 자신에 직접 연결된 메모가 반환된다.

### 이슈 022에서 수행한 작업

1. **원격 DB 함수 소스 조회로 현재 구현 확인** — `20260605000001`의 로직이 정확히 적용되어 있음을 검증.

2. **마이그레이션 히스토리 정리** — `20260604000000_memo_filter_update.sql`이 두 파일(`fix_memo_functions_asset_type.sql`과 동일 타임스탬프)로 인해 원격 히스토리에 기록되지 않은 상태였음. `supabase migration repair --status applied 20260604000000`으로 히스토리 동기화.

3. **이슈 022 마이그레이션 파일 작성 및 DB 적용** — `20260608000000_memo_sector_filter_self_inclusive.sql` 생성. 함수 로직은 `20260605000001`과 동일하며, 이슈 022의 요구사항이 명시적으로 반영된 버전으로 재확정. `supabase db push` 완료.

### 최종 `list_memos` 섹터 필터 동작

```sql
WITH RECURSIVE sector_descendants AS (
  -- anchor: p_sector_ids에 포함된 섹터 자신 (L1이면 L1 포함)
  SELECT id FROM sectors WHERE id = ANY(p_sector_ids)
  UNION ALL
  -- recursive: 하위 레벨 전체 탐색 (L2, L3, L4)
  SELECT s.id FROM sectors s
  JOIN sector_descendants d ON s.parent_id = d.id
),
sector_memo_ids AS (
  -- 종목 경로: descendants에 속하는 종목과 연결된 메모
  SELECT DISTINCT ms.memo_id FROM memo_stocks ms
  JOIN stocks st ON st.id = ms.stock_id
  WHERE st.sector_id IN (SELECT id FROM sector_descendants)
  UNION
  -- 직접 연결 경로: 자신 및 하위 레벨에 직접 연결된 메모
  SELECT DISTINCT mse.memo_id FROM memo_sectors mse
  WHERE mse.sector_id IN (SELECT id FROM sector_descendants)
)
```

- `p_sector_ids = [L1_id]` 전달 시 → L1 자신에 직접 연결된 메모 + L1 하위(L2~L4) 연결 메모 모두 반환
- `p_sector_ids = [L1_id, L2_id, ...]` 전달 시 → L1+L2+하위 전체 포함 (중복은 DISTINCT로 제거)

## 사전 의존성 체크리스트

추가 수동 설정 항목 없음.

- [x] `list_memos` RPC 재귀 CTE 자신 포함 — 원격 DB에 `20260608000000` 마이그레이션으로 반영 완료 — smoke test: `supabase db query --linked "select count(*) from pg_proc where proname = 'list_memos'"` → 1건 반환

## 특이사항

- `20260604000000_memo_filter_update.sql`과 `20260604000000_fix_memo_functions_asset_type.sql` 두 파일이 동일 타임스탬프를 가지고 있어 Supabase CLI가 한 파일을 미적용으로 인식하는 문제가 있었다. `supabase migration repair`로 히스토리를 정상화했다.
- 서비스 레이어(`app/services/memo.ts`)의 `listMemos` 함수는 변경 불필요. RPC 파라미터 구조가 동일하므로 클라이언트 코드는 그대로 동작한다.
- 프론트엔드 `sectorIds` 상태 관리 변경(L2 미로딩 시 L1 id만으로 즉시 적용, L2 로딩 후 보충 추가)은 `frontend-impl-agent` 소관이며 이번 BE 트랙에서는 해당 없다.
