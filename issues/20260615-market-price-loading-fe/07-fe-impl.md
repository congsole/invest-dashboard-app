# 프론트엔드 구현 내역

## 수정한 파일

- `app/hooks/useDashboard.ts` — 2단계 현재가 로딩 전략 전면 재구현
- `app/types/dashboard.ts` — `HoldingCardData.price_source` 필드 추가
- `app/components/HoldingCard.tsx` — baseline/cached 가격 출처 표시 개선
- `app/screens/DashboardScreen.tsx` — `priceUpdating` 상태 연결 + 실시간 갱신 인디케이터

## 구현 상세

### 1. `app/hooks/useDashboard.ts` — 2단계 로딩 전략

#### 1단계: baseline 즉시 표시

`fetchData` 진입 시 전체 스피너(`initialLoading = true`)를 유지하되, 다음 순서로 즉시 전환한다:

1. `getExchangeRate()` — 환율 조회
2. `getKpiSummary(null, [], rate.rate)` — holdings 목록 확보 (현재가 없이)
3. `getBaselinePrices(holdings)` — prices 테이블 최신 종가(EOD) 조회
   - 동일 ticker+asset_type에 여러 날짜 행이 올 수 있으므로 date MAX 행만 사용
   - 실패 시 빈 priceMap으로 계속 진행 (에러 표시 없음)
4. baseline priceMap으로 `getKpiSummary` 재계산
5. `setKpi` / `setHoldings` → **`setInitialLoading(false)` / `setRefreshing(false)`**

이 시점에서 화면이 즉시 렌더링된다. baseline 데이터는 `price_source: 'baseline'`으로 표시된다.

#### 2단계: 실시간 점진 갱신

baseline 완료 직후 청크 루프를 시작한다.

**청크 분할 전략 (`buildChunks`):**
- 첫 청크: 한국주식 전체 + 코인 전체 + 미국주식 최대 8개
- 2번째 청크~: 미국주식 잔여분을 8개씩

**루프 처리:**
- 첫 청크: 즉시 호출 (대기 없음)
- 2번째 청크부터: `delay(60_000, cancelSignal)` 대기 후 호출
- 각 청크 응답 도착 시:
  - `mergePriceMap(priceMap, prices)` — 성공 종목만 갱신, `failed` 종목은 baseline 유지
  - `getKpiSummary` 재계산 → `setKpi` / `setHoldings` 즉시 갱신
  - KPI 재계산 실패 시 `setHoldings`만 갱신 (priceMap은 최신 상태 유지)
- 개별 청크 실패 시 로그만 남기고 다음 청크로 계속 진행

#### cleanup 처리

```
chunkCancelRef = useRef<{ cancelled: boolean }>({ cancelled: false })
```

- `fetchData` 진입 시: `chunkCancelRef.current.cancelled = true` (이전 루프 취소) → 새 cancelSignal 생성
- `useEffect` cleanup (`return () => {}`): `chunkCancelRef.current.cancelled = true` (언마운트 시)
- `delay` 함수: setTimeout 만료 시 `signal.cancelled` 재확인 → 취소됐으면 reject
- 청크 루프 매 반복: `if (cancelSignal.cancelled) break` — setState on unmounted 방지

#### 새 상태: `priceUpdating`

실시간 청크 루프 실행 중 `true`. baseline 완료 후 청크 루프 진입 시 `setPriceUpdating(true)`, 모든 청크 완료/취소 시 `false`.

### 2. `app/types/dashboard.ts` — `price_source` 필드 추가

`HoldingCardData`에 `price_source: 'baseline' | 'realtime' | 'cached' | null` 추가.

- `baseline`: prices 테이블 저장 종가 (EOD)
- `realtime`: 외부 API 실시간 조회 성공
- `cached`: Edge Function 내부 캐시
- `null`: 현재가 없음

### 3. `app/components/HoldingCard.tsx` — 가격 출처 표시

기존 단일 `cachedNote` → `price_source` 값에 따라 분기:

- `source === 'baseline'`: "저장 종가 기준 (M월 D일) — 실시간 갱신 중" 표시
- `source === 'cached'`: "캐시 데이터 기준 (HH:MM)" 표시 (기존과 동일)
- `source === 'realtime'` 또는 `null`: 노트 없음

### 4. `app/screens/DashboardScreen.tsx` — 갱신 인디케이터

`useDashboard`에서 `priceUpdating`을 받아 헤더 하단에 표시:

```
ActivityIndicator (small) + "현재가 갱신 중..."
```

`priceUpdating = false`이면 인디케이터가 사라진다.

`handleGraphRefresh`에서 `MarketPriceItem.source` 필드도 올바르게 채우도록 수정:
- `price_source === 'realtime'` → `'realtime'`
- 나머지 → `'cached'`

## 렌더링 최적화 원칙 준수

- **전체 스피너 최소화**: `initialLoading = false` 전환 시점을 baseline 완료 직후로 앞당겨, 실질적으로 스피너 노출 시간을 최소화 (DB 1회 읽기 + KPI 2회 RPC 정도)
- **refetch/청크 갱신 시 기존 콘텐츠 유지**: baseline 표시 후 청크 갱신은 `setHoldings`만 갱신해 기존 카드가 유지됨
- **청크 갱신 시 불필요한 리렌더링 방지**: `HoldingCard`는 이미 `React.memo`로 감싸져 있어 변경된 카드만 재렌더링
- **cleanup**: 언마운트/refetch 시 `cancelSignal.cancelled = true`로 청크 루프 즉시 중단

## 특이사항

- `delay` 함수: `setTimeout` 취소는 Promise 외부에서 불가능하므로, `signal.cancelled` 플래그를 setTimeout 만료 시점에 재확인하는 방식 채택. 60초 대기 중 취소 요청이 들어오면 setTimeout이 만료될 때까지 대기 후 reject. (React 컴포넌트는 이미 언마운트됐으므로 setState가 호출되지 않는다 — cancelSignal 체크가 setState 전에 있음)
- baseline priceMap 구성 시 동일 ticker가 여러 날짜로 올 수 있어 in-memory date MAX 비교로 최신 행만 사용
- 미국주식 0~8개일 때는 청크가 1개이므로 60초 대기 없이 즉시 완료
