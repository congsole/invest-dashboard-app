# Supabase 구현 내역

## 마이그레이션

- `app/supabase/migrations/20260602000000_sector_stock_master.sql`

### 마이그레이션 내용 요약

1. **sectors 테이블** 생성 + RLS 활성화 + 시드 12행 INSERT (GICS 11 + 가상자산)
2. **stocks 테이블** 생성 + RLS 활성화 + 인덱스 2개 생성
   - `idx_stocks_ticker_asset_type` (UNIQUE 제약과 병행)
   - `idx_stocks_sector_id`
3. **kr_sector_map 테이블** 생성 + RLS 활성화 + 초기 시드 39행 INSERT (보유·관심 업종 위주)
4. **`upsert_stock_with_sector` DB Function** 생성 (SECURITY DEFINER)

## Edge Functions

해당 없음. 섹터 자동 추천은 DB Function(`upsert_stock_with_sector`)으로 구현.

## 클라이언트 유틸

### `app/services/sectors.ts`

| 함수 | 설명 |
|------|------|
| `getSectors()` | 섹터 목록 전체 조회 (id 오름차순) |

### `app/services/stocks.ts`

| 함수 | 설명 |
|------|------|
| `getStock(ticker, assetType)` | ticker + asset_type 단건 조회. sectors join 포함. 없으면 null. |
| `upsertStockWithSector(input)` | `upsert_stock_with_sector` RPC 호출. 종목 등록 + 섹터 자동 추천. |
| `updateStockSector(stockId, sectorId)` | sector_id 수동 지정/변경. null이면 미분류. |

### `app/types/sector.ts`

| 타입 | 설명 |
|------|------|
| `SectorCode` | 섹터 코드 유니온 타입 |
| `Sector` | sectors 테이블 행 |
| `StockAssetType` | 'korean_stock' \| 'us_stock' \| 'crypto' |
| `Stock` | stocks 테이블 행 |
| `StockWithSector` | stocks + sectors join 응답 |
| `UpsertStockResult` | upsert_stock_with_sector RPC 응답 |
| `StockSectorUpdateInput` | 섹터 수동 지정 입력 |

## 사전 의존성 체크리스트

- [ ] `supabase db push` 실행 — Supabase 대시보드 또는 CLI `supabase db push` — smoke test: `getSectors()` 호출 시 12행 반환 확인
- [ ] kr_sector_map 시드 확인 — Supabase Table Editor에서 kr_sector_map 행 수 확인 — 수동 확인 필요 (39행 기대)
- [ ] `upsert_stock_with_sector` 함수 등록 확인 — Supabase 대시보드 → Database → Functions — smoke test: `supabase.rpc('upsert_stock_with_sector', ...)` 직접 호출

## 특이사항

### upsert_stock_with_sector 섹터 추천 전략

| asset_type | 추천 방식 |
|------------|----------|
| `crypto` | CRYPTO(id=12) 고정 |
| `korean_stock` | `kr_sector_map.naver_industry` 매핑. `p_naver_industry` 미전달 시 null(미분류). |
| `us_stock` | `p_naver_industry`에 GICS code 문자열(예: 'IT') 전달 시 sectors.code로 직접 매핑. 미전달 시 null. Yahoo Finance 조회는 클라이언트 레이어 담당. |

이 전략으로 미국 주식 섹터 자동 추천은 클라이언트가 Yahoo Finance에서 GICS 코드를 가져와 `p_naver_industry`로 전달하는 방식으로 동작한다. DB Function은 외부 API를 직접 호출하지 않는다.

### RLS 정책 설계

- `sectors`, `kr_sector_map`: SELECT만 authenticated에 허용. 쓰기 정책 부재 = service_role만 가능.
- `stocks`: SELECT/INSERT/UPDATE 모두 authenticated 허용 (종목은 사용자가 직접 등록·보정). DELETE는 service_role만.

### stocks INSERT RLS

종목 테이블은 사용자별 소유권 개념이 없는 공유 마스터이므로 `user_id` 컬럼 없이 `authenticated` 역할 전체에 INSERT/UPDATE를 허용한다. 특정 사용자가 등록한 종목을 다른 사용자도 재사용 가능한 구조다.
