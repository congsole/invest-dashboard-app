# 프론트엔드 구현 내역

## 새로 만든 화면
없음

## 새로 만든 컴포넌트
없음 (기존 컴포넌트 전면 수정)

## 수정한 파일

### `app/types/dashboard.ts`
- `Period` 타입에서 `'all'` 제거 (이제 `'day' | 'week' | 'month' | 'year'`)
- `BucketUnit` 타입 추가 (Period와 동일 범주, 클라이언트 버킷팅에 사용)
- `HistoryMarker.event_type`을 `'dividend' | 'withdraw'`에서 `'dividend'`로 변경 (이슈 028: 출금 마커 제거)
- `BucketedSnapshot` 인터페이스 추가: 집계 단위로 버킷팅된 스냅샷, `bucket_date`/`x_label` 필드 포함

### `app/services/dashboard.ts`
- `getDailySnapshots(from, to)` → `getDailySnapshots()`: from/to 파라미터 제거, 전체 기간 1회 조회
- `getHistoryMarkers(from, to)` → `getHistoryMarkers()`: p_from/p_to 파라미터 제거, `{}` 호출
- `periodToDateRange()`: 더 이상 내부 사용하지 않으므로 `@deprecated` 처리, 하위 호환만 유지

### `app/hooks/useDashboard.ts`
- `fetchHistory` 시그니처를 `(period, assetType?)` → `(assetType?)` 로 변경
- 초기 히스토리 로드: `fetchHistory('month')` → `fetchHistory()`로 변경 (전체 기간 1회 조회)
- `Period` import 제거, `periodToDateRange` import 제거
- `fetchHistory` 호출 시 서버 재조회가 집계 단위 전환과 무관함을 주석으로 명시

### `app/components/AssetHistoryChart.tsx`
전면 재작성. 주요 변경 사항:

**집계 단위 전환**
- PERIODS 배열에서 `'all'` 항목 제거
- `BUCKET_UNITS` 상수 사용: `day/week/month/year` 4개
- `onPeriodChange` prop 제거 — 단위 전환 시 서버 재조회 없음, 클라이언트에서 `useMemo`로 버킷팅 재계산

**클라이언트 버킷팅 (`bucketSnapshots`)**
- `getBucketKey()`: 집계 단위별 버킷 키 계산 (일별 YYYY-MM-DD / 주별 월요일 기준 / 월별 YYYY-MM-01 / 연별 YYYY-01-01)
- `bucketSnapshots()`: DailySnapshot 배열을 BucketedSnapshot 배열로 변환. 버킷 값 = 버킷 내 마지막 스냅샷 값 (오름차순 정렬 활용)
- 버킷팅은 `useMemo`로 계산 → 단위 전환 시 즉시 반영, 서버 재호출 없음

**X축 라벨**
- `getXLabel()`: 일별·주별 `MM.DD`, 월별 `YY.MM`, 연별 `YYYY`
- `computeLabelIndices()`: 최소 40px 간격 기준으로 라벨 표시 인덱스 결정 (겹침 방지)
- 마지막 인덱스 항상 표시

**가로 스크롤**
- `ScrollView horizontal`로 전체 히스토리 탐색
- `BUCKET_PX` 상수: 버킷 1개당 픽셀 (일 12px / 주 24px / 월 36px / 년 60px)
- `contentOffset`으로 초기 스크롤 위치를 오른쪽 끝(최신 날짜)으로 설정

**Y축 금액 라벨 + 눈금선**
- `Y_AXIS_WIDTH = 44`의 고정 영역에 5개 Y축 눈금 라벨 표시 (만/억 단위 축약)
- SVG `Line`으로 옅은 가로 눈금선 (`#e5eeff`)
- Y축 스케일: 전체 라인(평가액 + 원금 + 예수금) 통합 min~max + 10% 여백

**원금 음수 구간 렌더링**
- Y축 스케일이 음수 구간을 포함하므로 원금 음수 시 0 기준선 아래로 렌더링 (클리핑 없음)
- `showZeroLine`: yMin < 0일 때 0 기준선 대시선 표시

