# [009] 섹터 마스터 및 종목 마스터 데이터 레이어

<!-- PM-agent 작성 -->
## 개요
PRD-003 메모 기능의 선행 작업으로, 섹터 분류 체계(GICS 11 + 가상자산 12개)와 종목 마스터 테이블을 도입한다. sectors / stocks / kr_sector_map 테이블을 생성하고, 종목 등록 시 섹터 자동 추천(미국 주식: Yahoo Finance GICS 매핑, 한국 주식: kr_sector_map 변환, 암호화폐: CRYPTO 고정) + 수동 보정 RPC를 구현한다. 이슈 010(메모 CRUD)과 이슈 011(메모 화면 UI)의 선행 이슈다.

## 참조 문서
- 커밋: 7b4d05104904b8f40f20bd21285c4075af7ad61d — [Docs] memo 기획서 초안
- 기획서: docs/planning/PRD-003-memo.md (섹션 3 데이터 모델, 섹션 7 섹터 서브시스템)

## docs 변경 내역

다음 명령으로 설계 에이전트들이 방금 업데이트한 내역을 파악한다:
```bash
git diff HEAD docs/architecture/domain-model.md
git diff HEAD docs/architecture/db-schema.md
git diff HEAD docs/api/api-spec.md
```
(아직 커밋되지 않은 변경 사항이므로 `HEAD` 기준 diff 사용)

### domain-model.md
- [추가] Stock 엔터티 — ticker + asset_type unique, sector_id FK(nullable), 서로게이트 uuid PK
- [추가] Sector 엔터티 — GICS 11 + 가상자산 12개 고정 시드, code unique
- [추가] KrSectorMap 엔터티 — 네이버 업종명 → GICS 섹터 매핑 시드 테이블
- [추가] 관계: Stock N:1 Sector, KrSectorMap N:1 Sector

### db-schema.md
- [추가] sectors 테이블 — id(int PK), code(unique), name. RLS: SELECT 전체 공개, INSERT/UPDATE/DELETE service_role만
- [추가] stocks 테이블 — uuid PK, ticker + asset_type(UNIQUE 제약), name, sector_id FK nullable. RLS: SELECT 공개, INSERT/UPDATE 인증 사용자, DELETE service_role만
- [추가] kr_sector_map 테이블 — naver_industry PK(text), sector_id FK. RLS: SELECT 공개, INSERT/UPDATE/DELETE service_role만
- [추가] ERD 관계: stocks N:1 sectors, kr_sector_map N:1 sectors

### api-spec.md
- [추가] Sector 도메인 — 섹터 목록 조회 (REST auto-generated)
- [추가] Stock 도메인 — 종목 단건 조회 (REST auto-generated)
- [추가] Stock 도메인 — 종목 등록+섹터 자동 추천 `upsert_stock_with_sector` (RPC)
- [추가] Stock 도메인 — 종목 섹터 수동 지정/변경 (REST auto-generated)

## 구현 현황
- [x] Supabase 구현
- [x] 백엔드 테스트
- [ ] 프론트엔드 구현
- [ ] E2E 테스트
