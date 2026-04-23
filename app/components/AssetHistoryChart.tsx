import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { AssetHistoryItem, Period } from '../types/dashboard';

interface AssetHistoryChartProps {
  data: AssetHistoryItem[];
  loading: boolean;
  onPeriodChange: (period: Period) => void;
  exchangeRate: number;
}

const PERIODS: { key: Period; label: string }[] = [
  { key: 'day', label: '일' },
  { key: 'week', label: '주' },
  { key: 'month', label: '월' },
  { key: 'year', label: '년' },
];

const CHART_WIDTH = Dimensions.get('window').width - 40 - 48; // screen - horizontal padding - card padding

function formatKrw(value: number): string {
  if (value >= 100000000) return `${(value / 100000000).toFixed(1)}억`;
  if (value >= 10000) return `${(value / 10000).toFixed(0)}만`;
  return value.toLocaleString('ko-KR');
}

export function AssetHistoryChart({
  data,
  loading,
  onPeriodChange,
  exchangeRate,
}: AssetHistoryChartProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<Period>('month');

  const handlePeriodPress = (period: Period) => {
    setSelectedPeriod(period);
    onPeriodChange(period);
  };

  // gifted-charts LineChart 데이터 포맷 변환
  const totalAssetsLine = data.map((item, idx) => ({
    // TODO: BE 현재가 연동 완료 후 실제 총자산(현재가 × 수량 + 예수금)으로 교체
    value: item.total_invested,
    dataPointText: idx === data.length - 1 ? formatKrw(item.total_invested) : '',
  }));

  const principalLine = data.map((item) => ({
    value: item.total_invested,
  }));

  const feesTaxLine = data.map((item) => ({
    value: item.total_fee_tax,
  }));

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

      {/* 차트 */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#003ec7" />
        </View>
      ) : data.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>데이터가 없습니다</Text>
          <Text style={styles.emptySubText}>매매 이벤트를 추가하면 그래프가 표시됩니다</Text>
        </View>
      ) : (
        <View style={styles.chartWrapper}>
          <LineChart
            data={totalAssetsLine}
            data2={principalLine}
            data3={feesTaxLine}
            width={CHART_WIDTH}
            height={160}
            color1="#003ec7"
            color2="#bac7de"
            color3="#ffdad6"
            thickness1={3}
            thickness2={2}
            thickness3={1.5}
            startFillColor1="#003ec7"
            endFillColor1="rgba(0,62,199,0)"
            startOpacity1={0.1}
            endOpacity1={0}
            areaChart
            curved
            hideDataPoints
            hideYAxisText
            hideAxesAndRules
            backgroundColor="transparent"
            initialSpacing={0}
            endSpacing={0}
            noOfSections={3}
            yAxisColor="transparent"
            xAxisColor="transparent"
            rulesColor="transparent"
          />
        </View>
      )}

      {/* 범례 */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#003ec7' }]} />
          <Text style={styles.legendText}>총 자산</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={styles.legendDash} />
          <Text style={styles.legendText}>투입 원금</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#ffdad6' }]} />
          <Text style={styles.legendText}>수수료+세금</Text>
        </View>
      </View>
    </View>
  );
}

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
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  periodButtonActive: {
    backgroundColor: '#ffffff',
  },
  periodText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#434656',
  },
  periodTextActive: {
    color: '#003ec7',
    fontWeight: '700',
  },
  chartWrapper: {
    marginHorizontal: -4,
  },
  loadingContainer: {
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
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
    gap: 16,
    marginTop: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 4,
    borderRadius: 2,
  },
  legendDash: {
    width: 10,
    height: 0,
    borderTopWidth: 2,
    borderTopColor: '#bac7de',
    borderStyle: 'dashed',
  },
  legendText: {
    fontSize: 11,
    color: '#434656',
    fontWeight: '500',
  },
});
