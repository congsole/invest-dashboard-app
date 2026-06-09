/**
 * MemoListScreen.tsx — 메모 목록 화면
 *
 * - 달력형 / 리스트형 전환 토글
 * - 필터 (종목/매매이벤트/뉴스/섹터/연결 없음, AND 결합)
 * - 렌더링 최적화:
 *   - initialLoading(초기), refreshing(당김 새로고침) 분리
 *   - 필터 상태를 MemoFilterSection으로 분리 → 필터 변경 시 FlatList/CalendarView 리렌더링 방지
 *   - viewMode/calYear/calMonth는 ref로 MemoFilterSection에 전달 (안정적 참조)
 */

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {useMemos} from '../hooks/useMemos';
import {useCategories} from '../hooks/useCategories';
import {CalendarView} from '../components/CalendarView';
import {MemoCard} from '../components/MemoCard';
import {MemoFilter} from '../components/MemoFilter';
import {DEFAULT_FILTER_STATE, ListMemosParams, MemoFilterState, MemoItem, Stock,} from '../types/memo';
import {Sector} from '../types/sector';
import {searchStocks} from '../services/memo';
import {getSectors} from '../services/sectors';

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
    // [025] 카테고리 필터 추가
    p_category_ids: filter.categoryIds.length > 0 ? filter.categoryIds : null,
    p_no_links: filter.noLinks,
  };
}

// ────────────────────────────────────────────
// Props
// ────────────────────────────────────────────

interface MemoListScreenProps {
  onMemoPress: (memoId: string) => void;
  onAddMemo: () => void;
  /** [025] 카테고리 목록 로드용 userId */
  userId: string;
  /** [025] 카테고리 관리 화면으로 이동 */
  onCategoryManagePress?: () => void;
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
// MemoFilterSection — 필터 상태를 소유하는 컴포넌트
// 필터 변경이 MemoListScreen 리렌더링을 유발하지 않도록 격리
// ────────────────────────────────────────────

interface MemoFilterSectionProps {
  /** 부모가 소유하는 filter ref — 여기서 쓰고 부모가 읽음 */
  filterRef: React.MutableRefObject<MemoFilterState>;
  fetchMemos: (params: ListMemosParams) => Promise<void>;
  viewModeRef: React.MutableRefObject<ViewMode>;
  calYearRef: React.MutableRefObject<number>;
  calMonthRef: React.MutableRefObject<number>;
  /** [025] */
  userId: string;
  onCategoryManagePress?: () => void;
}

const MemoFilterSection = React.memo(function MemoFilterSection({
  filterRef,
  fetchMemos,
  viewModeRef,
  calYearRef,
  calMonthRef,
  userId,
  onCategoryManagePress,
}: MemoFilterSectionProps) {
  const [filter, setFilter] = useState<MemoFilterState>(DEFAULT_FILTER_STATE);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [l2SectorMap, setL2SectorMap] = useState<Map<number, Sector[]>>(new Map());
  const [stockPickerVisible, setStockPickerVisible] = useState(false);
  const loadedL1IdsRef = useRef<Set<number>>(new Set());
  // [025] 카테고리 목록
  const { categories } = useCategories(userId);

  // filterRef 동기화 — 부모(MemoListScreen)가 현재 필터를 읽을 수 있도록
  useEffect(() => {
    filterRef.current = filter;
  }, [filter, filterRef]);

  // L1 섹터 목록 로드
  useEffect(() => {
    getSectors({ level: 1 }).then(setSectors).catch(() => {});
  }, []);

  // fetch를 현재 필터 + 뷰모드에 맞게 호출하는 헬퍼
  const fetchWithFilter = useCallback(
    (filterState: MemoFilterState) => {
      const params = filterToParams(filterState);
      if (viewModeRef.current === 'calendar') {
        const { from, to } = getMonthRange(calYearRef.current, calMonthRef.current);
        fetchMemos({ ...params, p_from: from, p_to: to });
      } else {
        fetchMemos(params);
      }
    },
    [fetchMemos, viewModeRef, calYearRef, calMonthRef],
  );

  const handleFilterChange = useCallback(
    (updated: Partial<MemoFilterState>) => {
      const newFilter = { ...filterRef.current, ...updated };
      filterRef.current = newFilter;
      setFilter(newFilter);
      fetchWithFilter(newFilter);
    },
    [filterRef, fetchWithFilter],
  );

  const handleStockSelect = useCallback(
    (stock: Stock) => {
      const current = filterRef.current;
      if (current.stockIds.includes(stock.id)) return;
      const newIds = [...current.stockIds, stock.id];
      const newNames = [...current.stockNames, stock.name];
      handleFilterChange({ stockIds: newIds, stockNames: newNames, noLinks: false });
    },
    [filterRef, handleFilterChange],
  );

  const handleStockPickerOpen = useCallback(() => setStockPickerVisible(true), []);
  const handleStockPickerClose = useCallback(() => setStockPickerVisible(false), []);

  const handleExpandL1 = useCallback(
    async (l1SectorId: number | null) => {
      if (l1SectorId === null) return;
      if (loadedL1IdsRef.current.has(l1SectorId)) return;
      try {
        const l2List = await getSectors({ level: 2, parent_id: l1SectorId });
        loadedL1IdsRef.current.add(l1SectorId);
        setL2SectorMap((prev) => {
          const next = new Map(prev);
          next.set(l1SectorId, l2List);
          return next;
        });

        // L2 로딩 완료 후: L1이 이미 선택된 상태라면 L2 id들을 sectorIds에 보충 추가
        setFilter((prevFilter) => {
          const isL1Selected = prevFilter.sectorIds.includes(l1SectorId);
          if (!isL1Selected || l2List.length === 0) return prevFilter;

          const existingIds = new Set(prevFilter.sectorIds);
          const idsToAdd = l2List.filter((s) => !existingIds.has(s.id));
          if (idsToAdd.length === 0) return prevFilter;

          const updated = {
            ...prevFilter,
            sectorIds: [...prevFilter.sectorIds, ...idsToAdd.map((s) => s.id)],
            sectorNames: [...prevFilter.sectorNames, ...idsToAdd.map((s) => s.name)],
          };
          filterRef.current = updated;
          return updated;
        });
      } catch {
        // L2 로딩 실패는 무시
      }
    },
    [filterRef],
  );

  return (
    <>
      <MemoFilter
        filter={filter}
        l1Sectors={sectors}
        l2SectorMap={l2SectorMap}
        categories={categories}
        onFilterChange={handleFilterChange}
        onStockPickerOpen={handleStockPickerOpen}
        onExpandL1={handleExpandL1}
        onCategoryManagePress={onCategoryManagePress}
      />
      <StockPickerModal
        visible={stockPickerVisible}
        onClose={handleStockPickerClose}
        onSelect={handleStockSelect}
      />
    </>
  );
});

// ────────────────────────────────────────────
// MemoListScreen
// ────────────────────────────────────────────

const MemoListSeparator = () => <View style={styles.separator} />;

export function MemoListScreen({ onMemoPress, onAddMemo, userId, onCategoryManagePress }: MemoListScreenProps) {
  const today = new Date();
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth() + 1);

