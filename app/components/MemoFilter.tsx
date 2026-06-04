/**
 * MemoFilter.tsx — 메모 필터 컴포넌트
 *
 * 필터 결합 규칙 (이슈 015):
 *   - 같은 행 내 복수 선택 → OR (종목, 섹터)
 *   - 다른 행/타입 간 → AND
 *   - "연결 없음"(noLinks) 선택 시 다른 필터 자동 해제 (상호 배타적)
 *
 * 레이아웃 구조 (이슈 015):
 *   1행 (토글 행): 매매 이벤트 / 뉴스 연관 / 연결 없음 토글
 *   2행 (종목 행): "종목" 헤더 + 가로 스크롤 종목 칩
 *   3행 (섹터 행): "섹터" 헤더 + 가로 스크롤 섹터 칩
 *
 * 변경 사항 (이슈 015):
 *   - 단일 가로 스크롤 → 세 줄 구조로 재배치
 *   - "매매 연관" → "매매 이벤트" 레이블 변경
 *   - "연결 없음" 토글을 토글 행(1행)으로 이동
 */

import React, { useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { MemoFilterState, ENTITY_COLORS, Sector } from '../types/memo';

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
  onToggle: (sectorId: number) => void;
}

const SectorFilterChip = React.memo(function SectorFilterChip({
  sector,
  active,
  onToggle,
}: SectorFilterChipProps) {
  const handlePress = useCallback(
    () => onToggle(sector.id),
    [sector.id, onToggle],
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

// ── 선택된 종목 칩 (stockId 캡처, onRemove 안정화) ──

interface SelectedStockChipProps {
  stockId: string;
  stockName: string;
  onRemove: (stockId: string) => void;
}

const SelectedStockChip = React.memo(function SelectedStockChip({
  stockId,
  stockName,
  onRemove,
}: SelectedStockChipProps) {
  const handlePress = useCallback(
    () => onRemove(stockId),
    [stockId, onRemove],
  );
  return (
    <TouchableOpacity
      style={[styles.chip, { backgroundColor: ENTITY_COLORS.stock, borderColor: ENTITY_COLORS.stock }]}
      onPress={handlePress}
      activeOpacity={0.8}
    >
      <Text style={[styles.chipText, styles.chipTextActive]}>
        {stockName} ✕
      </Text>
    </TouchableOpacity>
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
    // "연결 없음" 선택 시 다른 모든 필터 해제
    if (!filter.noLinks) {
      onFilterChange({
        noLinks: true,
        stockIds: [],
        stockNames: [],
        tradeEventsOnly: false,
        newsOnly: false,
        sectorIds: [],
        sectorNames: [],
      });
    } else {
      onFilterChange({ noLinks: false });
    }
  }, [filter.noLinks, onFilterChange]);

  // 섹터 복수 선택 토글
  const handleToggleSector = useCallback(
    (sectorId: number) => {
      const currentIds = filter.sectorIds;
      const currentNames = filter.sectorNames;
      const idx = currentIds.indexOf(sectorId);

      if (idx >= 0) {
        // 이미 선택된 섹터 → 해제
        const newIds = currentIds.filter((id) => id !== sectorId);
        const newNames = currentNames.filter((_, i) => i !== idx);
        onFilterChange({ sectorIds: newIds, sectorNames: newNames });
      } else {
        // 새 섹터 추가 — noLinks 해제
        const sector = sectors.find((s) => s.id === sectorId);
        const newIds = [...currentIds, sectorId];
        const newNames = [...currentNames, sector?.name ?? ''];
        onFilterChange({ sectorIds: newIds, sectorNames: newNames, noLinks: false });
      }
    },
    [filter.sectorIds, filter.sectorNames, sectors, onFilterChange],
  );

  // 선택된 종목 개별 해제
  const handleRemoveStock = useCallback(
    (stockId: string) => {
      const idx = filter.stockIds.indexOf(stockId);
      if (idx < 0) return;
      const newIds = filter.stockIds.filter((id) => id !== stockId);
      const newNames = filter.stockNames.filter((_, i) => i !== idx);
      onFilterChange({ stockIds: newIds, stockNames: newNames });
    },
    [filter.stockIds, filter.stockNames, onFilterChange],
  );

  const hasAnyFilter =
    filter.stockIds.length > 0 ||
    filter.tradeEventsOnly ||
    filter.newsOnly ||
    filter.sectorIds.length > 0 ||
    filter.noLinks;

  const handleClearAll = useCallback(() => {
    onFilterChange({
      stockIds: [],
      stockNames: [],
      tradeEventsOnly: false,
      newsOnly: false,
      sectorIds: [],
      sectorNames: [],
      noLinks: false,
    });
  }, [onFilterChange]);

  return (
    <View style={styles.container}>
      {/* 1행: 토글 행 — 매매 이벤트 / 뉴스 연관 / 연결 없음 */}
      <View style={styles.toggleRow}>
        <FilterChip
          label="매매 이벤트"
          active={filter.tradeEventsOnly}
          color={ENTITY_COLORS.trade_event}
          onPress={handleToggleTradeEvents}
        />
        <FilterChip
          label="뉴스 연관"
          active={filter.newsOnly}
          color={ENTITY_COLORS.news}
          onPress={handleToggleNews}
        />
        <FilterChip
          label="연결 없음"
          active={filter.noLinks}
          color={ENTITY_COLORS.none}
          onPress={handleToggleNoLinks}
        />
        {hasAnyFilter && (
          <TouchableOpacity style={styles.clearBtn} onPress={handleClearAll}>
            <Text style={styles.clearBtnText}>초기화</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 2행: 종목 행 — 헤더 + 가로 스크롤 종목 칩 */}
      <View style={styles.filterRow}>
        <Text style={styles.rowLabel}>종목</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* 선택된 종목 칩 (복수) */}
          {filter.stockIds.map((stockId, idx) => (
            <SelectedStockChip
              key={stockId}
              stockId={stockId}
              stockName={filter.stockNames[idx] ?? stockId}
              onRemove={handleRemoveStock}
            />
          ))}

          {/* 종목 추가 버튼 */}
          <TouchableOpacity
            style={[styles.chip, styles.chipInactive]}
            onPress={onStockPickerOpen}
            activeOpacity={0.8}
          >
            <Text style={[styles.chipText, styles.chipTextInactive]}>
              {filter.stockIds.length > 0 ? '+ 추가' : '종목 선택'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* 3행: 섹터 행 — 헤더 + 가로 스크롤 섹터 칩 */}
      <View style={styles.filterRow}>
        <Text style={styles.rowLabel}>섹터</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {sectors.map((sec) => (
            <SectorFilterChip
              key={sec.id}
              sector={sec}
              active={filter.sectorIds.includes(sec.id)}
              onToggle={handleToggleSector}
            />
          ))}
          {sectors.length === 0 && (
            <Text style={styles.emptyRowText}>섹터 없음</Text>
          )}
        </ScrollView>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    paddingBottom: 4,
  },
  // 1행: 토글 행 (매매 이벤트 / 뉴스 연관 / 연결 없음)
  toggleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 6,
  },
  // 2행 / 3행: 헤더 + 스크롤 칩 행
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 20,
    paddingVertical: 4,
  },
  rowLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#737688',
    width: 28,
    flexShrink: 0,
    letterSpacing: 0.3,
  },
  scrollContent: {
    gap: 8,
    paddingRight: 20,
    paddingVertical: 2,
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
  emptyRowText: {
    fontSize: 12,
    color: '#9ca3af',
    paddingVertical: 8,
  },
});