**SVG 직접 렌더링 (`react-native-svg`)**
- `react-native-gifted-charts` 대신 `react-native-svg` 직접 사용 (이미 설치됨)
- Catmull-Rom spline → cubic bezier 근사로 부드러운 라인
- 평가액 채움 영역: `LinearGradient` 사용

**마커 개편**
- 출금 마커(▽) 완전 제거
- 배당 마커(●): `Circle` SVG 요소로 렌더링, 평가액 라인 위에 8px 오프셋 표시
- 마커 날짜는 버킷 단위로 매핑 (`getBucketKey`로 동일 버킷인지 확인)
- 범례에서 `'withdraw'` 마커 항목 제거

**렌더링 최적화**
- `ChartBody` 내부 컴포넌트를 `memo`로 분리 — 버킷 단위 상태는 `AssetHistoryChart` 내부로 격리
- `bucketed` 계산: `useMemo([snapshots, bucketUnit])`
- `yMin/yMax`, `yTicks`, `dividendMarkers`, `labelIndices`: 모두 `useMemo`로 최적화

### `app/screens/DashboardScreen.tsx`
- `Period` import 제거 (`types/dashboard`에서)
- `selectedPeriod` 상태 제거 (이제 차트 컴포넌트 내부에서 관리)
- `handlePeriodChange` 콜백 제거
- `handleFilterChange`: 부문 필터 변경 시 히스토리 서버 재조회 제거 (이슈 028 원칙)
- `AssetHistoryChart`의 `onPeriodChange` prop 전달 제거
- `useDashboard`에서 `fetchHistory` destructuring 제거 (더 이상 직접 호출 안 함)

## UI 레퍼런스 매핑
- `ui/dashboard/code.html` → `app/components/AssetHistoryChart.tsx`
  - 집계 단위 버튼 (`1D / 1W / 1M / 1Y`) → `일 / 주 / 월 / 년` (전체 없음)
  - SVG 라인 차트 영역 → `ChartBody` 컴포넌트 (react-native-svg 직접 사용)

## 특이사항

### react-native-gifted-charts → react-native-svg 직접 사용
기존 `AssetHistoryChart`는 `react-native-gifted-charts`의 `LineChart`를 사용했다.
이번 개편에서 Y축 라벨, 가로 스크롤, 0 기준선, 배당 마커 등을 세밀하게 제어해야 하므로
`react-native-svg`를 직접 사용하는 커스텀 SVG 차트로 교체했다.
`react-native-svg`는 이미 `app/package.json`에 `^15.15.4`로 설치되어 있다.

### 가로 스크롤 초기 위치
`ScrollView`의 `contentOffset`으로 최신 날짜(오른쪽 끝)에서 시작한다.
RN ScrollView에서 `contentOffset`은 controlled prop이 아니므로 초기 위치만 설정하고
이후 사용자가 자유롭게 스크롤할 수 있다.

### 원금 음수 구간
`principal_krw`가 음수일 때 Y축 스케일이 0 아래로 확장되어 0 기준선 아래에 라인이 그려진다.
`yMin < 0`일 때 대시선으로 0 기준선을 별도 표시한다.

### DashboardScreen 필터 변경 시 히스토리 재조회 제거
이전 구현에서는 부문 필터 변경 시 `fetchHistory`를 호출했다.
이슈 028 원칙에 따라 히스토리는 전체 기간 1회 조회 후 클라이언트에서만 처리하므로
부문 필터/집계 단위 변경 모두 서버 재조회를 하지 않는다.
(daily_snapshots는 전체 통합 값만 저장하므로 부문별 필터링도 현재는 미지원 — 기존과 동일)

### TypeScript 타입 체크 결과
`npx tsc --noEmit` 실행 결과, 앱 코드(`app/` 디렉토리)에서 에러 없음.
supabase/functions의 Deno 관련 에러는 이전부터 존재하던 것으로 이번 변경과 무관하다.
