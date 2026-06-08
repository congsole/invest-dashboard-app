# 백엔드 통합 테스트

## 테스트 환경
- Supabase URL: wxznscebhpkfspwphbdv.supabase.co
- 테스트 파일: app/tests/integration/022-memo-sector-filter-sectorids.test.ts

## 테스트 결과

| 테스트 케이스 | 결과 | 비고 |
|-------------|------|------|
| [022-1] p_sector_ids=[L1_id] → L1 memo_sectors 연결 메모가 반환된다 | 통과 | 이슈 022 핵심 케이스 |
| [022-1] p_sector_ids=[L1_id] 응답 memoDirectL1의 sectors[].level이 1이다 | 통과 | |
| [022-2] p_sector_ids=[L1_id] → L2 memo_sectors 연결 메모가 반환된다 | 통과 | 하위 탐색 |
| [022-3] p_sector_ids=[L1_id] → L3 memo_sectors 연결 메모가 반환된다 | 통과 | 하위 탐색 |
| [022-3] p_sector_ids=[L1_id] → L4 memo_sectors 연결 메모가 반환된다 | 통과 | 하위 탐색 |
| [022-4] p_sector_ids=[L1_id] → L4 종목 memo_stocks 연결 메모가 반환된다 | 통과 | 종목 경로 |
| [022-5] p_sector_ids=[L1_id] → 다른 L1 섹터 직접 연결 메모는 제외된다 | 통과 | 무관 섹터 제외 |
| [022-5] p_sector_ids=[L1_id] → 섹터 연결 없는 메모는 제외된다 | 통과 | |
| [022-5] p_sector_ids=[otherL1_id] → IT 계열 메모는 모두 제외된다 | 통과 | |
| [022-6] p_sector_ids=[L1_id, L2_id] → 합집합 반환된다 | 통과 | 복수 id 동시 전달 |
| [022-6] L1에 속한 메모가 중복 없이 1회만 나타난다 | 통과 | DISTINCT 검증 |
| [022-7] p_sector_ids=null → 모든 메모 포함 (memoNoLinks 포함) | 통과 | 필터 없음 |
| [022-7] p_sector_ids=null과 p_sector_ids=[] 동작이 동일하다 | 통과 | |

**전체: 13개 통과 / 0개 실패**

## 수정 내역

없음 (1회 실행에 전체 통과)

## 최종 결과
통과
