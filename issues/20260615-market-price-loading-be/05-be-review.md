# 백엔드 코드 리뷰

## Initial Review
**결과**: 이슈 2건 (high 1, mid 1) + 기록 전용 2건 (low)

**이슈 목록**
- [high] `app/services/market.ts` (`getExchangeRate`): `(error as any).context` — 신규 추가 함수에서는 `any`를 제거했으나 기존 `getExchangeRate`에 `any`가 잔존하여 동일 파일 내 컨벤션 불일치.
- [mid] `app/services/market.ts` (`getBaselinePrices`): `prices` 테이블 PK는 `(ticker, asset_type, date)` 복합키인데 파라미터가 `tickers: string[]`만 받아 `asset_type` 필터가 누락됨. 동일 심볼이 여러 asset_type에 걸쳐 존재할 경우 의도치 않은 행이 포함될 수 있음.
- [low] `app/supabase/functions/get-market-prices/index.ts`: `Promise.all` 내 `.catch` 방어 코드가 `fetchAndMerge`의 예외 흡수 구조와 중복됨. `.catch` 콜백에서 예외 발생 시 해당 청크 종목이 `prices`/`failed` 양쪽 모두에 추가되지 않는 묵음 손실 경로가 이론상 존재함. `04-supabase-impl.md`에서 "방어 코드"로 의도적 유지를 명시했으므로 수정 제외.
- [low] `app/supabase/functions/get-market-prices/index.ts`: `api-spec.md`에 `502 | 외부 API 전체 실패` 케이스가 정의되어 있으나, 현재 구현은 전체 실패 시에도 HTTP 200을 반환함. 이슈 요구사항(issue.md 수정 범위)에 502 구현이 포함되어 있지 않아 범위 외로 판단, 수정 제외. 추후 별도 이슈로 처리 필요.

## Cycle 1
**수정 내용**
- `app/services/market.ts` (`getExchangeRate`): `(error as any).context` → `(error as { context?: { status?: number; text?: () => Promise<string> } }).context` 로 변경. `throw error` → 에러 메시지 포함 `throw new Error(...)` 로 통일.
- `app/services/market.ts` (`getBaselinePrices`): 파라미터를 `tickers: string[]` → `holdings: Array<{ ticker: string; asset_type: AssetType }>` 로 변경. 쿼리에 `.in('asset_type', assetTypes)` 필터 추가. JSDoc에 PK 복합키 근거 설명 추가.

**Confirmation 결과**: 합격 — 잔존 이슈 없음 (low 2건은 기록 전용, 수정 불필요 판단)

## 최종 결과
합격
