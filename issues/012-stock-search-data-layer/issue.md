# [012] 종목 검색 — 데이터/API 레이어

<!-- PM-agent 작성 -->
## 개요
`stocks` 테이블을 공개 마스터로 재설계하고(`asset_type` → `market`/`currency`/`is_active`), 앱 내 종목 검색의 BE 레이어를 구현한다. Supabase ilike 로컬 검색 서비스 함수 및 FastAPI `/stocks/search` 외부 검색 연동 서비스 함수를 포함한다. stocks 쓰기 RLS 정책을 service role 전용으로 변경하고, 관련 DB 마이그레이션(컬럼 변경, 인덱스, RLS)을 작성한다.

## 참조 문서
- 커밋: 78dfc50be2b2bb1873ef3f824c47b33ffc94ca9c — [Docs] 종목 검색 기능
- 기획서: docs/planning/PRD-003-memo.md (섹션 3.0, 7, 8.3~8.4)

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
- [수정] Stock — `asset_type` 제거, `market`(KR/US/CRYPTO) · `currency` · `is_active` 추가. unique 제약 `(ticker, asset_type)` → `(ticker, market)` 변경. RLS 쓰기 정책 service role 전용으로 명확화. 엔터티 설명에 "진짜 마스터 테이블"(관심 종목 포함) 및 FastAPI 경유 upsert 반영.

### db-schema.md
- [수정] stocks — `asset_type` 컬럼 제거, `market`/`currency`/`is_active` 컬럼 추가. UNIQUE 제약 `(ticker, asset_type)` → `(ticker, market)`. 인덱스 `idx_stocks_ticker_asset_type` → `idx_stocks_ticker_market` 변경, `idx_stocks_name` 추가. RLS 쓰기 정책: 본인 직접 허용 → service_role 전용(FastAPI 경유).

### api-spec.md
- [추가] Stock — 로컬 종목 검색 API 신규 추가 (stocks 테이블 ilike 검색, market 필터 지원)
- [수정] Stock — 종목 조회(단건) 파라미터 `asset_type` → `market`, 응답에 `currency`/`is_active` 추가
- [수정] Stock — 종목 등록+섹터자동추천 RPC 함수명 `upsert_stock_with_sector` → `get_or_recommend_stock_sector`, 파라미터 `p_asset_type` → `p_market` · `p_currency` 추가
- [수정] Stock — 종목 섹터 수동 지정/변경 방식 REST → FastAPI 경유(service_role)로 변경
- [수정] Memo — stock 필드 `asset_type` → `market`, memo_stocks join 응답에 `currency`/`is_active` 추가

<!-- 구현 단계에서 업데이트 -->
## 구현 현황
- [x] Supabase 구현
- [x] 백엔드 테스트
- [x] 프론트엔드 구현
