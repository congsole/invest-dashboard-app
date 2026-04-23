# 프론트엔드 코드 리뷰 — 이슈 006

## Initial Review
**결과**: 이슈 4건 (high 2, mid 2)

**이슈 목록**
- [high] `app/components/NewTradeEventSheet.tsx:16` — `createTradeEvent`를 `services/dashboard`에서 import하지만 해당 함수는 존재하지 않음. `services/tradeEvents`에 구현되어 있음. 런타임 오류 발생.
- [high] `app/components/NewTradeEventSheet.tsx:15` — `TradeEventInput`을 `types/dashboard`에서 import. `dashboard.ts`의 타입은 `fee`/`fee_currency`/`tax`가 required인 반면 `tradeEvents.ts`의 `createTradeEvent`는 `types/tradeEvent.ts`의 optional 타입을 기대. 타입 불일치.
- [mid] `app/components/NewTradeEventSheet.tsx:668-669` — `settlementBox`에 `borderWidth: 1`, `borderColor` 사용. DESIGN.md No-Line Rule 위반.
- [mid] `app/components/CsvUploadSheet.tsx:917-919` — `extras`에 `borderTopWidth: 1`, `borderTopColor` 사용. DESIGN.md No-Line Rule 위반.

## Cycle 1
**수정 내용**
- `NewTradeEventSheet.tsx:15-16`: import를 `types/tradeEvent`, `services/tradeEvents`로 변경. `AssetType`, `TradeType`, `TradeEventInput` 모두 `types/tradeEvent.ts`에서 export됨을 확인.
- `NewTradeEventSheet.tsx` `settlementBox`: `borderWidth`, `borderColor` 제거.
- `CsvUploadSheet.tsx` `extras`: `borderTopWidth`, `borderTopColor` 제거, `marginTop: 8 → 12`로 시각적 여백 보완.

**Confirmation 결과**: 합격

잔존 이슈 없음.

**비고 (low, 수정 불필요)**
- `CsvUploadSheet.tsx` `handleConfirm`에서 `setStep('confirming')` 미호출로 3단계 완료 인디케이터가 표시되지 않음. UX 영향 적음.
- `handleSelectFile`의 `expo-document-picker` TODO는 의도된 미구현 상태 (병렬 트랙 정상).

## 최종 결과
합격
