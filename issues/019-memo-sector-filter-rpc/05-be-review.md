# 백엔드 코드 리뷰

## Initial Review
**결과**: 이슈 1건

**이슈 목록**
- [심각도: mid] `app/services/memo.ts`: `getStock()`, `searchStocks()`의 sectors select 컬럼이 `sectors(id, code, name)`으로 `name_en`, `parent_id`, `level`이 누락됨. api-spec.md(1027행, 1069행)는 `sectors(id, code, name, name_en, parent_id, level)` 요구. 반환 타입 `Stock.sectors`가 `Sector`인데 해당 필드가 런타임에 undefined가 되어 타입 불일치 발생.

## Cycle 1
**수정 내용**
- `app/services/memo.ts` `getStock()`: `sectors(id, code, name)` → `sectors(id, code, name, name_en, parent_id, level)`
- `app/services/memo.ts` `searchStocks()`: `sectors(id, code, name)` → `sectors(id, code, name, name_en, parent_id, level)`

**Confirmation 결과**: 합격

검토 항목 최종 확인:
- list_memos 섹터 필터 두 경로 합산: 재귀 CTE + UNION(종목 경로, 직접 연결 경로) 카운트·목록 쿼리 양쪽 동일 적용 — 정상
- 재귀 CTE 방향: anchor(`id = any(p_sector_ids)`), recursive(`s.parent_id = d.id`) 하위 방향 탐색 — 정상
- create/update L1~L4 저장 제한 없음: sectors FK 검증만, 레벨 조건 없음 — 정상
- sectors 응답 level, name_en 포함: create/update RPC 응답 및 list_memos 응답 모두 포함 — 정상 (명세는 create/update에 name_en 미정의이나 추가 반환은 하위 호환)
- 카운트 쿼리 = 목록 쿼리 필터: WHERE 절 구조 동일 — 정상
- app/types/memo.ts: MemoSector(name_en, level), Sector(name_en, parent_id, level), MemoDetail.memo_sectors[].sectors(level) — 각 API 응답과 일치
- app/services/memo.ts getSectors(): `id, code, name, name_en, parent_id, level` — 명세 일치
- app/services/memo.ts getMemo(): `sectors(id, code, name, level)` — 명세 일치
- app/services/memo.ts getStock(), searchStocks(): 수정 후 명세 일치
- 에러 처리: 모든 Supabase 호출에 error 체크 — 정상
- TypeScript any 없음 — 정상
- 보안: security definer + auth.uid() 인증 확인 — 정상
- 패키지 의존성: 신규 패키지 없음 — 해당 없음
- 사전 의존성: sectors.level, sectors.name_en 이슈 016 마이그레이션에서 추가 완료 확인됨

## 최종 결과
합격
