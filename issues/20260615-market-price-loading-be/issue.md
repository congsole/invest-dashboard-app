# [20260615-market-price-loading-be] 현재가 로딩 전략 — Edge Function 개선 (BE 트랙)

<!-- PM-agent 작성 -->
## 개요

PRD-002에 "미장 가격 조회 원칙"이 추가되었다. 대시보드 현재가 표시를 두 단계로 분리한다: (1) `prices` 테이블 최신 종가(EOD)를 즉시 baseline으로 표시하고, (2) Edge Function `get-market-prices`로 실시간 현재가를 점진 갱신한다.

이 이슈는 BE 트랙으로, `get-market-prices` Edge Function을 청크 분할 호출 명세에 맞게 수정한다.

**현재 구현 상태 (수정 전)**:
- `get-market-prices`는 미국주식을 `Promise.all`로 한 번에 전체 조회한다. 보유 미국주식이 8개를 초과하면 Twelve Data 분당 8크레딧 제약으로 429가 발생해 전체 호출이 실패한다.
- 응답에 `failed` 배열 없이 `prices` 배열만 반환한다. 부분 실패 종목이 응답에서 누락되면 클라이언트가 빈칸으로 처리한다.
- `source` 필드가 없다.
- `chunk_index` 요청 파라미터를 받지 않는다.
- `cron-collect-prices`는 이미 8개씩 청크 분할 + 60초 대기 로직이 구현되어 있어 변경 불필요.

**수정 범위**:
1. `get-market-prices` Edge Function: `chunk_index` 파라미터 수신, 미국주식 8개 초과 시 400 반환, 응답에 `source`(`realtime`/`cached`) 및 `failed` 배열 추가, 부분 실패 시 HTTP 200 유지.
2. `app/services/market.ts`: `getMarketPrices` 함수에 `chunk_index` 파라미터 추가, 응답 타입 `failed` 배열 포함으로 확장.
3. `app/types/dashboard.ts`: `MarketPriceItem`에 `source` 필드 추가, `MarketPricesResponse`에 `failed` 배열 타입 추가.

> 이슈 B(FE 트랙: `20260615-market-price-loading-fe`)가 이 이슈에 선행 의존한다. Edge Function 수정 + 타입 정의가 완료된 후 FE 트랙에서 청크 순차 호출 및 baseline 로딩 로직을 구현한다.

## 참조 문서
- 커밋: eabdfaec30f6770e8c6f3300408fa558f19ad609 — [기획] 미장 가격 조회 원칙
- 기획서: docs/planning/PRD-002-dashboard.md
- 선행 이슈 없음 (이 이슈가 선행)
- 후행 이슈: 20260615-market-price-loading-fe

## docs 변경 내역

다음 명령으로 설계 에이전트들이 방금 업데이트한 내역을 파악한다:
```bash
git diff eabdfaec30f6770e8c6f3300408fa558f19ad609 HEAD -- docs/architecture/domain-model.md
git diff eabdfaec30f6770e8c6f3300408fa558f19ad609 HEAD -- docs/architecture/db-schema.md
git diff eabdfaec30f6770e8c6f3300408fa558f19ad609 HEAD -- docs/api/api-spec.md
```

### domain-model.md
- [수정] Price 엔터티 — 설명에 "EOD baseline 즉시 표시 + 실시간 점진 갱신" 역할 명시
- [추가] 계산 규칙 — "현재가 로딩 전략" 섹션 신규 추가 (baseline 즉시 렌더링, 청크 분할 순차 호출, 실패 처리, 폴링 없음)

### db-schema.md
- [변경 없음] DB 스키마(테이블/컬럼/인덱스/RLS) 변경 없음. prices 테이블 기존 구조로 충분히 지원.

### api-spec.md
- [추가] Market 도메인 — "현재가 로딩 전략 개요" 블록 신규 추가
- [추가] Market 도메인 — "저장 종가 baseline 조회" API 신규 추가 (prices 테이블 REST, `.in('ticker', tickers)` + date 내림차순)
- [수정] Market 도메인 — "현재가 조회" → "실시간 현재가 조회 (Edge Function)"으로 명칭 변경 및 전면 보강: `chunk_index` 파라미터 추가, 응답에 `source` 필드 및 `failed` 배열 추가, 청크 분할 호출 전략 표 추가, us_stock 8개 초과 400 에러 추가
- [수정] Market 도메인 — 일별 종가 수집 Cron 동작 설명 보강 (미국주식 청크 분할 명시)

<!-- 구현 단계에서 업데이트 -->
## 구현 현황
- [x] Supabase 구현
- [x] 백엔드 테스트
- [-] 프론트엔드 구현 (FE 트랙: 20260615-market-price-loading-fe)
- [-] 수동 테스트 (FE 트랙: 20260615-market-price-loading-fe)
