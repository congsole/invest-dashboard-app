# 프론트엔드 구현 내역

## 새로 만든 화면
없음

## 새로 만든 컴포넌트
없음

## 수정한 파일

- `app/screens/MemoEditScreen.tsx` — `SelectedStock` 인터페이스의 `asset_type` 필드를 `market`으로 교체. 편집 모드 초기화 로직(`existingMemo.memo_stocks.map`)에서 `ms.stocks.asset_type` → `ms.stocks.market` 변경. 종목 선택 핸들러(`handleStockSelect`)에서 `stock.asset_type` → `stock.market` 변경.

## UI 레퍼런스 매핑
해당 없음 (데이터 레이어 이슈)

## 특이사항

### 수정 범위 한정 근거

이슈 012는 `stocks` 테이블 재설계(asset_type → market)에 따른 프론트엔드 타입 오류 수정이 주 목적이다. grep 결과 `asset_type` 참조가 많이 존재하지만, 두 종류로 구분된다:

1. **수정 대상**: `app/screens/MemoEditScreen.tsx` — `stocks` 테이블에서 오는 `Stock` 타입을 사용하는 곳. `app/types/memo.ts`의 `Stock` 인터페이스가 이미 `asset_type` 제거 / `market` 추가로 업데이트되어 있어서, 이를 사용하는 화면의 로컬 인터페이스(`SelectedStock`)와 초기화 로직도 함께 수정했다.

2. **수정 불필요**: 나머지 `asset_type` 참조(DashboardScreen, HoldingCard, TradeEventBottomSheet, CsvUploadSheet, SectorAllocationPie, services/accountEvents.ts, services/dashboard.ts, types/dashboard.ts, types/accountEvent.ts 등)는 모두 `account_events`, `corporate_actions`, `prices` 등 별도 테이블의 `asset_type` 컬럼을 사용하는 코드다. 이 컬럼들은 이슈 012 마이그레이션 대상이 아니며, `app/types/sector.ts`의 `StockAssetType`은 deprecated 처리되었으나 이들 테이블에서 여전히 사용되어 유지된다.

### 타입 호환성 확인

- `app/types/memo.ts`의 `Stock` 인터페이스: `market: 'KR' | 'US' | 'CRYPTO'` (supabase-impl-agent가 이미 업데이트 완료)
- `app/types/memo.ts`의 `MemoDetail.memo_stocks[].stocks`: `market: 'KR' | 'US' | 'CRYPTO'` (supabase-impl-agent가 이미 업데이트 완료)
- `MemoEditScreen.tsx`의 `SelectedStock` 인터페이스: `market: 'KR' | 'US' | 'CRYPTO'` (이번 이슈에서 수정)
