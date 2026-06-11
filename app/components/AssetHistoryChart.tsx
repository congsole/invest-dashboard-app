/**
 * AssetHistoryChart — 자산 히스토리 그래프 컴포넌트
 *
 * 이슈 028 개편 사항:
 * - 집계 단위(일별/주별/월별/연별) 버튼은 조회 범위가 아닌 버킷 크기를 바꾼다
 * - 클라이언트 버킷팅: 전체 기간 스냅샷을 1회 조회하여 버킷팅은 클라이언트에서 처리
 * - "전체" 버튼 제거, 단위 전환 시 서버 재조회 없음
 * - X축 라벨: 일별 MM.DD / 주별·월별 YY.MM / 연별 YYYY, 겹치지 않게 자동 배치
 * - Y축 금액 라벨 (만/억 단위 축약), 옅은 가로 눈금선
 * - Y축 스케일: 전체 라인 통합 최소~최대 기준, 원금 음수 구간도 0 기준선 아래로 렌더링
 * - 출금 마커(▽) 제거, 배당 마커(●)만 유지
 * - 전체 히스토리 가로 스크롤로 탐색
 */

import React, { memo, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  ScrollView,
} from 'react-native';
import Svg, { Path, Line, Circle, Defs, LinearGradient, Stop, G } from 'react-native-svg';
import {
  DailySnapshot,
  BucketedSnapshot,
  BucketUnit,
  HistoryMarker,
  SnapshotRefreshQuota,
} from '../types/dashboard';
import { MAX_SNAPSHOT_QUOTA } from '../hooks/useSnapshotRefresh';

// ────────────────────────────────────────────
// 상수
// ────────────────────────────────────────────

const SCREEN_W = Dimensions.get('window').width;
// 화면 - 좌우 패딩(20×2) - 카드 내부 패딩(20×2)
const CHART_INNER_W = SCREEN_W - 40 - 40;

/** Y축 라벨 영역 너비 */
const Y_AXIS_WIDTH = 44;

/** 버킷 1개당 픽셀 너비 (가로 스크롤 기반) */
const BUCKET_PX: Record<BucketUnit, number> = {
  day: 12,
  week: 24,
  month: 36,
  year: 60,
};

/** 차트 높이 */
const CHART_HEIGHT = 160;

/** Y축 눈금 라벨 수 */
const Y_TICK_COUNT = 4;

/** 가로 스크롤 최소 너비 */
const MIN_CHART_SCROLL_W = CHART_INNER_W - Y_AXIS_WIDTH;

const BUCKET_UNITS: { key: BucketUnit; label: string }[] = [
  { key: 'day', label: '일' },
  { key: 'week', label: '주' },
  { key: 'month', label: '월' },
  { key: 'year', label: '년' },
];

// ────────────────────────────────────────────
// 유틸 함수
// ────────────────────────────────────────────

