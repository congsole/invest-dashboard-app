# [014] 메모 필터 기능 수정

<!-- PM-agent 작성 -->
## 개요

메모 목록 조회 RPC(`list_memos`)의 필터 파라미터를 단건에서 배열로 변경하여 복수 종목/섹터 OR 필터를 지원하고, "직접 연결만 보기" 토글을 제거한다. 필터 결합 규칙(같은 타입 내 OR, 타입 간 AND, `p_no_links` 상호 배타적)을 명확히 구현한다.

**BE**: `list_memos` DB Function 시그니처 및 로직 수정
**FE**: 메모 화면 필터 UI 수정 (복수 선택, 토글 제거, 필터명 변경)

## 참조 문서
- 커밋: 11f2f4c6c4794b7b555ee2cbcbfd56e9b4d641bf — [Docs] 메모 필터 기능 수정
- 기획서: docs/planning/PRD-003-memo.md

## docs 변경 내역

### domain-model.md
- (변경 없음)

### db-schema.md
- (변경 없음)

### api-spec.md
- [수정] Memo — 메모 목록 조회(list_memos) RPC 파라미터 변경
  - `p_stock_id` (uuid 단건) → `p_stock_ids` (uuid[] 배열): 복수 종목 OR 필터 지원
  - `p_include_trade_events` (boolean) 파라미터 제거: "직접 연결만 보기" 토글 폐지, 종목 필터는 직접 연결 + 매매이벤트 경유 연결을 항상 함께 반환
  - `p_sector_id` (number 단건) → `p_sector_ids` (number[] 배열): 복수 섹터 OR 필터 지원
  - RPC 호출 시그니처: `supabase.rpc('list_memos', { p_from, p_to, p_stock_ids, p_trade_events_only, p_news_only, p_sector_ids, p_no_links, p_limit, p_offset })`
  - 필터 결합 규칙 설명 추가: 같은 타입 내 OR, 타입 간 AND, `p_no_links` 상호 배타적

<!-- 구현 단계에서 업데이트 -->
## 구현 현황
- [x] Supabase 구현
- [x] 백엔드 테스트
- [x] 프론트엔드 구현
