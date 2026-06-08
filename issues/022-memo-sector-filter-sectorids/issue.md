# [022] 메모 섹터 필터 — RPC 계층 탐색 규칙 수정 및 sectorIds 동작 변경

<!-- PM-agent 작성 -->
## 개요
메모 섹터 필터링에서 두 가지 동작을 수정한다.

1. **RPC `list_memos` 직접 연결 경로 수정**: 기존에는 `memo_sectors`에서 지정된 섹터의 "하위 레벨"만 탐색했으나, 이제 "자신 및 하위 레벨" 모두를 탐색한다. L1 id가 `p_sector_ids`에 포함될 경우, L1 섹터에 직접 연결된 메모도 누락 없이 반환해야 한다.

2. **프론트엔드 sectorIds 상태 관리 변경**: L1 칩 선택 시, L2가 아직 로딩되지 않은 상태에서도 L1 id만 `sectorIds`에 추가하여 필터를 즉시 적용한다. RPC 내부 재귀 CTE가 L1 하위 전체를 자동으로 포함하므로 L2 로딩 여부와 무관하게 동일한 필터 결과가 보장된다. L2 로딩 완료 후에는 L2 id들을 `sectorIds`에 보충 추가한다(L1 id 유지). 해제 시에는 L1 id + 하위 L2 id 전체를 제거한다.

## 참조 문서
- 커밋: 4cb2f1258635efe4638a0a4c1d39edc66ea67d63 — [Docs] 기획서 수정 (메모 종목 칩, 섹터 필터링 기능)
- 기획서: docs/planning/PRD-003-memo.md, docs/planning/PRD-004-sector-hierarchy.md

## docs 변경 내역

다음 명령으로 설계 에이전트들이 방금 업데이트한 내역을 파악한다:
```bash
git diff HEAD docs/architecture/domain-model.md
git diff HEAD docs/architecture/db-schema.md
git diff HEAD docs/api/api-spec.md
```
(아직 커밋되지 않은 변경 사항이므로 `HEAD` 기준 diff 사용)

변경된 내용을 요약하여 아래 형식으로 채운다:

### domain-model.md
- [수정] MemoSector — 메모 필터 계층 탐색 규칙 명확화: 직접 연결 경로가 "자신 및 하위 레벨"임을 명시. L1 "정보기술" 필터 시 L1 자신에 직접 연결된 메모도 포함 예시 추가.
- [수정] MemoSector — 필터 UI sectorIds 동작 상세화: L2 미로딩 시 L1 id만으로 즉시 필터 적용 가능(RPC 재귀 CTE 보장), 이후 L2 로딩 시 보충 추가, sectorIds에 L1+L2 id 모두 저장 명시.

### db-schema.md
- [수정] memo_sectors — 직접 연결 경로 설명을 "자신 및 하위 레벨" 포함으로 명확화. L1 선택 시 L1 자신도 포함하는 예시 추가. sectorIds 동작 상세화(L2 미로딩 시 L1 id만으로 즉시 적용 가능, 이후 L2 보충 추가, L1+L2 id 모두 저장). 스키마(테이블/컬럼) 변경 없음.

### api-spec.md
- [수정] Memo — `list_memos` RPC `p_sector_ids` 파라미터 설명 갱신: 직접 연결 경로를 "해당 섹터 자신 및 하위 레벨에 직접 연결된 메모"로 명확화. L1 id만 전달해도 RPC 내부 재귀 CTE가 하위 전체를 포함하므로 L2 로딩 여부 무관 동일 결과 보장 명시.
- [수정] Memo — `list_memos` RPC 계층 탐색 규칙 설명: 직접 연결 경로에 L1 자신 포함 예시 추가.

<!-- 구현 단계에서 업데이트 -->
## 구현 현황
- [x] Supabase 구현
- [x] 백엔드 테스트
- [x] 프론트엔드 구현
- [ ] E2E 테스트
