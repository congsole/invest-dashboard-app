# [016] GICS 계층화 — DB 마이그레이션 + RPC 변경

## 개요
PRD-004에 따라 sectors 테이블을 GICS 4단계 계층 구조(L1~L4, ~273개)로 전환한다. `parent_id`/`level`/`name_en`/`created_at` 컬럼을 추가하고, gics_yfinance_map 테이블을 신규 생성하며, kr_sector_map 테이블을 DROP한다. GICS 전체 시드(L2 25개 + L3 74개 + L4 163개 = 262개)를 마이그레이션에서 일괄 등록한다. 기존 L1 12개 시드에 name_en/level/parent_id를 채운다. get_sector_breadcrumb RPC를 신규 추가하고, get_or_recommend_stock_sector RPC 파라미터를 kr_sector_map 참조 제거 · yfinance 단일 경로로 변경한다. list_memos의 섹터 필터에 계층 탐색 로직(L1 지정 시 하위 L2~L4 포함)을 추가한다.

이 이슈는 이슈 018(FE UI)과 이슈 017(배치 스크립트)의 선행 조건이다.

## 참조 문서
- 커밋: b892f6d — [Feat] 종목 분류에 GICS 도입 (한국/미국 주식 동일하게)
- 기획서: docs/planning/PRD-004-sector-hierarchy.md

## docs 변경 내역

### domain-model.md
- [수정] Sector 엔터티 — `id` int → serial, `name_en`/`parent_id`/`level`/`created_at` 속성 추가. GICS 4단계 자기참조 계층 구조 도입.
- [폐기] KrSectorMap 엔터티 — `kr_sector_map` 테이블 DROP. yfinance 통일로 네이버 업종 매핑 불필요.
- [추가] GicsYfinanceMap 엔터티 — yfinance `industry` 문자열 → GICS L4 sector_id 매핑 테이블.
- [수정] Stock 엔터티 — `sector_id` 의미 변경: L1 고정 → 가능한 한 L4(Sub-Industry) 가리킴.
- [수정] 관계 — KrSectorMap-Sector 제거, Sector 자기참조 추가, GicsYfinanceMap-Sector 추가.

### db-schema.md
- [수정] sectors 테이블 — `id` int → serial(시퀀스 시작값 13 이상), `name_en`/`parent_id`/`level`/`created_at` 컬럼 추가. 인덱스 `idx_sectors_parent_id`·`idx_sectors_level` 추가.
- [폐기] kr_sector_map 테이블 — `DROP TABLE kr_sector_map` 실행.
- [추가] gics_yfinance_map 테이블 — `yfinance_industry`(PK), `sector_id`(FK → sectors L4) 컬럼.
- [수정] stocks 테이블 — `sector_id` 설명 변경(L1 고정 → 가능한 한 L4).
- [수정] ERD — kr_sector_map 제거, sectors 자기참조, gics_yfinance_map 관계 추가.

### api-spec.md
- [수정] 섹터 목록 조회 — 응답에 `name_en`/`parent_id`/`level` 추가, `level`/`parent_id` 쿼리 파라미터 추가.
- [추가] 섹터 breadcrumb 조회 RPC — `get_sector_breadcrumb(p_sector_id)` 신규 추가. L4 → L1 조상 경로 1회 호출 반환.
- [수정] 종목 등록+섹터자동추천 RPC — `p_naver_industry` 제거, `p_yfinance_sector`/`p_yfinance_industry` 파라미터 추가. 응답 `recommended_sector`에 `name_en`/`level` 추가.
- [수정] list_memos RPC — 섹터 필터 계층 탐색 규칙 추가 (L1/L2 지정 시 하위 계층 종목 포함).
- [수정] 로컬 종목 검색 및 단건 조회 — sectors join 응답에 `name_en`/`parent_id`/`level` 추가.

## 구현 현황
- [x] Supabase 구현
- [x] 백엔드 테스트
- [x] 프론트엔드 구현
- [ ] E2E 테스트