  const { allMemos, calendarSummary, initialLoading, refreshing, loadingMore, error, fetch, refresh, loadMore, hasMore } = useMemos();

  // MemoFilterSection과 공유하는 refs (안정적 참조)
  const filterRef = useRef<MemoFilterState>(DEFAULT_FILTER_STATE);
  const viewModeRef = useRef<ViewMode>(viewMode);
  viewModeRef.current = viewMode;
  const calYearRef = useRef(calYear);
  calYearRef.current = calYear;
  const calMonthRef = useRef(calMonth);
  calMonthRef.current = calMonth;

  // 초기 로드
  useEffect(() => {
    fetch(filterToParams(filterRef.current));
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
      const summary = calendarSummary.get(date);
      if (summary && summary.memoIds.length > 0) {
        setViewMode('list');
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

  const keyExtractor = useCallback((item: MemoItem) => item.id, []);

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

      {/* 필터 (자체 상태 소유 — 필터 변경이 MemoListScreen 리렌더링을 유발하지 않음) */}
      <MemoFilterSection
        filterRef={filterRef}
        fetchMemos={fetch}
        viewModeRef={viewModeRef}
        calYearRef={calYearRef}
        calMonthRef={calMonthRef}
        userId={userId}
        onCategoryManagePress={onCategoryManagePress}
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
          keyExtractor={keyExtractor}
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
          ItemSeparatorComponent={MemoListSeparator}
        />
      )}

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={onAddMemo} activeOpacity={0.85}>
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>
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
