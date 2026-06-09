/**
 * CategoryStocksScreen.tsx — 카테고리 소속 종목 편집 화면
 *
 * 이슈 024: 사용자 카테고리 CRUD + 종목 관리
 *
 * 기능:
 * - 카테고리에 속한 종목 목록 표시
 * - + 종목 추가 버튼 → StockSearchModal 열기
 * - 종목 행 X 버튼 → 제거 확인 없이 즉시 제거
 *   (이미 목록에서 보이는 상태에서 X를 누르는 흐름이므로 Alert 불필요)
 *
 * 렌더링 최적화:
 * - StockRow를 React.memo로 분리
 * - useCallback으로 핸들러 참조 안정화
 * - StockSearchModal에 excludeIds를 useMemo로 계산
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useCategoryStocks } from '../hooks/useCategoryStocks';
import { UserCategoryStock } from '../types/category';
import { StockSearchModal, SelectedStockInfo } from '../components/StockSearchModal';

// ────────────────────────────────────────────
// Props
// ────────────────────────────────────────────

interface CategoryStocksScreenProps {
  categoryId: string;
  categoryName: string;
  onBack: () => void;
}

// ────────────────────────────────────────────
// StockRow
// ────────────────────────────────────────────

interface StockRowProps {
  item: UserCategoryStock;
  onRemove: (stockId: string) => void;
  removing: boolean;
}

const StockRow = React.memo(function StockRow({ item, onRemove, removing }: StockRowProps) {
  const handleRemove = useCallback(() => onRemove(item.stock_id), [item.stock_id, onRemove]);

  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Text style={styles.ticker}>{item.stocks.ticker}</Text>
        <View style={styles.marketBadge}>
          <Text style={styles.marketText}>{item.stocks.market}</Text>
        </View>
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.stockName} numberOfLines={1}>
          {item.stocks.name}
        </Text>
      </View>
      <TouchableOpacity
        style={styles.removeBtn}
        onPress={handleRemove}
        disabled={removing}
        activeOpacity={0.7}
      >
        <Text style={styles.removeBtnText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
});

// ────────────────────────────────────────────
// CategoryStocksScreen
// ────────────────────────────────────────────

export function CategoryStocksScreen({
  categoryId,
  categoryName,
  onBack,
}: CategoryStocksScreenProps) {
  const { stocks, initialLoading, mutating, error, addStock, removeStock } =
    useCategoryStocks(categoryId);

  const [searchModalVisible, setSearchModalVisible] = useState(false);

  // 이미 추가된 종목 ID 목록 (StockSearchModal 중복 제외용)
  const excludeIds = useMemo(() => stocks.map((s) => s.stock_id), [stocks]);

  const handleOpenSearch = useCallback(() => {
    setSearchModalVisible(true);
  }, []);

  const handleCloseSearch = useCallback(() => {
    setSearchModalVisible(false);
  }, []);

  const handleStockSelect = useCallback(
    async (stock: SelectedStockInfo) => {
      setSearchModalVisible(false);
      try {
        await addStock(stock.id);
      } catch (e) {
        const msg = e instanceof Error ? e.message : '종목 추가 실패';
        const displayMsg = msg.includes('400') || msg.includes('23505')
          ? `'${stock.name}'은 이미 이 카테고리에 포함되어 있습니다`
          : msg;
        Alert.alert('오류', displayMsg);
      }
    },
    [addStock],
  );

  const handleRemoveStock = useCallback(
    async (stockId: string) => {
      try {
        await removeStock(stockId);
      } catch (e) {
        const msg = e instanceof Error ? e.message : '종목 제거 실패';
        Alert.alert('오류', msg);
      }
    },
    [removeStock],
  );

  const renderItem = useCallback(
    ({ item }: { item: UserCategoryStock }) => (
      <StockRow item={item} onRemove={handleRemoveStock} removing={mutating} />
    ),
    [handleRemoveStock, mutating],
  );

  const renderEmptyList = useCallback(() => {
    if (initialLoading) return null;
    return (
      <View style={styles.emptyBox}>
        <Text style={styles.emptyText}>아직 종목이 없습니다</Text>
        <Text style={styles.emptySubText}>아래 버튼으로 종목을 추가해 보세요</Text>
      </View>
    );
  }, [initialLoading]);

  if (initialLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <Text style={styles.backText}>{'< 카테고리'}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {categoryName}
          </Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#003ec7" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>{'< 카테고리'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {categoryName}
        </Text>
        <View style={styles.headerRight} />
      </View>

      {/* 오류 배너 */}
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      )}

      {/* 종목 수 요약 */}
      <View style={styles.summaryRow}>
        <Text style={styles.summaryText}>
          {stocks.length > 0 ? `종목 ${stocks.length}개` : ''}
        </Text>
        {mutating && (
          <ActivityIndicator size="small" color="#003ec7" style={styles.mutatingSpinner} />
        )}
      </View>

      {/* 종목 목록 */}
      <FlatList
        data={stocks}
        keyExtractor={(item) => item.stock_id}
        renderItem={renderItem}
        ListEmptyComponent={renderEmptyList}
        contentContainerStyle={
          stocks.length === 0 ? styles.flatListEmptyContainer : styles.flatListContainer
        }
        showsVerticalScrollIndicator={false}
      />

      {/* + 종목 추가 버튼 */}
      <View style={styles.addButtonRow}>
        <TouchableOpacity
          style={styles.addButton}
          onPress={handleOpenSearch}
          activeOpacity={0.8}
        >
          <Text style={styles.addButtonText}>+ 종목 추가</Text>
        </TouchableOpacity>
      </View>

      {/* 종목 검색 모달 */}
      <StockSearchModal
        visible={searchModalVisible}
        excludeIds={excludeIds}
        onClose={handleCloseSearch}
        onSelect={handleStockSelect}
      />
    </SafeAreaView>
  );
}