function formatKrwShort(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}억`;
  if (abs >= 10_000) return `${(value / 10_000).toFixed(0)}만`;
  return value.toLocaleString('ko-KR');
}

/**
 * YYYY-MM-DD 문자열을 파싱한다.
 * Date 생성자의 UTC 해석 문제를 피하기 위해 직접 파싱.
 */
function parseDateStr(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * 버킷 키 계산: 집계 단위별로 날짜를 동일 버킷 내 공통 키 문자열로 변환한다.
 */
function getBucketKey(dateStr: string, unit: BucketUnit): string {
  const d = parseDateStr(dateStr);
  switch (unit) {
    case 'day':
      return dateStr; // YYYY-MM-DD
    case 'week': {
      // 월요일 기준 주 시작일 계산
      const day = d.getDay(); // 0=일, 1=월, ...
      const diff = day === 0 ? -6 : 1 - day; // 월요일로 보정
      const monday = new Date(d);
      monday.setDate(d.getDate() + diff);
      // toISOString()은 UTC 기준이므로 KST(UTC+9) 환경에서 하루가 밀린다.
      // getFullYear/getMonth/getDate로 로컬 날짜를 직접 조합한다.
      const y = monday.getFullYear();
      const m = String(monday.getMonth() + 1).padStart(2, '0');
      const dd2 = String(monday.getDate()).padStart(2, '0');
      return `${y}-${m}-${dd2}`;
    }
    case 'month':
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    case 'year':
      return `${d.getFullYear()}-01-01`;
  }
}

/**
 * X축 라벨 형식:
 * - 일별: MM.DD
 * - 주별·월별: YY.MM
 * - 연별: YYYY
 */
function getXLabel(bucketDate: string, unit: BucketUnit): string {
  const d = parseDateStr(bucketDate);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(2);
  const yyyy = String(d.getFullYear());

  switch (unit) {
    case 'day':
      return `${mm}.${dd}`;
    case 'week':
      return `${mm}.${dd}`;
    case 'month':
      return `${yy}.${mm}`;
    case 'year':
      return yyyy;
  }
}

/**
 * DailySnapshot 배열을 집계 단위(BucketUnit)로 버킷팅한다.
 * 버킷 값 = 버킷 내 마지막 스냅샷 값.
 */
function bucketSnapshots(snapshots: DailySnapshot[], unit: BucketUnit): BucketedSnapshot[] {
  if (snapshots.length === 0) return [];

  // 버킷별로 마지막 스냅샷을 수집
  const bucketMap = new Map<string, DailySnapshot>();
  for (const s of snapshots) {
    const key = getBucketKey(s.snapshot_date, unit);
    // snapshots는 오름차순 정렬이므로 나중에 덮어쓸수록 버킷 내 마지막 값
    bucketMap.set(key, s);
  }

  // 키 순서 보존 (날짜 오름차순)
  const sortedKeys = Array.from(bucketMap.keys()).sort();

  return sortedKeys.map((key) => {
    const s = bucketMap.get(key)!;
    return {
      bucket_date: key,
      x_label: getXLabel(key, unit),
      total_value_krw: s.total_value_krw,
      principal_krw: s.principal_krw,
      cash_krw: s.cash_krw,
      cash_usd: s.cash_usd,
      net_profit_krw: s.net_profit_krw,
      fx_rate_usd: s.fx_rate_usd,
    };
  });
}

/**
 * X축 라벨 겹침 방지: 최소 간격(px)을 기준으로 라벨을 표시할 인덱스를 결정한다.
 */
function computeLabelIndices(count: number, bucketPx: number): Set<number> {
  const MIN_LABEL_GAP_PX = 40;
  const step = Math.max(1, Math.ceil(MIN_LABEL_GAP_PX / bucketPx));
  const indices = new Set<number>();
  for (let i = 0; i < count; i += step) {
    indices.add(i);
  }
  // 마지막 인덱스는 항상 표시
  if (count > 0) indices.add(count - 1);
  return indices;
}

// ────────────────────────────────────────────
// SVG 라인 차트 그리기 유틸
// ────────────────────────────────────────────

function valuesToPath(values: number[], minVal: number, maxVal: number, bucketPx: number, height: number): string {
  if (values.length === 0) return '';
  const range = maxVal - minVal;
  const safeRange = range === 0 ? 1 : range;

  const toY = (v: number) => height - ((v - minVal) / safeRange) * height;

  const points = values.map((v, i) => ({
    x: i * bucketPx + bucketPx / 2,
    y: toY(v),
  }));

  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y}`;
  }

  // Catmull-Rom spline → cubic bezier 근사
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(i + 2, points.length - 1)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

// ────────────────────────────────────────────
// Props
// ────────────────────────────────────────────

interface AssetHistoryChartProps {
  snapshots: DailySnapshot[];
  markers: HistoryMarker[];
  loading: boolean;
  showCashLine: boolean;
  // ── 새로고침 버튼 관련 ──
  quota: SnapshotRefreshQuota;
  refreshing: boolean;
  onRefresh: () => void;
}

// ────────────────────────────────────────────
// 내부 차트 컴포넌트 (memo 분리)
// ────────────────────────────────────────────

interface ChartBodyProps {
  bucketed: BucketedSnapshot[];
  markers: HistoryMarker[];
  bucketUnit: BucketUnit;
  showCashLine: boolean;
}

