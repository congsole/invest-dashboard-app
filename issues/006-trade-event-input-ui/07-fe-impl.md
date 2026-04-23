# 프론트엔드 구현 내역

## 새로 만든 컴포넌트

- `app/components/CsvUploadSheet.tsx` — CSV 파일 업로드 바텀시트. 파일 선택 → 파싱 미리보기 → 확정 저장 3단계 플로우. 실패 행 번호/사유 표시. confirm-trade-csv Edge Function 호출.

## 새로 만든 서비스 파일

- `app/services/tradeEvents.ts` — trade_events CRUD 서비스 함수 (createTradeEvent, getTradeEvents, uploadTradeCSV, confirmTradeCSV). api-spec.md 기반 Supabase 호출 구현.

## 새로 만든 타입 파일

- `app/types/tradeEvent.ts` — TradeEvent, TradeEventInput, TradeEventUpdateInput, TradeEventFilters, CsvPreviewRow, CsvParseError, CsvPreviewResult, CsvConfirmResult 타입 정의.
- `app/types/colors.ts` — Precision Ledger 디자인 시스템 색상 토큰 상수.

## 수정한 파일

- `app/components/NewTradeEventSheet.tsx` — 기존 파일에 다음 기능 추가:
  - CSV 파일 업로드 버튼 → CsvUploadSheet 연동 (csvSheetVisible state)
  - 수수료 통화 선택 UI (KRW / USD 세그먼트)
  - 정산금액 수동 입력 토글 (자동 계산 ↔ 직접 입력)
  - 정산금액 색상 구분: 매수(빨강/지출) / 매도(초록/수입)

## UI 레퍼런스 매핑

- `ui/new-trade-event/code.html` → `app/components/NewTradeEventSheet.tsx` + `app/components/CsvUploadSheet.tsx`
  - HTML `div.bg-surface-bright` 바텀시트 → RN `View` + `Modal`
  - `button.bg-primary-fixed` CSV 버튼 → `TouchableOpacity style={csvButton}`
  - `div.bg-surface-container-low.rounded-full` 세그먼트 바 → `View style={segmentBar}`
  - `div.grid.bg-surface-container` 수치 그리드 → `View style={financialGrid}`
  - `div.bg-primary/5` 정산금액 표시 → `View style={settlementBox}`
  - `button.rounded-full.bg-primary` 저장 버튼 → `TouchableOpacity style={submitBtn}`

## 특이사항

### expo-document-picker 미설치 대응
CSV 실제 파일 선택은 `expo-document-picker`가 필요하지만 현재 `package.json`에 없다. `CsvUploadSheet.tsx`는 `Alert`으로 개발용 Mock 데이터 로드를 제공한다. 실제 운영 시 `expo-document-picker`를 설치하고 `handleSelectFile` 함수 내부를 교체한다.

### 서비스 파일 중복 대응
`app/services/tradeEvents.ts`는 이번 이슈에서 새로 작성했으나, `NewTradeEventSheet.tsx`는 기존 `app/services/dashboard.ts`의 `createTradeEvent` stub을 계속 사용한다. supabase-impl-agent가 dashboard.ts를 실제 Supabase 호출로 교체하면 자동으로 연동된다.

### 정산금액 부호 규칙
- 매수: 지출이므로 음수 (체결가 × 수량 + 수수료 + 세금의 음수)
- 매도: 수입이므로 양수 (체결가 × 수량 - 수수료 - 세금)
- api-spec.md 명세와 일치: "settlement_amount: 정산금액 (매수 음수, 매도 양수)"

### 디자인 시스템 준수
- No-Line Rule: 모든 구분은 배경색 변화로 처리 (`#e5eeff`, `#dce9ff`, `#dde1ff`)
- 버튼: `borderRadius: 9999` (rounded-full)
- 입력 필드: `backgroundColor: '#dce9ff'` (surface_container_high), 테두리 없음
- primary: `#003ec7`, tertiary(매수): `#005b21`, error(매도): `#ba1a1a`
