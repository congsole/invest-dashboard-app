# 백엔드 코드 리뷰

## Initial Review

**결과**: 이슈 3건

**이슈 목록**
- [심각도: high] `20260602000000_sector_stock_master.sql`: `upsert_stock_with_sector` SECURITY DEFINER 함수에 `SET search_path = public` 누락. 악의적 사용자가 search_path를 조작해 의도하지 않은 스키마 객체를 참조할 수 있는 보안 취약점.
- [심각도: mid] `20260602000000_sector_stock_master.sql`: 기존 종목 조회 시(`is_new = false`) 응답의 `name` 필드가 DB에 저장된 값이 아닌 입력 파라미터 `p_name`을 그대로 반환. api-spec.md — "이미 등록된 종목이면 기존 레코드를 그대로 반환한다" 명세 불일치.
- [심각도: mid] `20260602000000_sector_stock_master.sql`: SECURITY DEFINER 함수에 `auth.uid()` 인증 가드 누락. stocks INSERT RLS는 authenticated 역할만 허용하지만 SECURITY DEFINER는 RLS를 우회하므로 비인증 사용자도 RPC를 호출해 종목을 등록할 수 있는 상태.

---

## Cycle 1

**수정 내용**

- `20260602000000_sector_stock_master.sql` — `upsert_stock_with_sector` 함수에 `set search_path = public` 추가 (이슈 1 해결)
- `20260602000000_sector_stock_master.sql` — `declare` 블록에 `v_stock_name text` 변수 추가. 기존 종목 SELECT에 `name` 컬럼 포함 → `v_stock_name`에 저장. 신규 등록 분기에서 `v_stock_name := p_name` 설정. 반환 시 `p_name` 대신 `v_stock_name` 사용 (이슈 2 해결)
- `20260602000000_sector_stock_master.sql` — 함수 본체 첫 줄에 `auth.uid() is null` 체크 추가. 비인증 호출 시 `insufficient_privilege` 에러 반환 (이슈 3 해결)

**Confirmation 결과**: 합격

---

## 최종 결과

합격