const ChartBody = memo(function ChartBody({
  bucketed,
  markers,
  bucketUnit,
  showCashLine,
}: ChartBodyProps) {
  const bucketPx = BUCKET_PX[bucketUnit];
  const totalBuckets = bucketed.length;
  const chartScrollW = Math.max(totalBuckets * bucketPx, MIN_CHART_SCROLL_W);

  // Y축 스케일: 전체 라인 통합 최소~최대
  const { yMin, yMax } = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const b of bucketed) {
      const values = [b.total_value_krw, b.principal_krw];
      if (showCashLine) values.push(b.cash_krw + b.cash_usd * b.fx_rate_usd);
      for (const v of values) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    if (!isFinite(min)) return { yMin: 0, yMax: 1 };
    // 여백 10%
    const padding = Math.max((max - min) * 0.1, Math.abs(max) * 0.05, 10000);
    return { yMin: min - padding, yMax: max + padding };
  }, [bucketed, showCashLine]);

  const range = yMax - yMin;

  // Y축 눈금 계산
  const yTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let i = 0; i <= Y_TICK_COUNT; i++) {
      ticks.push(yMin + (range / Y_TICK_COUNT) * i);
    }
    return ticks;
  }, [yMin, range]);

  // 0 기준선 Y 좌표 (원금이 음수가 될 수 있으므로 0선 표시)
  const zeroY = CHART_HEIGHT - ((0 - yMin) / range) * CHART_HEIGHT;
  const showZeroLine = yMin < 0 && zeroY >= 0 && zeroY <= CHART_HEIGHT;

  // 라인 데이터
  const totalValues = bucketed.map((b) => b.total_value_krw);
  const principalValues = bucketed.map((b) => b.principal_krw);
  const cashValues = bucketed.map((b) => b.cash_krw + b.cash_usd * b.fx_rate_usd);

  const totalPath = valuesToPath(totalValues, yMin, yMax, bucketPx, CHART_HEIGHT);
  const principalPath = valuesToPath(principalValues, yMin, yMax, bucketPx, CHART_HEIGHT);
  const cashPath = valuesToPath(cashValues, yMin, yMax, bucketPx, CHART_HEIGHT);

  // X축 라벨 표시 인덱스
  const labelIndices = computeLabelIndices(totalBuckets, bucketPx);

  // 배당 마커 위치 계산
  const dividendMarkers = useMemo(() => {
    const markerSet = new Map<string, number>(); // date → amount_krw
    for (const m of markers) {
      markerSet.set(m.event_date, m.amount_krw);
    }

    return bucketed
      .map((b, idx) => {
        // 버킷 날짜와 마커 날짜를 매핑: 버킷 내 마지막 스냅샷 날짜로 찾기보다
        // 버킷 키 날짜 범위 내에 마커가 있으면 표시
        const hasMarker = markers.some((m) => {
          const mk = getBucketKey(m.event_date, bucketUnit);
          return mk === b.bucket_date;
        });
        if (!hasMarker) return null;

        const totalY = CHART_HEIGHT - ((b.total_value_krw - yMin) / range) * CHART_HEIGHT;
        const cx = idx * bucketPx + bucketPx / 2;
        return { cx, cy: Math.max(4, Math.min(CHART_HEIGHT - 4, totalY - 8)), idx };
      })
      .filter((m): m is { cx: number; cy: number; idx: number } => m !== null);
  }, [bucketed, markers, bucketUnit, yMin, range, bucketPx]);

  // 채움 영역(평가액 그라디언트)
  const fillPath = totalPath
    ? `${totalPath} L ${(totalBuckets - 1) * bucketPx + bucketPx / 2} ${CHART_HEIGHT} L ${bucketPx / 2} ${CHART_HEIGHT} Z`
    : '';

  if (totalBuckets === 0) {
    return (
      <View style={styles.centerBox}>
        <Text style={styles.emptyText}>데이터가 없습니다</Text>
        <Text style={styles.emptySubText}>
          이벤트를 추가하면 다음 날부터 그래프가 표시됩니다
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.chartOuter}>
      {/* Y축 라벨 */}
      <View style={[styles.yAxis, { height: CHART_HEIGHT }]}>
        {yTicks.slice().reverse().map((tick, i) => (
          <Text key={i} style={styles.yAxisLabel}>
            {formatKrwShort(tick)}
          </Text>
        ))}
      </View>

      {/* 차트 스크롤 영역 */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chartScroll}
        contentContainerStyle={{ width: chartScrollW + 8 }}
        // 최신 날짜(오른쪽 끝)에서 시작
        contentOffset={{ x: Math.max(0, chartScrollW - MIN_CHART_SCROLL_W), y: 0 }}
      >
        <View>
          {/* SVG 차트 영역 */}
          <Svg width={chartScrollW} height={CHART_HEIGHT}>
            <Defs>
              <LinearGradient id="totalFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor="#003ec7" stopOpacity={0.12} />
                <Stop offset="100%" stopColor="#003ec7" stopOpacity={0} />
              </LinearGradient>
            </Defs>

            {/* 가로 눈금선 */}
            {yTicks.map((tick, i) => {
              const tickY = CHART_HEIGHT - ((tick - yMin) / range) * CHART_HEIGHT;
              if (tickY < 0 || tickY > CHART_HEIGHT) return null;
              return (
                <Line
                  key={i}
                  x1={0}
                  y1={tickY}
                  x2={chartScrollW}
                  y2={tickY}
                  stroke="#e5eeff"
                  strokeWidth={1}
                />
              );
            })}

            {/* 0 기준선 (음수 구간 있을 때) */}
            {showZeroLine && (
              <Line
                x1={0}
                y1={zeroY}
                x2={chartScrollW}
                y2={zeroY}
                stroke="#bac7de"
                strokeWidth={1}
                strokeDasharray="4 3"
              />
            )}

            {/* 평가액 채움 영역 */}
            {fillPath ? (
              <Path d={fillPath} fill="url(#totalFill)" />
            ) : null}

            {/* 예수금 라인 */}
            {showCashLine && cashPath ? (
              <Path d={cashPath} fill="none" stroke="#525f73" strokeWidth={2} />
            ) : null}

            {/* 원금 라인 (점선) */}
            {principalPath ? (
              <Path
                d={principalPath}
                fill="none"
                stroke="#bac7de"
                strokeWidth={2}
                strokeDasharray="5 3"
              />
            ) : null}

            {/* 평가액 라인 */}
            {totalPath ? (
              <Path d={totalPath} fill="none" stroke="#003ec7" strokeWidth={3} />
            ) : null}

            {/* 배당 마커 (●) */}
            {dividendMarkers.map((m) => (
              <G key={m.idx}>
                <Circle
                  cx={m.cx}
                  cy={m.cy}
                  r={4}
                  fill="#FF8C00"
                  stroke="#ffffff"
                  strokeWidth={1.5}
                />
              </G>
            ))}
          </Svg>

          {/* X축 라벨 */}
          <View style={[styles.xAxis, { width: chartScrollW }]}>
            {bucketed.map((b, idx) => {
              if (!labelIndices.has(idx)) return null;
              return (
                <View
                  key={idx}
                  style={[
                    styles.xLabelWrapper,
                    {
                      left: idx * bucketPx + bucketPx / 2 - 20,
                      width: 40,
                    },
                  ]}
                >
                  <Text style={styles.xLabel} numberOfLines={1}>
                    {b.x_label}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </View>
  );
});

// ────────────────────────────────────────────
// 메인 컴포넌트
// ────────────────────────────────────────────

export const AssetHistoryChart = memo(function AssetHistoryChart({
  snapshots,
  markers,
  loading,
  showCashLine,
  quota,
  refreshing,
  onRefresh,
}: AssetHistoryChartProps) {
  const [bucketUnit, setBucketUnit] = useState<BucketUnit>('month');

  const handleUnitPress = useCallback((unit: BucketUnit) => {
    setBucketUnit(unit);
    // 서버 재조회 없음 — 버킷팅은 클라이언트에서 처리
  }, []);

  const isExhausted = quota.remaining <= 0;
  const isRefreshDisabled = isExhausted || refreshing || loading;

  // 클라이언트 버킷팅 — 단위 변경 시 재계산만 (서버 재호출 없음)
  const bucketed = useMemo(
    () => bucketSnapshots(snapshots, bucketUnit),
    [snapshots, bucketUnit],
  );

  return (
    <View style={styles.card}>
      {/* 헤더 */}
      <View style={styles.header}>
        {/* 좌측: 제목 + 새로고침 버튼 */}
        <View style={styles.titleRow}>
          <Text style={styles.title}>자산 히스토리</Text>
          <TouchableOpacity
            style={[
              styles.refreshButton,
              isRefreshDisabled && styles.refreshButtonDisabled,
            ]}
            onPress={onRefresh}
            disabled={isRefreshDisabled}
            activeOpacity={0.7}
            accessibilityLabel={`스냅샷 새로고침. 오늘 남은 횟수 ${quota.remaining}회`}
          >
            {refreshing ? (
              <ActivityIndicator size={12} color="#003ec7" style={styles.refreshSpinner} />
            ) : (
              <Text
                style={[
                  styles.refreshIcon,
                  isRefreshDisabled && styles.refreshIconDisabled,
                ]}
              >
                ↻
              </Text>
            )}
            <Text
              style={[
                styles.refreshQuota,
                isRefreshDisabled && styles.refreshQuotaDisabled,
              ]}
            >
              {quota.remaining}/{MAX_SNAPSHOT_QUOTA}
            </Text>
          </TouchableOpacity>
        </View>

        {/* 우측: 집계 단위 선택 (일/주/월/년 — "전체" 없음) */}
        <View style={styles.periodSelector}>
          {BUCKET_UNITS.map((u) => (
            <TouchableOpacity
              key={u.key}
              style={[
                styles.periodButton,
                bucketUnit === u.key && styles.periodButtonActive,
              ]}
              onPress={() => handleUnitPress(u.key)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.periodText,
                  bucketUnit === u.key && styles.periodTextActive,
                ]}
              >
                {u.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* 횟수 소진 안내 문구 */}
      {isExhausted && (
        <View style={styles.exhaustedBanner}>
          <Text style={styles.exhaustedText}>
            오늘 새로고침 횟수를 모두 사용했습니다. 내일 다시 이용할 수 있습니다.
          </Text>
        </View>
      )}

      {/* 차트 영역 */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color="#003ec7" />
        </View>
      ) : (
        <ChartBody
          bucketed={bucketed}
          markers={markers}
          bucketUnit={bucketUnit}
          showCashLine={showCashLine}
        />
      )}

      {/* 범례 */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendLine, { backgroundColor: '#003ec7' }]} />
          <Text style={styles.legendText}>평가액</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={styles.legendDash} />
          <Text style={styles.legendText}>원금</Text>
        </View>
        {showCashLine && (
          <View style={styles.legendItem}>
            <View style={[styles.legendLine, { backgroundColor: '#525f73' }]} />
            <Text style={styles.legendText}>예수금</Text>
          </View>
        )}
        {markers.some((m) => m.event_type === 'dividend') && (
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#FF8C00' }]} />
            <Text style={styles.legendText}>배당</Text>
          </View>
        )}
      </View>
    </View>
  );
});

// ────────────────────────────────────────────
// 스타일
// ────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#0b1c30',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 24,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0b1c30',
  },
  // ── 새로고침 버튼 ──
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#eff4ff',
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  refreshButtonDisabled: {
    backgroundColor: '#f5f5f8',
  },
  refreshSpinner: {
    width: 14,
    height: 14,
  },
  refreshIcon: {
    fontSize: 14,
    color: '#003ec7',
    fontWeight: '700',
    lineHeight: 16,
  },
  refreshIconDisabled: {
    color: '#b0b3c0',
  },
  refreshQuota: {
    fontSize: 11,
    fontWeight: '600',
    color: '#003ec7',
    lineHeight: 14,
  },
  refreshQuotaDisabled: {
    color: '#b0b3c0',
  },
  // ── 소진 안내 배너 ──
  exhaustedBanner: {
    backgroundColor: '#eff4ff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  exhaustedText: {
    fontSize: 12,
    color: '#434656',
    lineHeight: 17,
  },
  // ── 집계 단위 선택 ──
  periodSelector: {
    flexDirection: 'row',
    backgroundColor: '#eff4ff',
    borderRadius: 8,
    padding: 3,
    gap: 2,
  },
  periodButton: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  periodButtonActive: {
    backgroundColor: '#ffffff',
  },
  periodText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#434656',
  },
  periodTextActive: {
    color: '#003ec7',
    fontWeight: '700',
  },
  // ── 차트 레이아웃 ──
  chartOuter: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  yAxis: {
    width: Y_AXIS_WIDTH,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingRight: 6,
    paddingBottom: 20, // X축 라벨 높이만큼 여백
  },
  yAxisLabel: {
    fontSize: 9,
    color: '#737688',
    fontVariant: ['tabular-nums'],
  },
  chartScroll: {
    flex: 1,
  },
  // ── X축 라벨 ──
  xAxis: {
    position: 'relative',
    height: 18,
    marginTop: 2,
  },
  xLabelWrapper: {
    position: 'absolute',
    alignItems: 'center',
  },
  xLabel: {
    fontSize: 9,
    color: '#737688',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  // ── 빈 상태 ──
  centerBox: {
    height: CHART_HEIGHT + 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#434656',
  },
  emptySubText: {
    fontSize: 12,
    color: '#737688',
    textAlign: 'center',
  },
  // ── 범례 ──
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendLine: {
    width: 12,
    height: 3,
    borderRadius: 2,
  },
  legendDash: {
    width: 12,
    height: 0,
    borderTopWidth: 2,
    borderTopColor: '#bac7de',
    borderStyle: 'dashed',
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    color: '#434656',
    fontWeight: '500',
  },
});
