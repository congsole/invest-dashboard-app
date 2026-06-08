# 백엔드 통합 테스트

## 테스트 환경
- Supabase URL: wxznscebhpkfspwphbdv.supabase.co
- 테스트 파일: app/tests/integration/016-sector-gics.test.ts

## 테스트 결과

| 테스트 케이스 | 결과 | 비고 |
|-------------|------|------|
| **[016-1] sectors 테이블 계층 구조** | | |
| sectors count 270개 이상 | 통과 | |
| L1 섹터 12개 | 통과 | |
| L2 섹터 25개 | 통과 | |
| L3 섹터 74개 이상 | 통과 | |
| L4 섹터 150개 이상 | 통과 | |
| 기존 L1 12개에 name_en/level=1/parent_id=null 채움 | 통과 | |
| IT L1(id=1) name_en="Information Technology" | 통과 | |
| CRYPTO(id=12) level=1, parent_id=null | 통과 | |
| L2 SEMICON_EQUIP의 parent_id → IT L1(id=1) | 통과 | |
| L2 섹터 parent_id는 항상 L1을 가리킴 | 통과 | |
| RE_MGMT_DEV_IND(L3) parent_id → RE_MGMT_DEV(L2) | 실패 → 수정 완료 | DB에 구 버전(REITS)으로 삽입된 상태. service_role로 직접 수정 후 통과 |
| 미인증 사용자 sectors SELECT 불가 (RLS) | 통과 | |
| 인증된 사용자 sectors INSERT 불가 | 통과 | |
| **[016-2] sectors 시퀀스 시작값** | | |
| 신규 삽입 섹터 id 13 이상 | 통과 | |
| **[016-3] gics_yfinance_map 테이블** | | |
| 시드 데이터 50건 이상 | 통과 | |
| "Semiconductor Manufacturing" → L4 섹터 매핑 | 통과 | |
| "Application Software" → L4 섹터 매핑 | 통과 | |
| 미인증 사용자 SELECT 불가 (RLS) | 통과 | |
| 인증된 사용자 INSERT 불가 (RLS) | 통과 | |
| kr_sector_map 테이블 DROP 확인 | 통과 | |
| **[016-4] get_sector_breadcrumb RPC** | | |
| L4 → L1 경로 배열 반환, level 오름차순 | 통과 | |
| L1(id=1) breadcrumb → 길이 1 배열 | 통과 | |
| L2(SEMICON_EQUIP) breadcrumb → [L1, L2] | 통과 | |
| 존재하지 않는 sector_id → 에러 반환 | 통과 | |
| 미인증 사용자 RPC 호출 불가 | 통과 | |
| 응답 항목에 id/code/name/name_en/level 필드 존재 | 통과 | |
| **[016-5] get_or_recommend_stock_sector RPC (신규 시그니처)** | | |
| CRYPTO → CRYPTO 섹터(id=12) 추천 | 통과 | |
| p_yfinance_industry로 gics_yfinance_map 경유 L4 추천 | 통과 | |
| p_yfinance_sector만으로 L1 폴백 추천 | 통과 | |
| p_yfinance_sector code("IT") 방식 폴백 | 통과 | |
| p_yfinance_sector/industry 모두 null → sector_id null | 통과 | |
| 잘못된 market → 에러 반환 | 통과 | |
| 미인증 사용자 RPC 호출 불가 | 통과 | |
| 구 p_naver_industry 파라미터 전달 시 동작 확인 | 통과 | |
| recommended_sector에 name_en/level 필드 포함 | 통과 | |
| **[016-6] list_memos 섹터 필터 계층 탐색** | | |
| IT L1 필터 → L4 섹터 종목 연결 메모 포함 | 통과 | |
| IT L1 필터 → L1 직접 연결 메모 포함 | 통과 | |
| IT L1 필터 → 섹터 없는 메모 제외 | 통과 | |
| p_sector_ids 빈 배열 → 전체 메모 반환 | 통과 | |
| 미인증 사용자 list_memos RPC 호출 불가 | 통과 | |

**전체: 41개 통과 / 0개 실패**

## 수정 내역

### Cycle 1

**발견 버그: RE_MGMT_DEV_IND(L3) parent_id 오류 — DB 미반영**

- 원인: 리뷰 Cycle1에서 마이그레이션 SQL 파일의 `RE_MGMT_DEV_IND` parent_id를 `REITS` → `RE_MGMT_DEV`로 수정했으나, 원격 DB에는 이미 구 버전(`REITS`, id=38)으로 삽입되어 있었고 재적용되지 않은 상태
- 테스트가 DB 버그를 실제로 감지함: `RE_MGMT_DEV_IND.parent_id = 38(REITS)` vs 기대값 `37(RE_MGMT_DEV)`
- 조치: service_role 클라이언트로 직접 수정
  ```sql
  UPDATE sectors SET parent_id = 37 WHERE code = 'RE_MGMT_DEV_IND';
  ```
- 이 수정으로 `RE_MGMT_DEV_IND` 하위 L4 섹터 4건(DIVERSIFIED_REAL_ESTATE, REAL_ESTATE_DEV, REAL_ESTATE_OPERATING, REAL_ESTATE_SVCS)의 계층도 올바르게 연결됨

## 사전 의존성 체크리스트 검증 결과

| 항목 | 결과 | 방법 |
|------|------|------|
| gics_yfinance_map RLS 정책 — authenticated SELECT 허용 | 통과 | 자동 테스트 |
| gics_yfinance_map RLS — INSERT 차단 | 통과 | 자동 테스트 |
| sectors 시퀀스 시작값 13 이상 | 통과 | 자동 테스트 |
| get_or_recommend_stock_sector 구 시그니처(p_naver_industry) 제거 | 통과 | 자동 테스트 (구 파라미터 전달 시 동작 확인) |

## 최종 결과

통과
