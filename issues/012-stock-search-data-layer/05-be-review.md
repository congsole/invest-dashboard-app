# 백엔드 코드 리뷰

## Initial Review

**결과**: 이슈 1건

**이슈 목록**
- [심각도: high] `20260602000002_stock_search_data_layer.sql`: `get_or_recommend_stock_sector` DB Function에서 `recommended_sector` 응답의 `code`/`name` 값이 추천 섹터(`v_rec_sector_id`)가 아닌 확정 섹터(`v_sector_id`)로 조회되는 버그. 기존 종목에 sector_id(예: 3)가 이미 있고 추천 결과(`v_rec_sector_id`)가 다른 섹터(예: 5)인 경우, `recommended_sector.code/name`이 섹터 5가 아닌 섹터 3의 값을 반환함. 원인: 섹터 정보 조회를 `v_sector_id`(= max(기존, 추천) 결과)로 단일 조회 후, `recommended_sector` 블록에서 해당 변수를 그대로 참조.

## Cycle 1

**수정 내용**
- `20260602000002_stock_search_data_layer.sql`: `declare` 섹션에 `v_rec_sector_code text`, `v_rec_sector_name text` 변수 추가. 기존 섹터 조회(`v_sector_id` 기반) 이후 추천 섹터 조회를 별도 분기로 처리: `v_rec_sector_id = v_sector_id`이면 이미 조회된 값 재사용, 다른 경우 별도 `SELECT`로 조회. `recommended_sector` JSON 블록에서 `v_rec_sector_code/v_rec_sector_name` 참조로 변경.

**Confirmation 결과**: 합격

수정된 함수는 기존 종목 섹터와 추천 섹터가 다른 모든 케이스에서 추천 섹터의 정확한 code/name을 반환함. 그 외 전체 검토 항목(SQL 컬럼/제약/인덱스, RLS, API 명세 일치, TypeScript 타입, 에러 처리, 사전 의존성 명시) 이상 없음.

## 최종 결과

합격
