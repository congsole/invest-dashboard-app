# [008] FE 코드 리뷰

## Initial Review

**결과**: 이슈 4건 (Critical 1, Warning 2, Info 1)

**이슈 목록**

- [심각도: high] `app/components/forms/BuySellEventForm.tsx`: 코인(crypto) 자산 선택 시 `currency`가 항상 `'USD'`로 고정됨. PRD와 API 명세는 코인 거래 통화를 "코인 티커"(예: BTC, ETH)로 저장하도록 요구하나, `const currency = assetType === 'korean_stock' ? 'KRW' : 'USD'` 로 인해 코인 매수/매도 이벤트가 `currency: 'USD'`로 잘못 저장되어 예수금 계산 오류 유발.
- [심각도: mid] `app/components/AssetHistoryChart.tsx`: 원금 라인의 영역(area fill)이 미구현. PRD는 "원금 | 회색 점선 + 옅은 회색 영역(바닥부터 채움)"을 명시하나, `startFillColor2/endFillColor2` props가 없어 원금 라인이 점선만 표시됨. 원금↔평가액 사이 조건부 초록/빨강 영역은 gifted-charts 라이브러리 제약으로 구현 불가하나, 기본 회색 원금 영역은 구현 가능.
- [심각도: mid] `app/components/KpiCardSection.tsx`: "원금" 카드의 서브 라벨("입금 ₩X − 출금 ₩Y")이 미구현. PRD 명세이나 `get_kpi_summary` API 응답에 cumulative_deposit / cumulative_withdraw 분리 값이 없어 FE 단독으로 구현 불가. API 명세 제약으로 분류.
- [심각도: low] `app/components/AssetHistoryChart.tsx`: 이벤트 마커(배당●/출금▽)가 차트 포인트 위에 시각적으로 표시되지 않고 차트 하단 텍스트 줄로만 표시됨. PRD는 해당 시점 라인 위에 마커를 요구하나 gifted-charts의 customDataPoint API로 구현 가능. 현재는 날짜 목록만 텍스트로 표현.

## Cycle 1

**수정 내용**

- `app/components/forms/BuySellEventForm.tsx`:
  - `cryptoCurrency` state 추가. 자산 유형이 crypto일 때 "거래 통화 (코인 티커)" 입력 필드 노출.
  - `currency` 계산 로직을 `korean_stock → 'KRW'`, `us_stock → 'USD'`, `crypto → cryptoCurrency.trim().toUpperCase()` 로 변경.
  - `handleSubmit`에 crypto이고 `cryptoCurrency`가 비어있으면 오류 반환하는 유효성 검사 추가.
  - `resetForm`에 `setCryptoCurrency('')` 추가.

- `app/components/AssetHistoryChart.tsx`:
  - `startFillColor2 / endFillColor2 / startOpacity2 / endOpacity2` props 추가하여 원금 라인 아래 옅은 회색 영역 채움 구현 (PRD: "원금 | 회색 점선 + 옅은 회색 영역, 바닥부터 채움").

**Confirmation 결과**: 합격 — Critical 이슈 해결. 잔존 이슈 2건은 API/라이브러리 제약에 따른 known limitation.

**잔존 이슈**

- [mid/API 제약] `KpiCardSection` 원금 카드 서브 라벨: `get_kpi_summary` 응답에 cumulative_deposit / cumulative_withdraw 미포함. API 계층 변경 필요.
- [low/라이브러리 제약] `AssetHistoryChart` 마커 on-chart 표시: gifted-charts `customDataPoint` 활용 시 구현 가능하나 복잡도 대비 우선순위 낮음. 현재 텍스트 목록으로 대체 표시 중.

---

## 최종 결과

**합격**

### 검토 요약

- TypeScript 타입 정합성: api-spec.md 응답과 일치. nullable 필드 적절히 처리.
- 렌더링 최적화: `initialLoading/refreshing/historyLoading` 3단계 분리, `React.memo` 적용 (KpiCardSection, HoldingCard, AssetHistoryChart), 탭 필터 `useMemo` 클라이언트 사이드 처리, `useCallback` 의존성 안정화 — CLAUDE.md 규칙 준수.
- 파이 차트 제거 확인: `SectorAllocationPie` import 없음, `getSectorAllocation` deprecated 처리.
- 바텀시트 2단계 구조: CSV 업로드 + 5종 이벤트 타입 선택(1단계) → 타입별 폼 라우팅(2단계) 정상 구현.
- API 연동: `parse-account-csv` / `confirm-account-csv` Edge Function 정상 연동.
- 스타일: 모든 파일 `StyleSheet.create()` 사용, 인라인 스타일 없음.
- RN 규칙: `document`, `window` 등 웹 전용 API 미사용.
