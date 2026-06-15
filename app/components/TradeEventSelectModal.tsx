/**
 * TradeEventSelectModal.tsx — 매매이벤트 선택 모달
 *
 * [026] 신규: 메모 작성/편집 화면의 "매매이벤트" 연결용 모달
 *
 * 기능:
 * - 본인의 buy/sell 이벤트 목록 최신순 나열
 * - 상단 종목명·티커 텍스트 검색 (디바운스 300ms)
 * - 기간 필터 (시작일~종료일, 선택)
 * - 복수 선택 → 체크마크 표시 / 중복 차단
 * - 선택 시드: 초기 검색어를 종목명으로 시드 가능 (사용자가 지우면 전체 탐색)
 *
 * CLAUDE.md 렌더링 최적화:
 * - React.memo + useCallback으로 리렌더 방지
 * - initialLoading(초기)/searching(재검색) 분리, 기존 목록 유지
 * - 기간 필터는 클라이언트 사이드 처리 (useTradeEventSearch 내부)
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { AccountEvent } from '../types/accountEvent';
import { useTradeEventSearch } from '../hooks/useTradeEventSearch';

// ────────────────────────────────────────────
// 타입
// ────────────────────────────────────────────

export interface SelectedTradeEvent {
  id: string;
  event_type: 'buy' | 'sell';
  event_date: string;
  ticker: string | null;
  name: string | null;
  quantity: number | null;
  price_per_unit: number | null;
  currency: string;
}

interface TradeEventSelectModalProps {
  visible: boolean;
  /** 이미 선택된 이벤트 ID 목록 (초기값) */
  initialSelectedIds: string[];
  /** 검색어 시드 (연결된 종목명) */
  seedQuery?: string;
  onClose: () => void;
  /** 선택 완료 콜백 — 최종 선택된 이벤트 배열 전달 */
  onConfirm: (events: SelectedTradeEvent[]) => void;
}

// ────────────────────────────────────────────
// 날짜 포맷 유틸
// ────────────────────────────────────────────

