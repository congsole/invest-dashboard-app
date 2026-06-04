# 백엔드 통합 테스트

## 테스트 환경
- Supabase URL: wxznscebhpkfspwphbdv.supabase.co
- 테스트 파일: app/tests/integration/009-sector-stock-master.test.ts

## 테스트 결과

| 테스트 케이스 | 결과 | 비고 |
|-------------|------|------|
| sectors — 인증된 사용자가 조회하면 12개 행 반환 | ✅ 통과 | |
| sectors — id 1~12 모두 존재 | ✅ 통과 | |
| sectors — CRYPTO 섹터(id=12) 존재 | ✅ 통과 | |
| sectors — 미인증 사용자 SELECT 불가 | ✅ 통과 | |
| sectors — 인증된 사용자 INSERT 불가 | ✅ 통과 | |
| upsert_stock_with_sector — 한국 주식 kr_sector_map 기반 섹터 자동 추천 | ✅ 통과 | 반도체 → IT(id=1) |
| upsert_stock_with_sector — 암호화폐 CRYPTO 고정 지정 | ✅ 통과 | id=12 |
| upsert_stock_with_sector — 미국 주식 GICS 코드 직접 전달 시 섹터 매핑 | ✅ 통과 | 'IT' → id=1 |
| upsert_stock_with_sector — 미국 주식 naver_industry 미전달 시 sector_id null | ✅ 통과 | |
| upsert_stock_with_sector — 중복 등록 시 is_new=false, 기존 레코드 반환 | ✅ 통과 | |
| upsert_stock_with_sector — 미인증 사용자 호출 불가 | ✅ 통과 | |
| upsert_stock_with_sector — 잘못된 asset_type 에러 반환 | ✅ 통과 | |
| updateStockSector — 유효한 섹터로 변경 | ✅ 통과 | sector join 포함 반환 확인 |
| updateStockSector — sector_id null로 변경 (미분류 처리) | ✅ 통과 | |
| getStock — ticker + asset_type 조회 시 sectors join 포함 반환 | ✅ 통과 | |
| getStock — 존재하지 않는 종목 조회 시 null 반환 | ✅ 통과 | |
| kr_sector_map — 인증된 사용자 SELECT 가능 (39행 이상) | ✅ 통과 | |
| kr_sector_map — 반도체 → IT(id=1) 매핑 존재 | ✅ 통과 | |
| kr_sector_map — 인증된 사용자 INSERT 불가 | ✅ 통과 | |
| stocks RLS — 미인증 사용자 SELECT 불가 | ✅ 통과 | |
| stocks RLS — 인증된 사용자 직접 INSERT 가능 | ✅ 통과 | |
| stocks RLS — service_role DELETE 가능 | ✅ 통과 | |

**전체: 22개 통과 / 0개 실패**

## 수정 내역

### Cycle 1 (마이그레이션 미적용 → 적용)
- 원인: `20260602000000_sector_stock_master.sql` 마이그레이션이 Supabase에 미적용 상태
- 조치: `supabase migration repair --status applied` (이전 마이그레이션 히스토리 정리) 후 `supabase db push` 실행
- 결과: 마이그레이션 적용 완료, 전체 테스트 통과

## 최종 결과
통과
