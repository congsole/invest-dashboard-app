# Supabase 구현 내역

## 마이그레이션
- `app/supabase/migrations/20260605000001_memo_sector_filter_rpc.sql`
  - `list_memos` DROP 후 재생성 — 섹터 필터에 재귀 CTE 기반 두 경로 합산 적용
  - `create_memo_with_links` CREATE OR REPLACE — sectors 응답에 `level`, `name_en` 추가
  - `update_memo_with_links` CREATE OR REPLACE — sectors 응답에 `level`, `name_en` 추가

## Edge Functions
없음 (DB Function으로 구현)

## 클라이언트 유틸
- `app/services/memo.ts`
  - `getSectors()` — select 컬럼 `*` → `id, code, name, name_en, parent_id, level` 명시
  - `getMemo()` — sectors join 컬럼에 `level` 추가 (`sectors(id, code, name, level)`)

- `app/types/memo.ts`
  - `Sector` — `name_en: string | null`, `parent_id: number | null`, `level: 1|2|3|4` 필드 추가
  - `MemoSector` — `name_en: string | null`, `level: 1|2|3|4` 필드 추가
  - `MemoDetail.memo_sectors[].sectors` — `level: 1|2|3|4` 필드 추가

## list_memos 섹터 필터 변경 상세

기존: `memo_sectors`에서 `sector_id = any(p_sector_ids)` 직접 비교만 수행.

변경 후: 재귀 CTE로 지정된 섹터의 모든 하위 sector_id 집합(`sector_descendants`)을 구한 뒤,

1. **종목 경로**: `memo_stocks JOIN stocks WHERE stocks.sector_id IN descendants`
2. **직접 연결 경로**: `memo_sectors WHERE sector_id IN descendants`

두 경로를 `UNION`하여 `sector_memo_ids` CTE 구성, `m.id IN (sector_memo_ids)` 조건 적용.
카운트 쿼리와 목록 쿼리 양쪽에 동일 CTE 패턴 적용.

## DB 적용 확인
`supabase db push` 성공 (2026-06-05). 마이그레이션 버전 `20260605000001` 원격 적용 완료.

## 사전 의존성 체크리스트
- [x] `sectors.level`, `sectors.name_en` 컬럼 존재 — 이슈 016 마이그레이션에서 이미 추가됨 — `supabase migration list`로 20260605000000 적용 확인
- [x] `memo_sectors.sector_id`가 L1~L4 어느 레벨이든 FK 허용 — sectors 테이블 FK만 걸려 있으므로 레벨 제한 없음 — 코드 레벨 확인 완료

## 특이사항
- `20260604000000` 타임스탬프 충돌: `fix_memo_functions_asset_type.sql`과 `memo_filter_update.sql` 두 파일이 동일 타임스탬프를 가져 `supabase db push`가 중복 키 오류를 냄. 신규 마이그레이션만 선택적으로 적용하기 위해 중복 파일을 일시 리네임(`.bak`)하여 push 성공 후 복원함. 근본 해결은 두 파일 중 하나의 타임스탬프를 변경하는 것이나 기존 원격 기록을 건드리는 작업이므로 현재 이슈 범위 외.
- `create_memo_with_links` / `update_memo_with_links` 응답의 `stocks` 섹션 `asset_type` 필드는 이전에도 DB에 해당 컬럼이 없어 반환되지 않았음 — 이슈 012 마이그레이션에서 `market`으로 대체. 이번 재정의에서도 `market` 필드로 통일.
