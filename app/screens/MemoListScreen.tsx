/**
 * MemoListScreen.tsx — 메모 목록 화면
 *
 * - 달력형 / 리스트형 전환 토글
 * - 필터 (종목/매매이벤트/뉴스/섹터/연결 없음, AND 결합)
 * - 렌더링 최적화: initialLoading(초기), refreshing(당김 새로고침) 분리
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  ScrollView,
} from 'react-native';
import { useMemos } from '../hooks/useMemos';
import { CalendarView } from '../components/CalendarView';
import { MemoCard } from '../components/MemoCard';
import { MemoFilter } from '../components/MemoFilter';
import {
  MemoItem,
  MemoFilterState,
  DEFAULT_FILTER_STATE,
  ListMemosParams,
} from '../types/memo';
import { Stock } from '../types/memo';
import { Sector } from '../types/sector';
import { searchStocks } from '../services/memo';
import { getSectors } from '../services/sectors';

// ────────────────────────────────────────────
// 뷰 타입
// ────────────────────────────────────────────

type ViewMode = 'calendar' | 'list';

// ────────────────────────────────────────────
// 날짜 유틸
// ────────────────────────────────────────────

function getMonthRange(year: number, month: number): { from: string; to: string } {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const lastDay = new Date(year, month, 0).getDate();
  return {
    from: `${year}-${pad(month)}-01`,
    to: `${year}-${pad(month)}-${lastDay}`,
  };
}

function filterToParams(filter: MemoFilterState): ListMemosParams {
  return {
    p_stock_ids: filter.stockIds.length > 0 ? filter.stockIds : null,
    p_trade_events_only: filter.tradeEventsOnly,
    p_news_only: filter.newsOnly,
    p_sector_ids: filter.sectorIds.length > 0 ? filter.sectorIds : null,
    p_no_links: filter.noLinks,
  };
}

// ────────────────────────────────────────────
// Props
// ────────────────────────────────────────────

interface MemoListScreenProps {
  onMemoPress: (memoId: string) => void;
  onAddMemo: () => void;
}

// ────────────────────────────────────────────
// 종목 검색 모달
// ────────────────────────────────────────────

interface StockPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (stock: Stock) => void;
}

function StockPickerModal({ visible, onClose, onSelect }: StockPickerModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Stock[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setResults([]);
    }
  }, [visible]);

  useEffect(() => {
    if (query.trim().length < 1) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await searchStocks(query.trim());
        setResults(data);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={pickerStyles.container}>
        <View style={pickerStyles.header}>
          <Text style={pickerStyles.title}>종목 선택</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={pickerStyles.closeText}>닫기</Text>
          </TouchableOpacity>
        </View>
        <View style={pickerStyles.searchRow}>
          <TextInput
            style={pickerStyles.input}
            placeholder="종목명 또는 티커 검색"
            placeholderTextColor="#737688"
            value={query}
            onChangeText={setQuery}
            autoFocus
            autoCorrect={false}
          />
        </View>
        {searching && (
          <ActivityIndicator style={{ marginTop: 20 }} color="#003ec7" />
        )}
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={pickerStyles.resultItem}
              onPress={() => {
                onSelect(item);
                onClose();
              }}
            >
              <Text style={pickerStyles.ticker}>{item.ticker}</Text>
              <Text style={pickerStyles.name}>{item.name}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            query.length > 0 && !searching ? (
              <Text style={pickerStyles.emptyText}>검색 결과가 없습니다</Text>
            ) : null
          }
        />
      </SafeAreaView>
    </Modal>
  );
}

const pickerStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9ff' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  title: { fontSize: 18, fontWeight: '700', color: '#0b1c30' },
  closeText: { fontSize: 14, color: '#003ec7', fontWeight: '600' },
  searchRow: { paddingHorizontal: 20, marginBottom: 8 },
  input: {
    backgroundColor: '#dce9ff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: '#0b1c30',
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e5eeff',
    gap: 12,
  },
  ticker: { fontSize: 13, fontWeight: '700', color: '#003ec7', width: 60 },
  name: { fontSize: 14, color: '#0b1c30', flex: 1 },
  emptyText: { textAlign: 'center', marginTop: 40, color: '#737688', fontSize: 14 },
});

// ────────────────────────────────────────────
// MemoListScreen
// ────────────────────────────────────────────

export function MemoListScreen({ onMemoPress, onAddMemo }: MemoListScreenProps) {
  const today = new Date();
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth() + 1);
  const [filter, setFilter] = useState<MemoFilterState>(DEFAULT_FILTER_STATE);
  // L1 섹터 목록
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [stockPickerVisible, setStockPickerVisible] = useState(false);

  const { allMemos, calendarSummary, initialLoading, refreshing, loadingMore, error, fetch, refresh, loadMore, hasMore } = useMemos();

  // filter 최신값을 ref로 추적 (handleFilterChange 의존성 최소화)
  const filterRef = useRef(filter);
  filterRef.current = filter;

  // L2 섹터 맵 (key: L1 sector id → value: L2 sectors)
  // L1 칩 탭 시 해당 L1의 L2를 지연 로딩
  const [l2SectorMap, setL2SectorMap] = useState<Map<number, Sector[]>>(new Map());
  const loadedL1IdsRef = useRef<Set<number>>(new Set());

  // 초기 로드: L1 섹터 목록만 가져옴
  useEffect(() => {
    fetch(filterToParams(filter));
    getSectors({ level: 1 }).then(setSectors).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetch]);

  // 달력형: 월 변경 시 데이터 재조회
  useEffect(() => {
    if (viewMode === 'calendar') {
      const { from, to } = getMonthRange(calYear, calMonth);
      fetch({ ...filterToParams(filterRef.current), p_from: from, p_to: to });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calYear, calMonth, viewMode, fetch]);

  const handleFilterChange = useCallback(
    (updated: Partial<MemoFilterState>) => {
      const newFilter = { ...filterRef.current, ...updated };
      setFilter(newFilter);
      const params = filterToParams(newFilter);
      if (viewMode === 'calendar') {
        const { from, to } = getMonthRange(calYear, calMonth);
        fetch({ ...params, p_from: from, p_to: to });
      } else {
        fetch(params);
      }
    },
    [viewMode, calYear, calMonth, fetch],
  );

  const handleViewModeToggle = useCallback(() => {
    const next: ViewMode = viewMode === 'list' ? 'calendar' : 'list';
    setViewMode(next);
    const params = filterToParams(filterRef.current);
    if (next === 'calendar') {
      const { from, to } = getMonthRange(calYear, calMonth);
      fetch({ ...params, p_from: from, p_to: to });
    } else {
      fetch(params);
    }
  }, [viewMode, calYear, calMonth, fetch]);

  const handlePrevMonth = useCallback(() => {
    if (calMonth === 1) {
      setCalYear((y) => y - 1);
      setCalMonth(12);
    } else {
      setCalMonth((m) => m - 1);
    }
  }, [calMonth]);

  const handleNextMonth = useCallback(() => {
    if (calMonth === 12) {
      setCalYear((y) => y + 1);
      setCalMonth(1);
    } else {
      setCalMonth((m) => m + 1);
    }
  }, [calMonth]);

  const handleDayPress = useCallback(
    (date: string) => {
      // 해당 날의 메모가 있으면 리스트 뷰로 전환 후 해당 날짜 필터
      const summary = calendarSummary.get(date);
      if (summary && summary.memoIds.length > 0) {
        setViewMode('list');
        // 날짜 기반 필터는 서버 파라미터로 처리
        fetch({ ...filterToParams(filterRef.current), p_from: date, p_to: date });
      }
    },
    [calendarSummary, fetch],
  );

  const handleMemoPress = useCallback(
    (memo: MemoItem) => {
      onMemoPress(memo.id);
    },
    [onMemoPress],
  );

  const handleStockSelect = useCallback(
    (stock: Stock) => {
      const current = filterRef.current;
      // 이미 선택된 종목이면 무시 (중복 추가 방지)
      if (current.stockIds.includes(stock.id)) return;
      const newIds = [...current.stockIds, stock.id];
      const newNames = [...current.stockNames, stock.name];
      handleFilterChange({ stockIds: newIds, stockNames: newNames, noLinks: false });
    },
    [handleFilterChange],
  );

  const handleStockPickerOpen = useCallback(() => setStockPickerVisible(true), []);

  // L1 칩 펼침 시 해당 L1의 L2 목록을 지연 로딩
  // MemoFilter에서 expandedL1Id가 변경될 때 호출되는 콜백 대신,
  // l2SectorMap을 MemoListScreen에서 관리하고 MemoFilter에 전달한다.
  // L1 칩의 펼침 버튼이 눌릴 때 트리거: MemoFilter 내에서 expandedL1Id 변경 시
  // MemoFilter는 expandedL1Id를 내부 상태로 관리하지만, L2 로딩은 부모에서 처리할 수 없음.
  // 따라서 L2 지연 로딩을 위해 onExpandL1 콜백을 MemoFilter에 추가 전달한다.
  const handleExpandL1 = useCallback(
    async (l1SectorId: number | null) => {
      if (l1SectorId === null) return;
      // 이미 로딩된 L1은 재요청하지 않음
      if (loadedL1IdsRef.current.has(l1SectorId)) return;
      try {
        const l2List = await getSectors({ level: 2, parent_id: l1SectorId });
        loadedL1IdsRef.current.add(l1SectorId);
        setL2SectorMap((prev) => {
          const next = new Map(prev);
          next.set(l1SectorId, l2List);
          return next;
        });
      } catch {
        // L2 로딩 실패는 무시 (L1 선택만으로도 필터 가능)
      }
    },
    [],
  );

  const renderMemoItem = useCallback(
    ({ item }: { item: MemoItem }) => (
      <MemoCard memo={item} onPress={handleMemoPress} />
    ),
    [handleMemoPress],
  );

  const renderFooter = useCallback(() => {
    if (!loadingMore) return null;
    return (
      <View style={styles.loadMoreIndicator}>
        <ActivityIndicator size="small" color="#003ec7" />
      </View>
    );
  }, [loadingMore]);

  const renderEmpty = useCallback(() => {
    if (initialLoading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>메모가 없습니다</Text>
        <Text style={styles.emptySubText}>우하단 + 버튼을 눌러 메모를 작성하세요</Text>
      </View>
    );
  }, [initialLoading]);

  // ── 초기 로딩 (데이터가 한 번도 없는 최초 마운트 시에만 전체 화면 스피너) ──
  if (initialLoading && allMemos.length === 0) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#003ec7" />
        <Text style={styles.loadingText}>메모 불러오는 중...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* 헤더 */}
      <View style={styles.topBar}>
        <Text style={styles.title}>투자 일지</Text>
        <TouchableOpacity style={styles.viewToggleBtn} onPress={handleViewModeToggle}>
          <Text style={styles.viewToggleText}>
            {viewMode === 'list' ? '달력형' : '리스트형'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* 필터 */}
      <MemoFilter
        filter={filter}
        l1Sectors={sectors}
        l2SectorMap={l2SectorMap}
        onFilterChange={handleFilterChange}
        onStockPickerOpen={handleStockPickerOpen}
        onExpandL1={handleExpandL1}
      />

      {/* 에러 배너 */}
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{error}</Text>
          <TouchableOpacity onPress={refresh}>
            <Text style={styles.errorBannerRetry}>다시 시도</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 달력형 뷰 */}
      {viewMode === 'calendar' && (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.calendarScrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#003ec7" />
          }
        >
          <CalendarView
            year={calYear}
            month={calMonth}
            calendarSummary={calendarSummary}
            onDayPress={handleDayPress}
            onPrevMonth={handlePrevMonth}
            onNextMonth={handleNextMonth}
          />
          <View style={styles.fabSpacer} />
        </ScrollView>
      )}

      {/* 리스트형 뷰 */}
      {viewMode === 'list' && (
        <FlatList
          data={allMemos}
          keyExtractor={(item) => item.id}
          renderItem={renderMemoItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#003ec7" />
          }
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={renderFooter}
          onEndReached={hasMore ? loadMore : undefined}
          onEndReachedThreshold={0.3}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={onAddMemo} activeOpacity={0.85}>
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>

      {/* 종목 검색 모달 */}
      <StockPickerModal
        visible={stockPickerVisible}
        onClose={() => setStockPickerVisible(false)}
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0b1c30',
  },
  viewToggleBtn: {
    backgroundColor: '#dce9ff',
    borderRadius: 9999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  viewToggleText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#003ec7',
  },
  errorBanner: {
    marginHorizontal: 20,
    marginBottom: 8,
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
  scroll: {
    flex: 1,
  },
  calendarScrollContent: {
    padding: 16,
    gap: 16,
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  separator: {
    height: 10,
  },
  emptyContainer: {
    paddingTop: 60,
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
  loadMoreIndicator: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  fabSpacer: {
    height: 80,
  },
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
