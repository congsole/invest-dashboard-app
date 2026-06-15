# [026] 메모 측 매매이벤트 연결 UI

<!-- PM-agent 작성 -->
## 개요

메모 작성/편집 화면에서 기존 매수/매도 이벤트를 직접 선택해 연결하는 경로를 추가한다 (PRD-003 §6.4).

기존에는 매수/매도 폼(§6.5)에서 메모를 동시 작성할 때만 매매이벤트가 연결됐고, 메모 측에서 기존 이벤트를 골라 붙이거나 해제하는 경로가 없었다. 이번 작업은 메모 작성/편집 화면에 "매매이벤트" 선택 행과 선택 모달을 추가하여 이 경로를 구현한다.

데이터 레이어(`memo_trade_events` 테이블, `create_memo_with_links`/`update_memo_with_links`의 `p_trade_event_ids`, `linkMemoTradeEvent`/`unlinkMemoTradeEvent` 서비스 함수, `account_events` REST 조회)는 이미 구현·문서화 완료이며, 신규 BE 구현은 없다.

**Acceptance Criteria (PRD-003 §6.4 기준):**

- 메모 작성 화면에 "매매이벤트" 연결 행이 표시된다.
- 행을 탭하면 선택 모달이 열리고, 본인의 `account_events` 중 `event_type IN ('buy', 'sell')`만 최신순(`event_date desc`)으로 나열된다.
- 각 항목은 `발생일 · 매수/매도 · 종목명 · 수량 @ 체결가(통화)` 형식으로 표시되며, 매수/매도는 색상·라벨로 구분된다.
- 모달 상단에 종목명·티커 텍스트 검색(디바운스 300ms)과 기간 필터(시작~종료일)를 제공한다. 검색/필터 결과도 최신순 정렬을 유지한다.
- 메모에 이미 연결된 종목이 있으면 그 종목명을 검색어 기본값으로 시드해 첫 화면에서 관련 이벤트가 먼저 보인다. 사용자는 검색어를 지워 전체 목록을 제한 없이 탐색할 수 있다.
- 여러 이벤트를 복수 선택해 칩 형태로 누적 표시한다. 중복 선택은 UI에서 차단한다(DB PK로도 자연 차단).
- 편집 화면에서 동일 모달로 기존 연결된 이벤트를 확인하고 추가·해제할 수 있다. 편집 저장 시 변경된 `p_trade_event_ids`가 `update_memo_with_links`에 반영된다.
- 연결된 매매이벤트는 기존 리스트형 칩(초록, §5) 및 상세 화면에 이미 표시되므로, 표시 레이어는 수정 불필요.

## 참조 문서
- 커밋: 30af926d20fd57d502a7b5b859abcacace1baa37 — [기획] 메모 측 매매이벤트 연결 경로 구체화 (PRD-003 §6.4·§6.5)
- 기획서: docs/planning/PRD-003-memo.md (§6.4, §6.5)

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
- [변경 없음] 엔터티·속성·관계 신규 추가 없음. MemoTradeEvent junction 및 Memo N:M AccountEvent 관계는 이미 모델링 완료. 변경 이력 항목만 추가됨.

### db-schema.md
- [변경 없음] 테이블/컬럼/인덱스/RLS 신규 추가 없음. memo_trade_events 테이블 및 ERD 관계는 이미 문서화 완료. 변경 이력 항목만 추가됨.

### api-spec.md
- [보강] AccountEvent — 계정 이벤트 목록 조회: `q` 파라미터 신규 추가(종목명·티커 ilike 검색), `order` 파라미터 신규 추가(기본 `event_date.desc`), `event_type` 복수 지정(OR 결합) 및 매매이벤트 선택 모달 호출 패턴(`in.(buy,sell)`) 명시, 매매이벤트 선택 모달용 호출 패턴 3종 추가.
- [변경 없음] Memo — `create_memo_with_links`·`update_memo_with_links` `p_trade_event_ids` 및 메모 엔티티 연결 추가/해제(`memo_trade_events`)는 이미 명세 완료.

<!-- 구현 단계에서 업데이트 -->
## 구현 현황
- [x] Supabase 구현 — N/A (기존 테이블·RPC 그대로 사용, 신규 마이그레이션 없음)
- [x] 백엔드 테스트 — N/A (BE 신규 구현 없음)
- [x] 프론트엔드 구현
- [ ] 수동 테스트
