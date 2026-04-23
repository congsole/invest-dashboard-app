import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { useDashboard } from '../hooks/useDashboard';
import { SectorFilterTabs, FilterTab } from '../components/SectorFilterTabs';
import { AssetHistoryChart } from '../components/AssetHistoryChart';
import { SectorAllocationPie } from '../components/SectorAllocationPie';
import { HoldingCard } from '../components/HoldingCard';
import { NewTradeEventSheet } from '../components/NewTradeEventSheet';
import { AssetType, Period, HoldingCardData } from '../types/dashboard';

// ────────────────────────────────────────────
// 부문별 그룹 헤더 레이블
// ────────────────────────────────────────────
const GROUP_LABELS: Record<AssetType, string> = {
  korean_stock: '한국주식',
  us_stock: '미국주식',
  crypto: '코인',
};

const GROUP_ORDER: AssetType[] = ['korean_stock', 'us_stock', 'crypto'];

function groupHoldings(
  holdings: HoldingCardData[],
): Array<{ type: AssetType; items: HoldingCardData[] }> {
  const map = new Map<AssetType, HoldingCardData[]>();
  for (const h of holdings) {
    if (!map.has(h.asset_type)) map.set(h.asset_type, []);
    map.get(h.asset_type)!.push(h);
  }
  return GROUP_ORDER.filter((t) => map.has(t)).map((t) => ({
    type: t,
    items: map.get(t)!,
  }));
}

function formatKrwShort(value: number): string {
  if (value >= 100000000) return `${(value / 100000000).toFixed(2)}억원`;
  if (value >= 10000) return `${Math.round(value / 10000).toLocaleString('ko-KR')}만원`;
  return `${Math.round(value).toLocaleString('ko-KR')}원`;
}

// ────────────────────────────────────────────
// DashboardScreen
// ────────────────────────────────────────────

export function DashboardScreen() {
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [sheetVisible, setSheetVisible] = useState(false);

  // FilterTab → AssetType | null 변환
  const assetType: AssetType | null = filterTab === 'all' ? null : filterTab;

  const {
    holdings,
    assetHistory,
    sectorAllocation,
    exchangeRate,
    totalAssetKrw,
    loading,
    historyLoading,
    error,
    refetch,
    fetchHistory,
  } = useDashboard(assetType);

  const handleFilterChange = useCallback((tab: FilterTab) => {
    setFilterTab(tab);
  }, []);

  const handlePeriodChange = useCallback(
    (period: Period) => {
      fetchHistory(period);
    },
    [fetchHistory],
  );

  const handleTradeSuccess = useCallback(() => {
    setSheetVisible(false);
    refetch();
  }, [refetch]);

  const grouped = groupHoldings(holdings);

  // ── 로딩 화면 ──
  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#003ec7" />
        <Text style={styles.loadingText}>포트폴리오 불러오는 중...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* 상단 헤더 */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.topBarSub}>TOTAL NET WORTH</Text>
          <View style={styles.totalRow}>
            <Text style={styles.totalAmount}>
              {formatKrwShort(totalAssetKrw)}
            </Text>
          </View>
          {exchangeRate?.is_cached && (
            <Text style={styles.rateCachedNote}>
              환율 {exchangeRate.rate.toLocaleString('ko-KR')}원 기준
              {exchangeRate.is_cached ? ' (캐시)' : ''}
            </Text>
          )}
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={refetch}
            tintColor="#003ec7"
          />
        }
      >
        {/* 에러 배너 */}
        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{error}</Text>
            <TouchableOpacity onPress={refetch}>
              <Text style={styles.errorBannerRetry}>다시 시도</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 부문 필터 탭 */}
        <View style={styles.section}>
          <SectorFilterTabs selected={filterTab} onSelect={handleFilterChange} />
        </View>

        {/* 자산 히스토리 그래프 */}
        <View style={styles.section}>
          <AssetHistoryChart
            data={assetHistory}
            loading={historyLoading}
            onPeriodChange={handlePeriodChange}
            exchangeRate={exchangeRate?.rate ?? 1380}
          />
        </View>

        {/* 부문별 비중 파이 차트 (전체 탭일 때만 표시) */}
        {filterTab === 'all' && sectorAllocation.length > 0 && (
          <View style={styles.section}>
            <SectorAllocationPie data={sectorAllocation} />
          </View>
        )}

        {/* 종목 카드 리스트 */}
        <View style={styles.holdingsSection}>
          <Text style={styles.holdingsTitle}>보유 종목</Text>

          {holdings.length === 0 ? (
            <View style={styles.emptyHoldings}>
              <Text style={styles.emptyText}>보유 종목이 없습니다</Text>
              <Text style={styles.emptySubText}>
                우하단 + 버튼을 눌러 매매 이벤트를 등록하세요
              </Text>
            </View>
          ) : (
            grouped.map((group) => (
              <View key={group.type} style={styles.groupBlock}>
                {/* 그룹 헤더 */}
                <View style={styles.groupHeader}>
                  <Text style={styles.groupLabel}>
                    {GROUP_LABELS[group.type]}
                  </Text>
                  <Text style={styles.groupCount}>
                    {group.items.length}개 종목
                  </Text>
                </View>

                {/* 종목 카드 목록 */}
                {group.items.map((item) => (
                  <View key={item.ticker} style={styles.cardWrapper}>
                    <HoldingCard data={item} />
                  </View>
                ))}
              </View>
            ))
          )}
        </View>

        {/* FAB 영역 여백 */}
        <View style={styles.fabSpacer} />
      </ScrollView>

      {/* FAB 버튼 */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setSheetVisible(true)}
        activeOpacity={0.85}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>

      {/* 매매 이벤트 바텀시트 */}
      <NewTradeEventSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        onSuccess={handleTradeSuccess}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f8f9ff',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#f8f9ff',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#434656',
  },
  // ── 상단 헤더 ──
  topBar: {
    backgroundColor: '#f8f9ff',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: 0,
  },
  topBarSub: {
    fontSize: 10,
    fontWeight: '700',
    color: '#434656',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginTop: 4,
  },
  totalAmount: {
    fontSize: 32,
    fontWeight: '800',
    color: '#0b1c30',
    letterSpacing: -0.5,
  },
  rateCachedNote: {
    fontSize: 11,
    color: '#737688',
    marginTop: 2,
  },
  // ── 스크롤 ──
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  // ── 에러 배너 ──
  errorBanner: {
    marginHorizontal: 20,
    marginBottom: 12,
    backgroundColor: '#ffdad6',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  errorBannerText: {
    fontSize: 13,
    color: '#93000a',
    flex: 1,
  },
  errorBannerRetry: {
    fontSize: 13,
    color: '#ba1a1a',
    fontWeight: '700',
    marginLeft: 8,
  },
  // ── 종목 리스트 ──
  holdingsSection: {
    paddingHorizontal: 20,
    marginTop: 4,
  },
  holdingsTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0b1c30',
    marginBottom: 16,
  },
  emptyHoldings: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingVertical: 40,
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#434656',
  },
  emptySubText: {
    fontSize: 13,
    color: '#737688',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  groupBlock: {
    marginBottom: 24,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  groupLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#434656',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  groupCount: {
    fontSize: 11,
    color: '#737688',
  },
  cardWrapper: {
    marginBottom: 10,
  },
  fabSpacer: {
    height: 80,
  },
  // ── FAB ──
  fab: {
    position: 'absolute',
    bottom: 32,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#003ec7',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#003ec7',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  fabIcon: {
    fontSize: 28,
    color: '#ffffff',
    fontWeight: '300',
    lineHeight: 32,
  },
});
