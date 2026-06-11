# 프론트엔드 코드 리뷰

## Initial Review

**결과**: 이슈 1건

**이슈 목록**

- [심각도: high] `app/components/AssetHistoryChart.tsx`: `getBucketKey` 주별 분기에서 `monday.toISOString().slice(0, 10)` 사용 — `new Date(year, month-1, day)`는 로컬 타임존(KST=UTC+9) 기준이지만 `toISOString()`은 UTC 변환이므로 KST에서 하루가 앞으로 밀린다. 예: 2025-06-09(월요일) → 버킷 키가 `2025-06-09` 대신 `2025-06-08`로 계산됨. X축 라벨도 하루 어긋나고, 마커-버킷 매핑도 영향받음.

**기타 검토 항목 (이상 없음)**

- `Period` 타입에서 `'all'` 제거 — 완료
- 전체 기간 1회 조회, 단위 전환 시 서버 재조회 없음 — 완료
- X축 라벨 형식(일·주 MM.DD, 월 YY.MM, 연 YYYY) — 기획서/API spec 일치 (단, 주별은 버그 수정 필요)
- 주별 버킷 기준 요일 월요일 — 로직은 올바르나 날짜 출력에 UTC 변환 버그 있음
- Y축 만/억 축약 라벨 + 눈금선 — 완료
- 배당 마커만 유지, 출금 마커 제거 — 완료
- 원금 음수 구간 클리핑 없음, 0 기준선 대시선 표시 — 완료
- 가로 스크롤 + 초기 위치 최신 날짜(오른쪽 끝) — 완료
- 스냅샷 0개 빈 상태 처리 — 완료 (`totalBuckets === 0` 분기)
- yMin==yMax 엣지 케이스 — padding 로직으로 range > 0 보장됨
- `BucketUnit` 상태를 `AssetHistoryChart` 내부에 격리, DashboardScreen에서 관리하지 않음 — CLAUDE.md 상태 격리 원칙 준수
- `useMemo`/`useCallback`/`memo` 활용 — 적절히 적용됨
- TypeScript `any` 미사용, 웹 전용 API 미사용
- `StyleSheet.create()` 사용, 동적 값 필요한 경우만 인라인 — 허용 범위
- `npx tsc --noEmit` (supabase/functions 제외) — 에러 0건

---

## Cycle 1

**수정 내용**

- `app/components/AssetHistoryChart.tsx` (`getBucketKey` 주별 분기): `monday.toISOString().slice(0, 10)` → `monday.getFullYear()`, `monday.getMonth() + 1`, `monday.getDate()`로 로컬 날짜를 직접 조합. UTC 변환으로 인한 하루 밀림 버그 수정.

**Confirmation 결과**: 합격

- 수정 후 `2025-06-09(월)`~`2025-06-15(일)` 모두 버킷 키 `2025-06-09`로 정확히 계산됨 확인
- `npx tsc --noEmit` 에러 0건 유지
- 새로운 이슈 없음

---

## 최종 결과

**합격**

발견·수정한 이슈:
- `AssetHistoryChart.tsx` `getBucketKey` 주별 버킷 키 UTC 변환 버그 — 수정 완료
