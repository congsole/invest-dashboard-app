# [019] 메모 섹터 필터 RPC 로직 확장 (종목 경로 + 직접 연결 경로 OR 합산)

<!-- PM-agent 작성 -->
## 개요
메모 섹터 필터 RPC(`list_memos`)의 쿼리 로직을 확장한다. 기존에는 "종목 경로"(지정된 섹터 하위 종목에 연결된 메모)만 탐색했으나, 이번 변경으로 "직접 연결 경로"(`memo_sectors`로 해당 섹터/하위에 직접 연결된 메모)도 포함하여 두 경로를 OR 합산하도록 수정한다. 메모 생성/수정 RPC(`create_memo_with_links`, `update_memo_with_links`)의 섹터 연결은 L1~L4 어느 레벨이든 저장 가능함을 코드 레벨에서 확인하고, 응답의 `sectors` 배열에 `level` 필드를 추가한다.

## 참조 문서
- 커밋: 4edb38519c68c4df2e032a5d78ad7efcb0c3635e — [Docs] 종목 분류에 GICS 도입 (한국/미국 주식 동일하게)
- 기획서: docs/planning/PRD-004-sector-hierarchy.md (§3.4, §7.1)
- 기획서: docs/planning/PRD-003-memo.md (§6.4)

## docs 변경 내역

다음 명령으로 설계 에이전트들이 방금 업데이트한 내역을 파악한다:
```bash
git diff HEAD docs/architecture/domain-model.md
git diff HEAD docs/architecture/db-schema.md
git diff HEAD docs/api/api-spec.md
```
(아직 커밋되지 않은 변경 사항이므로 `HEAD` 기준 diff 사용)

### domain-model.md
- [추가] MemoSector — sector_id가 L1~L4 어느 레벨이든 가리킬 수 있음 명시
- [추가] MemoSector — 섹터 연결 규칙: cascading select(L1→L2→L3→L4), 중간 단계 확정 가능
- [추가] MemoSector — 메모 필터 계층 탐색 규칙: 종목 경로 + 직접 연결 경로 OR 합산

### db-schema.md
- [수정] memo_sectors — sector_id 컬럼 설명에 "L1~L4 어느 레벨이든 가능" 명시 (컬럼 추가/삭제 없음)
- [추가] memo_sectors — 섹터 연결 규칙 및 필터 계층 탐색 규칙 설명 추가
- [추가] memo_sectors — 재귀 CTE 기반 필터 쿼리 패턴(종목 경로 UNION 직접 연결 경로) 추가
- [추가] memo_sectors — 필터 UI 선택 상태 규칙(L1 partial/all 상태) 추가

### api-spec.md
- [수정] Memo — list_memos `p_sector_ids` 파라미터 설명: "종목 경로 + 직접 연결 경로 OR 합산"으로 확장
- [수정] Memo — list_memos 섹터 필터 계층 탐색 규칙: 두 경로 합산 방식으로 명확화, 재귀 CTE 탐색 방향 명시
- [추가] Memo — 메모 목록/생성/수정/상세 조회 응답의 `sectors` 배열에 `level: 1|2|3|4` 필드 추가
- [수정] Memo — create_memo_with_links `p_sector_ids` 설명에 L1~L4 어느 레벨이든 가능 및 cascading select 명시
- [수정] Memo — update_memo_with_links `p_sector_ids` 설명 동일하게 갱신
- [수정] Memo — 섹터 연결 추가 단건 API `sector_id` 설명에 레벨 제한 없음 명시
- [수정] Memo — 메모 상세 조회 REST 호출 구문에 `sectors(id, code, name, level)` level 컬럼 추가

<!-- 구현 단계에서 업데이트 -->
## 구현 현황
- [x] Supabase 구현
- [x] 백엔드 테스트
- [x] 프론트엔드 구현
