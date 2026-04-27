import React, { useState, useCallback, useMemo } from 'react';
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
import { KpiCardSection } from '../components/KpiCardSection';
import { AssetHistoryChart } from '../components/AssetHistoryChart';
import { HoldingCard } from '../components/HoldingCard';
import { AccountEventBottomSheet } from '../components/AccountEventBottomSheet';
import { AssetType, Period, HoldingCardData, KpiCardData } from '../types/dashboard';

// ────────────────────────────────────────────
// 상수
// ────────────────────────────────────────────

const GROUP_LABELS: Record<AssetType, string> = {
  korean_stock: '한국주식',
  us_stock: '미국주식',
  crypto: '코인',
};

const GROUP_ORDER: AssetType[] = ['korean_stock', 'us_stock', 'crypto'];

// ────────────────────────────────────────────
// 유틸
// ────────────────────────────────────────────

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

// ────────────────────────────────────────────
// 부문 필터에 따른 KPI 조정 (클라이언트 사이드)
// 2차 행 예수금은 항상 전체 표시, 배당/수수료/세금은 부문 필터 연동 불가
// (get_kpi_summary가 부문별로 집계하므로 표시 데이터는 전체 KPI 기준으로 유지)
// ────────────────────────────────────────────

// ────────────────────────────────────────────
// DashboardScreen
// ────────────────────────────────────────────

export function DashboardScreen() {
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [selectedPeriod, setSelectedPeriod] = useState<Period>('month');
  const [sheetVisible, setSheetVisible] = useState(false);

  const {
    kpi,
    holdings: allHoldings,
    snapshots,
    markers,
    exchangeRate,
    initialLoading,
    refreshing,
    historyLoading,
    error,
    refetch,
    fetchHistory,
  } = useDashboard();

  // 탭 필터는 클라이언트 사이드로 처리 — 네트워크 재호출 없음
  const filteredHoldings = useMemo(
    () =>
      filterTab === 'all'
        ? allHoldings
        : allHoldings.filter((h) => h.asset_type === filterTab),
    [allHoldings, filterTab],
  );

  const grouped = useMemo(() => groupHoldings(filteredHoldings), [filteredHoldings]);

  const handleFilterChange = useCallback(
    (tab: FilterTab) => {
      setFilterTab(tab);
      // 그래프는 서버 집계 필요 → 히스토리만 재조회 (기존 콘텐츠 유지)
      const newAssetType = tab === 'all' ? null : (tab as AssetType);
      fetchHistory(selectedPeriod, newAssetType);
    },
    [fetchHistory, selectedPeriod],
  );

  const handlePeriodChange = useCallback(
    (period: Period) => {
      setSelectedPeriod(period);
      const assetType = filterTab === 'all' ? null : (filterTab as AssetType);
      fetchHistory(period, assetType);
    },
    [fetchHistory, filterTab],
  );

  const handleEventSuccess = useCallback(() => {
    setSheetVisible(false);
    refetch();
  }, [refetch]);

  // ── 초기 로딩 화면 (마운트 최초 1회만) ──
  if (initialLoading) {
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
          <Text style={styles.topBarSub}>PRECISION LEDGER</Text>
          <Text style={styles.totalAmount}>
            {formatKrwShort(kpi.totalValueKrw)}
          </Text>
          {exchangeRate && (
            <Text style={styles.rateCachedNote}>
              USD/KRW {exchangeRate.rate.toLocaleString('ko-KR')}원
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
            refreshing={refreshing}
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

        {/* KPI 카드 섹션 */}
        <View style={styles.section}>
          <KpiCardSection data={kpi} />
        </View>

        {/* 자산 히스토리 그래프 */}
        <View style={styles.section}>
          <AssetHistoryChart
            snapshots={snapshots}
            markers={markers}
            loading={historyLoading}
            showCashLine={filterTab === 'all'}
            onPeriodChange={handlePeriodChange}
          />
        </View>

        {/* 종목 카드 리스트 */}
        <View style={styles.holdingsSection}>
          <Text style={styles.holdingsTitle}>보유 종목</Text>

          {filteredHoldings.length === 0 ? (
            <View style={styles.emptyHoldings}>
              <Text style={styles.emptyText}>보유 종목이 없습니다</Text>
              <Text style={styles.emptySubText}>
                우하단 + 버튼을 눌러 계정 이벤트를 등록하세요
              </Text>
            </View>
          ) : (
            grouped.map((group) => (
              <View key={group.type} style={styles.groupBlock}>
                <View style={styles.groupHeader}>
                  <Text style={styles.groupLabel}>{GROUP_LABELS[group.type]}</Text>
                  <Text style={styles.groupCount}>{group.items.length}개 종목</Text>
                </View>
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

      {/* 계정 이벤트 바텀시트 */}
      <AccountEventBottomSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        onSuccess={handleEventSuccess}
      />
    </SafeAreaView>
  );
}

// ────────────────────────────────────────────
// 포맷 유틸 (화면 내부용)
// ────────────────────────────────────────────

function formatKrwShort(value: number): string {
  if (Math.abs(value) >= 100_000_000) {
    return `${(value / 100_000_000).toFixed(2)}억원`;
  }
  if (Math.abs(value) >= 10_000) {
    return `${Math.round(value / 10_000).toLocaleString('ko-KR')}만원`;
  }
  return `${Math.round(value).toLocaleString('ko-KR')}원`;
}

// ────────────────────────────────────────────
// 스타일
// ────────────────────────────────────────────

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
  },
  topBarSub: {
    fontSize: 10,
    fontWeight: '700',
    color: '#434656',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  totalAmount: {
    fontSize: 30,
    fontWeight: '800',
    color: '#0b1c30',
    letterSpacing: -0.5,
    marginTop: 4,
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
