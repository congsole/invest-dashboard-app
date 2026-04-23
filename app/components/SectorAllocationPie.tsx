import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PieChart } from 'react-native-gifted-charts';
import { SectorAllocationItem, AssetType } from '../types/dashboard';

interface SectorAllocationPieProps {
  data: SectorAllocationItem[];
}

const SECTOR_COLORS: Record<AssetType, string> = {
  korean_stock: '#003ec7',
  us_stock: '#00762e',
  crypto: '#525f73',
};

const SECTOR_LABELS: Record<AssetType, string> = {
  korean_stock: '한국주식',
  us_stock: '미국주식',
  crypto: '코인',
};

function formatKrw(value: number): string {
  if (value >= 100000000) return `${(value / 100000000).toFixed(1)}억`;
  if (value >= 10000) return `${(value / 10000).toFixed(0)}만원`;
  return `${value.toLocaleString('ko-KR')}원`;
}

export function SectorAllocationPie({ data }: SectorAllocationPieProps) {
  const total = data.reduce((acc, item) => acc + item.total_invested, 0);

  if (total === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>부문별 비중</Text>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>데이터 없음</Text>
        </View>
      </View>
    );
  }

  const pieData = data.map((item) => ({
    value: item.total_invested,
    color: SECTOR_COLORS[item.asset_type],
    label: SECTOR_LABELS[item.asset_type],
  }));

  return (
    <View style={styles.card}>
      <Text style={styles.title}>부문별 비중</Text>

      <View style={styles.content}>
        {/* 파이 차트 */}
        <PieChart
          data={pieData}
          donut
          radius={60}
          innerRadius={40}
          centerLabelComponent={() => (
            <View style={styles.centerLabel}>
              <Text style={styles.centerLabelSub}>총</Text>
              <Text style={styles.centerLabelValue}>
                {data.length}개 부문
              </Text>
            </View>
          )}
        />

        {/* 범례 */}
        <View style={styles.legend}>
          {data.map((item) => {
            const pct = ((item.total_invested / total) * 100).toFixed(1);
            return (
              <View key={item.asset_type} style={styles.legendRow}>
                <View style={styles.legendLeft}>
                  <View
                    style={[
                      styles.legendDot,
                      { backgroundColor: SECTOR_COLORS[item.asset_type] },
                    ]}
                  />
                  <Text style={styles.legendLabel}>{SECTOR_LABELS[item.asset_type]}</Text>
                </View>
                <View style={styles.legendRight}>
                  <Text style={styles.legendPct}>{pct}%</Text>
                  <Text style={styles.legendAmount}>{formatKrw(item.total_invested)}</Text>
                </View>
              </View>
            );
          })}
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
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0b1c30',
    marginBottom: 16,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  centerLabel: {
    alignItems: 'center',
  },
  centerLabelSub: {
    fontSize: 10,
    color: '#434656',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  centerLabelValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0b1c30',
  },
  legend: {
    flex: 1,
    gap: 10,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  legendLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#0b1c30',
  },
  legendRight: {
    alignItems: 'flex-end',
  },
  legendPct: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0b1c30',
  },
  legendAmount: {
    fontSize: 11,
    color: '#434656',
  },
  emptyContainer: {
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: '#737688',
  },
});
