# 프론트엔드 구현 내역

## 새로 만든 화면

- `app/screens/DashboardScreen.tsx` — 대시보드 메인 화면. 부문 필터 탭, 자산 히스토리 그래프, 파이 차트, 종목 카드 리스트, FAB 버튼 포함.

## 새로 만든 컴포넌트

- `app/components/SectorFilterTabs.tsx` — 전체/한국주식/미국주식/코인 수평 스크롤 탭 필터
- `app/components/AssetHistoryChart.tsx` — react-native-gifted-charts LineChart 기반 3라인 꺾은선 그래프 (총자산/투입원금/수수료+세금), 기간 전환(일/주/월/년) 포함
- `app/components/SectorAllocationPie.tsx` — react-native-gifted-charts PieChart 기반 도넛 차트, 부문별 비중(%) + 금액 범례
- `app/components/HoldingCard.tsx` — 종목 카드. 종목명/티커/배지/보유수량/평균매수가/현재가/평가금액/수익률/평가손익 표시. 미국주식·코인은 USD+원화 병기.
- `app/components/NewTradeEventSheet.tsx` — 매매 이벤트 입력 Modal 바텀시트. 자산유형/매매유형 세그먼트, 티커·종목명·날짜·수량·체결가·수수료·세금 입력, 정산금액 자동 계산, CSV 업로드 버튼(TODO) 포함.

## 새로 만든 타입/서비스/훅

- `app/types/dashboard.ts` — AssetType, Period, PortfolioSummaryItem, AssetHistoryItem, SectorAllocationItem, MarketPriceItem, ExchangeRateResponse, HoldingCardData, TradeEventInput, TradeEvent 등 전체 타입 정의
- `app/services/dashboard.ts` — getDashboardPortfolioSummary, getAssetHistory, getSectorAllocation, getMarketPrices, getExchangeRate, createTradeEvent stub 구현 (Supabase RPC/Edge Function 호출로 교체 예정)
- `app/hooks/useDashboard.ts` — 포트폴리오 요약 + 현재가 + 환율 병렬 패칭 후 HoldingCardData 조합. fetchHistory(period)로 히스토리 별도 요청.

## 수정한 파일

- `app/App.tsx` — 인증된 사용자 진입 화면을 SettingsScreen에서 DashboardScreen으로 교체. DashboardScreen import 추가.

## UI 레퍼런스 매핑

- `ui/dashboard/code.html` → `app/screens/DashboardScreen.tsx`, `app/components/HoldingCard.tsx`, `app/components/SectorFilterTabs.tsx`, `app/components/AssetHistoryChart.tsx`, `app/components/SectorAllocationPie.tsx`
- `ui/new-trade-event/code.html` → `app/components/NewTradeEventSheet.tsx`

## 의존성 추가

```
react-native-gifted-charts
react-native-svg
```

Expo Managed Workflow에서 `react-native-svg`는 별도 native build 없이 Expo Go에서 동작한다.

## 특이사항

1. **dashPattern2 prop 부재**: `react-native-gifted-charts` LineChart에 `dashPattern2`가 존재하지 않아 제거. 투입원금 라인은 색상(#bac7de)으로만 구분.

2. **Modal 방식 바텀시트**: RN 내장 `Modal` + `animationType="slide"` 사용. 별도 바텀시트 라이브러리(react-native-bottom-sheet 등)는 Expo Go native module 미지원 이슈로 회피.

3. **No-Line Rule 준수**: 종목 카드 상세 영역은 borderWidth 대신 `backgroundColor: '#eff4ff'`로 구역 구분.

4. **BE stub 구조**: `app/services/dashboard.ts`는 전체가 stub 데이터 반환. supabase-impl-agent 완료 후 각 함수 내 TODO 주석 위치에 실제 Supabase 호출 삽입 필요.

5. **CSV 업로드**: 바텀시트에 버튼 UI는 구현했으나 실제 파일 선택/업로드 로직은 이슈 범위 외 (별도 이슈에서 expo-document-picker + Edge Function 연동 예정).

6. **총 자산**: 현재가 API가 stub 상태이므로 evaluated_amount 없는 종목은 total_invested(투입원금)로 대체 합산. 실제 구현 시 현재가 × 수량으로 계산됨.
