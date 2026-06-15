# 프론트엔드 코드 리뷰

## Initial Review

**결과**: 이슈 2건

**이슈 목록**

- [심각도: mid] `app/hooks/useDashboard.ts`: `delay` 함수가 `clearTimeout`을 호출하지 않아 언마운트/refetch 시 최대 60초 동안 불필요한 타이머 핸들이 잔류한다. `cancelSignal`에 `cancelDelay` 핸들러 필드가 없어 외부에서 타이머를 즉시 해제할 수 없었다.
- [심각도: low] `app/components/HoldingCard.tsx`: `price_source === 'baseline'`인 종목에 항상 "실시간 갱신 중" 문구를 표시하여, 모든 청크 갱신 완료 후(`priceUpdating = false`)에도 `failed` 종목 카드에 잘못된 문구가 잔류한다. `priceUpdating` 상태와 연계가 없었다.

---

## Cycle 1

**수정 내용**

- `app/hooks/useDashboard.ts`:
  - `delay(ms, signal)` 함수 시그니처를 `signal: { cancelled: boolean; cancelDelay?: () => void }`로 확장.
  - `delay` 내부에서 `setTimeout(resolve, ms)` 타이머 ID를 캡처하고 `signal.cancelDelay`에 `clearTimeout(timerId) + reject()` 핸들러를 등록.
  - `chunkCancelRef` ref 타입에 `cancelDelay?: () => void` 추가.
  - `fetchData` 진입 시 `chunkCancelRef.current.cancelDelay?.()` 호출하여 이전 루프의 타이머 즉시 해제.
  - `useEffect` cleanup에도 동일하게 `chunkCancelRef.current.cancelDelay?.()` 추가.
  - `cancelSignal` 로컬 변수 타입을 명시적으로 `{ cancelled: boolean; cancelDelay?: () => void }`로 선언.

- `app/components/HoldingCard.tsx`:
  - `HoldingCardProps`에 `priceUpdating?: boolean` (기본값 `false`) prop 추가.
  - `price_source === 'baseline'` 노트 문구를 `priceUpdating ? ' — 실시간 갱신 중' : ''` 조건으로 제어.

- `app/screens/DashboardScreen.tsx`:
  - `HoldingCard` 렌더링 시 `priceUpdating={priceUpdating}` prop 전달.

**Confirmation 결과**: 합격

- `delay` 취소 경로(언마운트, refetch, 정상 만료) 모두에서 `clearTimeout`이 올바르게 호출된다.
- `priceUpdating = false` 이후 baseline 유지 종목에 "실시간 갱신 중" 문구가 표시되지 않는다.
- `React.memo`와의 호환성: `priceUpdating`이 변경되는 시점에 청크 갱신으로 `setHoldings`도 함께 호출되므로 추가 렌더 비용이 미미하다.
- 기존 이슈 없음. 신규 이슈 없음.

---

## 최종 결과

합격
