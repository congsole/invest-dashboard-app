# [017] GICS 계층화 — 배치 적재 스크립트 변경

## 개요
PRD-004에 따라 종목 배치 적재 스크립트(FastAPI 서버 외부 Python)를 변경한다. 한국 주식의 섹터 수집 경로를 네이버 업종 → `kr_sector_map` 방식에서 yfinance `sector` + `industry` 동시 수집으로 전환한다. `resolve_sector_id` 함수를 `gics_yfinance_map` 기반 L4 매핑 로직으로 교체한다. KOSPI/KOSDAQ suffix(`.KS`/`.KQ`) 처리, rate limit 대응(0.5~1초 인터벌, 실패 시 null 유지), 월간 cron에서 `sector_id is null` 종목 재시도 로직을 포함한다.

선행 이슈: 016 (sectors 계층 구조 + gics_yfinance_map 시드가 먼저 존재해야 매핑 가능)

## 참조 문서
- 커밋: b892f6d — [Feat] 종목 분류에 GICS 도입 (한국/미국 주식 동일하게)
- 기획서: docs/planning/PRD-004-sector-hierarchy.md (§5 배치 적재 변경, §8.1 단계 5)

## docs 변경 내역

### domain-model.md
- 해당 없음 (배치 스크립트는 앱 외부 레이어)

### db-schema.md
- 해당 없음

### api-spec.md
- [수정] 종목 등록+섹터자동추천 RPC(`get_or_recommend_stock_sector`) — FastAPI 서버에서 이 RPC를 호출할 때 파라미터가 `p_naver_industry` → `p_yfinance_sector`/`p_yfinance_industry`로 변경됨. 서버 호출 코드 수정 필요.

## 구현 현황
- [x] Supabase 구현
- [x] 백엔드 테스트
- [ ] 프론트엔드 구현
