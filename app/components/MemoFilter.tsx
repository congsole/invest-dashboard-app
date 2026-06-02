/**
 * MemoFilter.tsx — 메모 필터 컴포넌트
 *
 * 필터 조건 (AND 결합):
 *   - 종목별 (stockId) + "직접 연결만" 토글
 *   - 매매이벤트 연관만 (tradeEventsOnly)
 *   - 뉴스 연관만 (newsOnly)
 *   - 섹터별 (sectorId)
 *   - 연결 없음 (noLinks)
 */

import React, { useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { MemoFilterState, ENTITY_COLORS } from '../types/memo';
import { Sector } from '../types/memo';

interface MemoFilterProps {
  filter: MemoFilterState;
  sectors: Sector[];
  onFilterChange: (updated: Partial<MemoFilterState>) => void;
  onStockPickerOpen: () => void;
}

interface FilterChipProps {
  label: string;
  active: boolean;
  color: string;
  onPress: () => void;
}

const FilterChip = React.memo(function FilterChip({
  label,
  active,
  color,
  onPress,
}: FilterChipProps) {
  return (
    <TouchableOpacity
      style={[
        styles.chip,
        active ? { backgroundColor: color, borderColor: color } : styles.chipInactive,
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[styles.chipText, active ? styles.chipTextActive : styles.chipTextInactive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
});

// ── 섹터 필터 칩 (섹터 ID 캡처, onPress 안정화) ──

interface SectorFilterChipProps {
  sector: Sector;
  active: boolean;
  onToggle: (sectorId: number, sectorName: string) => void;
}

const SectorFilterChip = React.memo(function SectorFilterChip({
  sector,
  active,
  onToggle,
}: SectorFilterChipProps) {
  const handlePress = useCallback(
    () => onToggle(sector.id, sector.name),
    [sector.id, sector.name, onToggle],
  );
  return (
    <FilterChip
      label={sector.name}
      active={active}
      color={ENTITY_COLORS.sector}
      onPress={handlePress}
    />
  );
});

export const MemoFilter = React.memo(function MemoFilter({
  filter,
  sectors,
  onFilterChange,
  onStockPickerOpen,
}: MemoFilterProps) {
  const handleToggleTradeEvents = useCallback(() => {
    onFilterChange({ tradeEventsOnly: !filter.tradeEventsOnly, noLinks: false });
  }, [filter.tradeEventsOnly, onFilterChange]);

  const handleToggleNews = useCallback(() => {
    onFilterChange({ newsOnly: !filter.newsOnly, noLinks: false });
  }, [filter.newsOnly, onFilterChange]);

  const handleToggleNoLinks = useCallback(() => {
    onFilterChange({
      noLinks: !filter.noLinks,
      tradeEventsOnly: false,
      newsOnly: false,
    });
  }, [filter.noLinks, onFilterChange]);

  const handleToggleSector = useCallback(
    (sectorId: number, sectorName: string) => {
      if (filter.sectorId === sectorId) {
        onFilterChange({ sectorId: null, sectorName: null });
      } else {
        onFilterChange({ sectorId, sectorName, noLinks: false });
      }
    },
    [filter.sectorId, onFilterChange],
  );

  const handleClearStock = useCallback(() => {
    onFilterChange({ stockId: null, stockName: null });
  }, [onFilterChange]);

  const handleToggleIncludeTradeEvents = useCallback(() => {
    onFilterChange({ includeTradeEvents: !filter.includeTradeEvents });
  }, [filter.includeTradeEvents, onFilterChange]);

  const hasAnyFilter =
    filter.stockId !== null ||
    filter.tradeEventsOnly ||
    filter.newsOnly ||
    filter.sectorId !== null ||
    filter.noLinks;

  const handleClearAll = useCallback(() => {
    onFilterChange({
      stockId: null,
      stockName: null,
      includeTradeEvents: true,
      tradeEventsOnly: false,
      newsOnly: false,
      sectorId: null,
      sectorName: null,
      noLinks: false,
    });
  }, [onFilterChange]);

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* 종목 필터 */}
        <TouchableOpacity
          style={[
            styles.chip,
            filter.stockId
              ? { backgroundColor: ENTITY_COLORS.stock, borderColor: ENTITY_COLORS.stock }
              : styles.chipInactive,
          ]}
          onPress={filter.stockId ? handleClearStock : onStockPickerOpen}
          activeOpacity={0.8}
        >
          <Text
            style={[
              styles.chipText,
              filter.stockId ? styles.chipTextActive : styles.chipTextInactive,
            ]}
          >
            {filter.stockId ? `종목: ${filter.stockName}` : '종목 필터'}
          </Text>
        </TouchableOpacity>

        {/* 매매이벤트 연관 */}
        <FilterChip
          label="매매 연관"
          active={filter.tradeEventsOnly}
          color={ENTITY_COLORS.trade_event}
          onPress={handleToggleTradeEvents}
        />

        {/* 뉴스 연관 */}
        <FilterChip
          label="뉴스 연관"
          active={filter.newsOnly}
          color={ENTITY_COLORS.news}
          onPress={handleToggleNews}
        />

        {/* 섹터별 */}
        {sectors.map((sec) => (
          <SectorFilterChip
            key={sec.id}
            sector={sec}
            active={filter.sectorId === sec.id}
            onToggle={handleToggleSector}
          />
        ))}

        {/* 연결 없음 */}
        <FilterChip
          label="연결 없음"
          active={filter.noLinks}
          color={ENTITY_COLORS.none}
          onPress={handleToggleNoLinks}
        />

        {/* 전체 초기화 */}
        {hasAnyFilter && (
          <TouchableOpacity style={styles.clearBtn} onPress={handleClearAll}>
            <Text style={styles.clearBtnText}>초기화</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* 종목 필터 시: "직접 연결만" 토글 */}
      {filter.stockId && (
        <TouchableOpacity
          style={styles.subToggleRow}
          onPress={handleToggleIncludeTradeEvents}
          activeOpacity={0.8}
        >
          <View
            style={[
              styles.toggle,
              filter.includeTradeEvents ? styles.toggleOn : styles.toggleOff,
            ]}
          >
            <View style={[styles.toggleKnob, filter.includeTradeEvents && styles.toggleKnobOn]} />
          </View>
          <Text style={styles.subToggleText}>
            {filter.includeTradeEvents ? '매매이벤트 포함' : '직접 연결만'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  scrollContent: {
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 4,
  },
  chip: {
    borderRadius: 9999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1.5,
  },
  chipInactive: {
    backgroundColor: '#ffffff',
    borderColor: '#c3c5d9',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#ffffff',
  },
  chipTextInactive: {
    color: '#434656',
  },
  clearBtn: {
    borderRadius: 9999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1.5,
    borderColor: '#ba1a1a',
  },
  clearBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ba1a1a',
  },
  subToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
  },
  toggle: {
    width: 36,
    height: 20,
    borderRadius: 10,
    padding: 2,
    justifyContent: 'center',
  },
  toggleOn: {
    backgroundColor: '#3B82F6',
  },
  toggleOff: {
    backgroundColor: '#c3c5d9',
  },
  toggleKnob: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#ffffff',
  },
  toggleKnobOn: {
    alignSelf: 'flex-end',
  },
  subToggleText: {
    fontSize: 12,
    color: '#434656',
    fontWeight: '500',
  },
});