// ────────────────────────────────────────────
// 스타일
// ────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f8f9ff',
  },
  // 헤더
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5eeff',
  },
  backBtn: {
    minWidth: 80,
  },
  backText: {
    fontSize: 14,
    color: '#003ec7',
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0b1c30',
    flex: 1,
    textAlign: 'center',
  },
  headerRight: {
    minWidth: 80,
  },
  // 로딩
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 오류 배너
  errorBanner: {
    marginHorizontal: 20,
    marginTop: 12,
    padding: 12,
    backgroundColor: '#ffdad6',
    borderRadius: 10,
  },
  errorBannerText: {
    fontSize: 13,
    color: '#93000a',
  },
  // 요약 행
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  summaryText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#737688',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  mutatingSpinner: {
    marginLeft: 8,
  },
  // FlatList 컨테이너
  flatListContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 8,
  },
  flatListEmptyContainer: {
    flexGrow: 1,
  },
  // 빈 상태
  emptyBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingBottom: 80,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#434656',
  },
  emptySubText: {
    fontSize: 13,
    color: '#737688',
    textAlign: 'center',
    lineHeight: 20,
  },
  // 종목 행
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  rowLeft: {
    alignItems: 'flex-start',
    gap: 4,
    minWidth: 64,
  },
  ticker: {
    fontSize: 13,
    fontWeight: '700',
    color: '#003ec7',
  },
  marketBadge: {
    backgroundColor: '#dce9ff',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  marketText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#003ec7',
  },
  rowRight: {
    flex: 1,
  },
  stockName: {
    fontSize: 14,
    color: '#0b1c30',
    fontWeight: '500',
  },
  removeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ffdad6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#93000a',
  },
  // + 종목 추가 버튼
  addButtonRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5eeff',
  },
  addButton: {
    backgroundColor: '#003ec7',
    borderRadius: 9999,
    paddingVertical: 14,
    alignItems: 'center',
  },
  addButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
});
