import React, { memo, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { DailySnapshot, HistoryMarker, Period } from '../types/dashboard';

// ────────────────────────────────────────────
// 상수 / 유틸
// ────────────────────────────────────────────

const SCREEN_W = Dimensions.get('window').width;
// 화면 - 좌우 패딩(20×2) - 카드 내부 패딩(20×2)
const CHART_WIDTH = SCREEN_W - 40 - 40;

const PERIODS: { key: Period; label: string }[] = [
  { key: 'day', label: '일' },
  { key: 'week', label: '주' },
  { key: 'month', label: '월' },
  { key: 'year', label: '년' },
  { key: 'all', label: '전체' },
];

function formatKrwShort(value: number): string {
  if (Math.abs(value) >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}억`;
  if (Math.abs(value) >= 10_000) return `${(value / 10_000).toFixed(0)}만`;
  return value.toLocaleString('ko-KR');
}

// ────────────────────────────────────────────
// Props
// ────────────────────────────────────────────

interface AssetHistoryChartProps {
  snapshots: DailySnapshot[];
  markers: HistoryMarker[];
  loading: boolean;
  showCashLine: boolean; // 부문 필터가 "전체"일 때만 true
  onPeriodChange: (period: Period) => void;
}

// ────────────────────────────────────────────
// 컴포넌트
// ────────────────────────────────────────────

export const AssetHistoryChart = memo(function AssetHistoryChart({
  snapshots,
  markers,
  loading,
  showCashLine,
  onPeriodChange,
}: AssetHistoryChartProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<Period>('month');

  const handlePeriodPress = useCallback(
    (period: Period) => {
      setSelectedPeriod(period);
      onPeriodChange(period);
    },
    [onPeriodChange],
  );

  // ── 차트 데이터 변환 ──
  // gifted-charts LineChart: data(총평가액), data2(원금), data3(예수금)
  const totalLine = snapshots.map((s, idx) => ({
    value: s.total_value_krw,
    dataPointText:
      idx === snapshots.length - 1 ? formatKrwShort(s.total_value_krw) : '',
    label: idx === 0 || idx === Math.floor(snapshots.length / 2) ? s.snapshot_date.slice(5) : '',
  }));

  const principalLine = snapshots.map((s) => ({
    value: s.principal_krw,
  }));

  // 예수금 KRW 환산: cash_krw + cash_usd × 해당일 환율
  const cashLine = snapshots.map((s) => ({
    value: s.cash_krw + s.cash_usd * s.fx_rate_usd,
  }));

  // 이벤트 마커를 날짜 기반으로 매핑
  const markerDateSet = new Set(markers.map((m) => m.event_date));

  return (
    <View style={styles.card}>
      {/* 헤더 */}
      <View style={styles.header}>
        <Text style={styles.title}>자산 히스토리</Text>
        <View style={styles.periodSelector}>
          {PERIODS.map((p) => (
            <TouchableOpacity
              key={p.key}
              style={[
                styles.periodButton,
                selectedPeriod === p.key && styles.periodButtonActive,
              ]}
              onPress={() => handlePeriodPress(p.key)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.periodText,
                  selectedPeriod === p.key && styles.periodTextActive,
                ]}
              >
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* 차트 영역 */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color="#003ec7" />
        </View>
      ) : selectedPeriod === 'day' ? (
        <View style={styles.centerBox}>
          <Text style={styles.emptyText}>일 단위는 실시간 데이터를 사용합니다</Text>
          <Text style={styles.emptySubText}>곧 지원 예정</Text>
        </View>
      ) : snapshots.length === 0 ? (
        <View style={styles.centerBox}>
          <Text style={styles.emptyText}>데이터가 없습니다</Text>
          <Text style={styles.emptySubText}>
            이벤트를 추가하면 다음 날부터 그래프가 표시됩니다
          </Text>
        </View>
      ) : (
        <View style={styles.chartWrapper}>
          <LineChart
            // 평가액 라인 (파란 실선) — 기준 라인
            data={totalLine}
            // 원금 라인 (회색 점선)
            data2={principalLine}
            // 예수금 라인 (진한 회색 실선, 부문 선택 시 숨김)
            data3={showCashLine ? cashLine : undefined}
            width={CHART_WIDTH}
            height={160}
            // 평가액 (파란 실선 + 파란 영역)
            color1="#003ec7"
            thickness1={3}
            startFillColor1="#003ec7"
            endFillColor1="rgba(0,62,199,0)"
            startOpacity1={0.12}
            endOpacity1={0}
            // 원금 (회색 점선 + 옅은 회색 영역, 바닥부터 채움)
            color2="#bac7de"
            thickness2={2}
            startFillColor2="rgba(186,199,222,0.18)"
            endFillColor2="rgba(186,199,222,0)"
            startOpacity2={1}
            endOpacity2={0}
            // 예수금 (진한 회색 실선)
            color3="#525f73"
            thickness3={2}
            areaChart
            curved
            hideDataPoints
            hideYAxisText
            hideAxesAndRules
            backgroundColor="transparent"
            initialSpacing={0}
            endSpacing={0}
            yAxisColor="transparent"
            xAxisColor="transparent"
            rulesColor="transparent"
          />
        </View>
      )}

      {/* 범례 */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendLine, { backgroundColor: '#003ec7' }]} />
          <Text style={styles.legendText}>평가액</Text>
        </View>
        <View style={styles.legendItem}>
          {/* 점선은 borderStyle으로 표현 */}
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
        {markers.some((m) => m.event_type === 'withdraw') && (
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#bac7de' }]} />
            <Text style={styles.legendText}>출금</Text>
          </View>
        )}
      </View>

      {/* 마커 날짜 안내 (마커가 있을 때) */}
      {markers.length > 0 && (
        <View style={styles.markerNote}>
          <Text style={styles.markerNoteText}>
            마커: {markers.map((m) => `${m.event_date.slice(5)} ${m.event_type === 'dividend' ? '●' : '▽'}`).join('  ')}
          </Text>
        </View>
      )}
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
    marginBottom: 20,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0b1c30',
  },
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
  chartWrapper: {
    marginHorizontal: -4,
    overflow: 'hidden',
  },
  centerBox: {
    height: 160,
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
  markerNote: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#eff4ff',
  },
  markerNoteText: {
    fontSize: 10,
    color: '#737688',
    lineHeight: 15,
  },
});