function formatEventDate(dateStr: string): string {
  // YYYY-MM-DD → MM/DD
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[1]}/${parts[2]}`;
  }
  return dateStr;
}

function formatPrice(price: number | null, currency: string): string {
  if (price === null) return '-';
  if (currency === 'KRW') {
    return price.toLocaleString('ko-KR') + '원';
  }
  return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + currency;
}

// ────────────────────────────────────────────
// 매매이벤트 아이템 (메모이즈)
// ────────────────────────────────────────────

interface TradeEventItemProps {
  event: AccountEvent;
  isSelected: boolean;
  onPress: (event: AccountEvent) => void;
}

const TradeEventItem = React.memo(function TradeEventItem({
  event,
  isSelected,
  onPress,
}: TradeEventItemProps) {
  const handlePress = useCallback(() => onPress(event), [event, onPress]);

  const isBuy = event.event_type === 'buy';
  const typeColor = isBuy ? '#22C55E' : '#EF4444';
  const typeLabel = isBuy ? '매수' : '매도';

  const quantityStr = event.quantity !== null
    ? `${event.quantity.toLocaleString()}주`
    : '-';
  const priceStr = formatPrice(event.price_per_unit, event.currency);

  return (
    <TouchableOpacity
      style={[styles.eventItem, isSelected && styles.eventItemSelected]}
      onPress={handlePress}
      activeOpacity={0.75}
    >
      {/* 좌측: 날짜 + 타입 */}
      <View style={styles.eventLeft}>
        <Text style={styles.eventDate}>{formatEventDate(event.event_date)}</Text>
        <View style={[styles.typeBadge, { backgroundColor: typeColor + '22' }]}>
          <Text style={[styles.typeLabel, { color: typeColor }]}>{typeLabel}</Text>
        </View>
      </View>

      {/* 중앙: 종목명 + 수량@체결가 */}
      <View style={styles.eventCenter}>
        <Text style={styles.eventName} numberOfLines={1}>
          {event.name ?? event.ticker ?? '-'}
        </Text>
        <Text style={styles.eventDetail} numberOfLines={1}>
          {quantityStr} @ {priceStr}
        </Text>
      </View>

      {/* 우측: 선택 체크 */}
      <View style={[styles.checkCircle, isSelected && styles.checkCircleSelected]}>
        {isSelected && <Text style={styles.checkMark}>✓</Text>}
      </View>
    </TouchableOpacity>
  );
});

// ────────────────────────────────────────────
// 기간 필터 행
// ────────────────────────────────────────────

interface DateRangeRowProps {
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
}

const DateRangeRow = React.memo(function DateRangeRow({
  from,
  to,
  onFromChange,
  onToChange,
}: DateRangeRowProps) {
  return (
    <View style={styles.dateRangeRow}>
      <Text style={styles.dateRangeLabel}>기간</Text>
      <TextInput
        style={styles.dateInput}
        placeholder="YYYY-MM-DD"
        placeholderTextColor="#b0b3c6"
        value={from}
        onChangeText={onFromChange}
        keyboardType="numbers-and-punctuation"
        maxLength={10}
        returnKeyType="next"
      />
      <Text style={styles.dateRangeSeparator}>~</Text>
      <TextInput
        style={styles.dateInput}
        placeholder="YYYY-MM-DD"
        placeholderTextColor="#b0b3c6"
        value={to}
        onChangeText={onToChange}
        keyboardType="numbers-and-punctuation"
        maxLength={10}
        returnKeyType="done"
      />
    </View>
  );
});

// ────────────────────────────────────────────
// TradeEventSelectModal (메인)
// ────────────────────────────────────────────

export function TradeEventSelectModal({
  visible,
  initialSelectedIds,
  seedQuery,
  onClose,
  onConfirm,
}: TradeEventSelectModalProps) {
  // 선택된 이벤트 (id → SelectedTradeEvent 맵)
  const [selectedMap, setSelectedMap] = useState<Record<string, SelectedTradeEvent>>({});

  // 검색 훅 (시드 쿼리로 초기화)
  const {
    filteredEvents,
    initialLoading,
    searching,
    error,
    searchQuery,
    setSearchQuery,
    filterFrom,
    setFilterFrom,
    filterTo,
    setFilterTo,
  } = useTradeEventSearch(seedQuery);

  // 모달이 열릴 때 initialSelectedIds 기반으로 selectedMap 초기화
  // (이미 선택된 이벤트는 filteredEvents에서 찾아야 하므로 useEffect로 처리)
  React.useEffect(() => {
    if (!visible) {
      // 모달 닫힐 때 선택 상태 초기화 (다음 열기에 대비)
      setSelectedMap({});
      return;
    }
    // 모달 열릴 때 initialSelectedIds에 해당하는 이벤트를 filteredEvents에서 복원
    // (filteredEvents가 로드된 뒤 처리됨)
  }, [visible]);

  // filteredEvents가 로드되면 initialSelectedIds 기반으로 selectedMap 초기화
  // 이미 selectedMap이 있으면 덮어쓰지 않음 (사용자가 변경한 경우)
  const isInitialized = React.useRef(false);
  React.useEffect(() => {
    if (!visible) {
      isInitialized.current = false;
      return;
    }
    if (isInitialized.current) return;
    if (initialLoading) return;
    if (filteredEvents.length === 0 && initialSelectedIds.length === 0) {
      isInitialized.current = true;
      return;
    }

    // filteredEvents에서 initialSelectedIds에 해당하는 이벤트 찾아서 선택 맵 구성
    const newMap: Record<string, SelectedTradeEvent> = {};
    for (const event of filteredEvents) {
      if (initialSelectedIds.includes(event.id)) {
        newMap[event.id] = {
          id: event.id,
          event_type: event.event_type as 'buy' | 'sell',
          event_date: event.event_date,
          ticker: event.ticker,
          name: event.name,
          quantity: event.quantity,
          price_per_unit: event.price_per_unit,
          currency: event.currency,
        };
      }
    }
    // initialSelectedIds에 있지만 filteredEvents에 없는 경우 (검색 필터에 걸림)
    // → 선택은 유지해야 하므로 id만 저장 (표시 정보 없이)
    for (const id of initialSelectedIds) {
      if (!newMap[id]) {
        newMap[id] = {
          id,
          event_type: 'buy', // placeholder — 실제 타입은 표시에만 사용
          event_date: '',
          ticker: null,
          name: null,
          quantity: null,
          price_per_unit: null,
          currency: '',
        };
      }
    }

    setSelectedMap(newMap);
    isInitialized.current = true;
  }, [visible, initialLoading, filteredEvents, initialSelectedIds]);

  // 이벤트 선택 토글
  const handleToggle = useCallback((event: AccountEvent) => {
    setSelectedMap((prev) => {
      if (prev[event.id]) {
        const next = { ...prev };
        delete next[event.id];
        return next;
      }
      return {
        ...prev,
        [event.id]: {
          id: event.id,
          event_type: event.event_type as 'buy' | 'sell',
          event_date: event.event_date,
          ticker: event.ticker,
          name: event.name,
          quantity: event.quantity,
          price_per_unit: event.price_per_unit,
          currency: event.currency,
        },
      };
    });
  }, []);

  // 선택된 이벤트 배열
  const selectedList = useMemo(
    () => Object.values(selectedMap),
    [selectedMap],
  );

  const handleConfirm = useCallback(() => {
    onConfirm(selectedList);
    onClose();
  }, [selectedList, onConfirm, onClose]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
  }, [setSearchQuery]);

  // FlatList key extractor
  const keyExtractor = useCallback((item: AccountEvent) => item.id, []);

  // renderItem
  const renderItem = useCallback(
    ({ item }: { item: AccountEvent }) => (
      <TradeEventItem
        event={item}
        isSelected={!!selectedMap[item.id]}
        onPress={handleToggle}
      />
    ),
    [selectedMap, handleToggle],
  );

  const selectedCount = selectedList.length;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safe}>
        {/* 헤더 */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.headerSideBtn}>
            <Text style={styles.headerCancelText}>취소</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>매매이벤트 연결</Text>
          <TouchableOpacity
            onPress={handleConfirm}
            style={styles.headerSideBtn}
            activeOpacity={0.7}
          >
            <Text style={styles.headerConfirmText}>
              완료{selectedCount > 0 ? ` (${selectedCount})` : ''}
            </Text>
          </TouchableOpacity>
        </View>

        {/* 검색 입력 */}
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="종목명 또는 티커 검색"
            placeholderTextColor="#737688"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {searching && (
            <ActivityIndicator size="small" color="#003ec7" style={styles.searchSpinner} />
          )}
          {!searching && searchQuery.length > 0 && (
            <TouchableOpacity style={styles.clearBtn} onPress={handleClearSearch} activeOpacity={0.7}>
              <Text style={styles.clearBtnText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* 기간 필터 */}
        <DateRangeRow
          from={filterFrom}
          to={filterTo}
          onFromChange={setFilterFrom}
          onToChange={setFilterTo}
        />

        {/* 선택된 이벤트 칩 (선택된 경우만 표시) */}
        {selectedCount > 0 && (
          <View style={styles.selectedChipsArea}>
            <Text style={styles.selectedChipsLabel}>선택됨</Text>
            <View style={styles.selectedChips}>
              {selectedList.map((ev) => {
                const isBuy = ev.event_type === 'buy';
                const typeColor = isBuy ? '#22C55E' : '#EF4444';
                const label = ev.name ?? ev.ticker ?? ev.id.slice(0, 6);
                const typeStr = isBuy ? '매수' : '매도';
                return (
                  <TouchableOpacity
                    key={ev.id}
                    style={[styles.selectedChip, { borderColor: typeColor }]}
                    onPress={() => {
                      setSelectedMap((prev) => {
                        const next = { ...prev };
                        delete next[ev.id];
                        return next;
                      });
                    }}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.selectedChipText, { color: typeColor }]}>
                      {typeStr} {label}
                    </Text>
                    <Text style={[styles.selectedChipRemove, { color: typeColor }]}>✕</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* 에러 */}
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* 초기 로딩 */}
        {initialLoading && (
          <View style={styles.loadingCenter}>
            <ActivityIndicator size="large" color="#003ec7" />
          </View>
        )}

        {/* 결과 없음 */}
        {!initialLoading && filteredEvents.length === 0 && (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>
              {searchQuery.length > 0 || filterFrom || filterTo
                ? '검색 결과가 없습니다'
                : '매수/매도 이벤트가 없습니다'}
            </Text>
          </View>
        )}

        {/* 이벤트 목록 */}
        {!initialLoading && filteredEvents.length > 0 && (
          <FlatList
            data={filteredEvents}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
          />
        )}
      </SafeAreaView>
    </Modal>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e5eeff',
  },
  headerSideBtn: {
    minWidth: 60,
  },
  headerCancelText: {
    fontSize: 14,
    color: '#737688',
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0b1c30',
  },
  headerConfirmText: {
    fontSize: 14,
    color: '#003ec7',
    fontWeight: '700',
    textAlign: 'right',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    backgroundColor: '#dce9ff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0b1c30',
    paddingVertical: 12,
  },
  searchSpinner: {
    marginLeft: 8,
  },
  clearBtn: {
    padding: 6,
  },
  clearBtnText: {
    fontSize: 12,
    color: '#737688',
    fontWeight: '700',
  },
  dateRangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    gap: 8,
  },
  dateRangeLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#737688',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    width: 28,
  },
  dateInput: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0b1c30',
    borderWidth: 1,
    borderColor: '#e5eeff',
  },
  dateRangeSeparator: {
    fontSize: 14,
    color: '#737688',
    fontWeight: '500',
  },
  selectedChipsArea: {
    marginHorizontal: 16,
    marginBottom: 6,
    gap: 6,
  },
  selectedChipsLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#737688',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  selectedChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 9999,
    borderWidth: 1.5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#ffffff',
    gap: 5,
  },
  selectedChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  selectedChipRemove: {
    fontSize: 11,
    fontWeight: '700',
  },
  errorBox: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    backgroundColor: '#ffdad6',
    borderRadius: 10,
  },
  errorText: {
    fontSize: 12,
    color: '#93000a',
  },
  loadingCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  emptyBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 14,
    color: '#737688',
  },
  listContent: {
    paddingBottom: 24,
  },
  eventItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e5eeff',
    gap: 12,
    backgroundColor: '#f8f9ff',
  },
  eventItemSelected: {
    backgroundColor: '#f0f4ff',
  },
  eventLeft: {
    alignItems: 'center',
    gap: 5,
    minWidth: 48,
  },
  eventDate: {
    fontSize: 12,
    fontWeight: '700',
    color: '#434656',
  },
  typeBadge: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  typeLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  eventCenter: {
    flex: 1,
    gap: 3,
  },
  eventName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0b1c30',
  },
  eventDetail: {
    fontSize: 12,
    color: '#737688',
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#c3c5d9',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  checkCircleSelected: {
    backgroundColor: '#22C55E',
    borderColor: '#22C55E',
  },
  checkMark: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
});
