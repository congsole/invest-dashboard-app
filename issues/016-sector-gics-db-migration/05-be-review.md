# 백엔드 코드 리뷰

## Initial Review

**결과**: 이슈 3건

**이슈 목록**

- [심각도: high] `app/services/memo.ts`: `getOrRecommendStockSector` 함수가 구 RPC 시그니처(`p_naver_industry`)를 여전히 사용. DB Function은 이미 `drop function if exists public.get_or_recommend_stock_sector(text, text, text, text, text)`로 DROP되었으므로, 이 함수를 호출하면 파라미터 불일치로 RPC 오류가 발생한다. `p_yfinance_sector`/`p_yfinance_industry`로 전환 필요.
- [심각도: mid] `app/supabase/migrations/20260605000000_sector_gics_hierarchy.sql` L3 시드: `RE_MGMT_DEV_IND`의 `parent_id`가 `REITS`(L2 Real Estate Investment Trusts)로 지정되어 있으나, GICS 구조상 이 Industry는 `RE_MGMT_DEV`(L2 Real Estate Management & Development) 아래여야 한다. `REITS`는 별개의 L2 Industry Group이며, `RE_MGMT_DEV_IND`를 그 아래로 연결하면 L4 시드 4건(`DIVERSIFIED_REAL_ESTATE`, `REAL_ESTATE_DEV`, `REAL_ESTATE_OPERATING`, `REAL_ESTATE_SVCS`)의 계층이 모두 잘못된 L2 아래에 놓인다.
- [심각도: low] `app/services/stocks.ts` 97~99행 주석: 구 로직(`kr_sector_map`, `naver_industry`)을 기술하고 있어 현재 구현과 불일치. 기능 동작에는 영향 없으나 오해 유발.

---

## Cycle 1

**수정 내용**

- `app/services/memo.ts`: `GetOrRecommendStockInput` 인터페이스에서 `p_naver_industry` 제거, `p_yfinance_sector`/`p_yfinance_industry` 추가. `GetOrRecommendStockResult.recommended_sector`에 `name_en`/`level` 필드 추가(DB Function 응답 일치). `supabase.rpc` 호출 파라미터를 신규 시그니처로 변경.
- `app/supabase/migrations/20260605000000_sector_gics_hierarchy.sql`: L3 시드 `RE_MGMT_DEV_IND`의 `parent_id`를 `REITS` → `RE_MGMT_DEV`로 수정.
- `app/services/stocks.ts`: 97~99행 주석을 현재 로직(gics_yfinance_map → sectors.name_en → L1 폴백, yfinance 단일 경로)으로 업데이트.

**Confirmation 결과**: 합격

---

## 최종 결과

합격

---

## 미해결 사항 (이번 이슈 범위 외)

아래 항목은 이번 리뷰 범위에서 수정하지 않았으나 후속 이슈에서 확인이 필요하다.

1. **`app/services/memo.ts`에 중복 `getOrRecommendStockSector` 함수 존재**: 동일 이름의 함수가 `app/services/stocks.ts`에도 정의되어 있다. `memo.ts` 버전은 이번 이슈에서 시그니처를 교정했으나, 두 파일에 동일 역할의 함수가 중복 정의된 구조 자체는 리팩토링이 필요하다.

2. **`app/components/StockSearchModal.tsx` 388행**: `GetOrRecommendStockSectorInput`을 `stocks.ts`에서 임포트하면서도 `naver_industry: item.naver_industry`를 참조하고 있다. `ExternalStockSearchResult`에서 `naver_industry` 필드가 제거되었으므로 TypeScript 컴파일 오류가 발생한다. FE 리뷰(이슈 018) 범위에서 처리 필요.

3. **기존 통합 테스트 파일(`009-sector-stock-master.test.ts`, `012-stock-search-data-layer.test.ts`)**: `p_naver_industry` 파라미터를 직접 전달하는 테스트 케이스가 다수 존재한다. 이슈 016 백엔드 테스트(06-backend-test.md) 단계에서 신규 시그니처에 맞게 테스트를 재작성해야 한다.

4. **`upsert_stock_with_sector` DB Function**: `kr_sector_map` 참조가 남아 있는 채로 DROP되지 않았다. 실제 호출 코드가 없어 즉각적인 장애는 없으나, 이슈 017에서 정리 예정.
