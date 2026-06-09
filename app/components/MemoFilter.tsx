/**
 * MemoFilter.tsx — 메모 필터 컴포넌트
 *
 * 필터 결합 규칙 (이슈 015):
 *   - 같은 행 내 복수 선택 → OR (종목, 섹터, 카테고리)
 *   - 다른 행/타입 간 → AND
 *   - "연결 없음"(noLinks) 선택 시 다른 필터 자동 해제 (상호 배타적)
 *
 * 레이아웃 구조 (이슈 015):
 *   1행 (토글 행): 매매 이벤트 / 뉴스 연관 / 연결 없음 토글
 *   2행 (종목 행): "종목" 헤더 + 가로 스크롤 종목 칩
 *   3행 (섹터 행): "섹터" 헤더 + L1 칩 나열, L1 탭 시 L2 칩 펼침
 *   4행 (카테고리 행): "카테고리" 헤더 + 칩 복수 선택 + 편집 아이콘 [025]
 *
 * 섹터 필터 동작 (이슈 022):
 *   - L1 선택 → L1 id를 sectorIds에 즉시 추가 (L2 미로딩 상태도 가능)
 *     RPC 재귀 CTE가 L1 하위 전체를 자동 포함하므로 L2 로딩 여부와 무관하게 동일 결과 보장
 *   - L2 로딩 완료 후 → L2 id들을 sectorIds에 보충 추가 (L1 id 유지)
 *   - L1 해제 → L1 id + 하위 L2 id 전체 제거
 *   - L2 일부 선택 → L1 테두리만 색상 (partial)
 *   - L2 전체 선택 → L1 배경 채움 (all)
 *   - sectorIds에는 L1 id와 L2 id가 모두 저장됨
 *
 * [019] 필터 동작 확인:
 *   - list_memos RPC가 "종목 경로 + 직접 연결 경로 OR 합산"으로 확장됨
 *   - sectorIds에 L2 id를 보내면 RPC 내부에서 아래 두 경로를 합산:
 *     1) 해당 L2 하위 종목에 연결된 메모 (종목 경로)
 *     2) memo_sectors에 직접 L2/L3/L4로 연결된 메모 (직접 연결 경로)
 *   - 프론트에서 별도 변경 없이 L3/L4로 직접 연결된 메모도 필터 결과에 포함됨
 *
 * [025] 카테고리 행 추가:
 *   - categories prop으로 카테고리 목록 수신
 *   - 칩 탭으로 복수 선택 (같은 행 OR)
 *   - 행 우측 편집 아이콘 탭 → onCategoryManagePress 콜백
 */

import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { MemoFilterState, ENTITY_COLORS } from '../types/memo';
import { Sector } from '../types/sector';
import { UserCategoryWithCount } from '../types/category';

interface MemoFilterProps {
  filter: MemoFilterState;
  /** L1 섹터 목록 (getSectors({ level: 1 })로 조회) */
  l1Sectors: Sector[];
  /** L1별 L2 목록 맵 (key: L1 sector id, value: L2 sectors) */
  l2SectorMap: Map<number, Sector[]>;
  /** [025] 사용자 카테고리 목록 */
  categories: UserCategoryWithCount[];
  onFilterChange: (updated: Partial<MemoFilterState>) => void;
  onStockPickerOpen: () => void;
  /** L1 칩 펼침 시 호출 — 부모가 L2 목록을 지연 로딩함 */
  onExpandL1?: (l1SectorId: number | null) => void;
  /** [025] 카테고리 편집 아이콘 탭 시 호출 */
  onCategoryManagePress?: () => void;
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

// ── L1 섹터 칩 (펼침/접힘 상태 + 선택 상태 표시) ──

type L1SelectionState = 'none' | 'partial' | 'all';

interface L1SectorChipProps {
  sector: Sector;
  /** L2 선택 상태: none=미선택, partial=일부, all=전체 */
  selectionState: L1SelectionState;
  /** 현재 expanded된 L1 id */
  expandedL1Id: number | null;
  onToggleExpand: (sectorId: number) => void;
  onToggleSelect: (sectorId: number) => void;
}

const L1SectorChip = React.memo(function L1SectorChip({
  sector,
  selectionState,
  expandedL1Id,
  onToggleExpand,
  onToggleSelect,
}: L1SectorChipProps) {
  const isExpanded = expandedL1Id === sector.id;
  const isAll = selectionState === 'all';
  const isPartial = selectionState === 'partial';

  const handleExpand = useCallback(() => onToggleExpand(sector.id), [sector.id, onToggleExpand]);
  const handleSelect = useCallback(() => onToggleSelect(sector.id), [sector.id, onToggleSelect]);

  return (
    <View
      style={[
        l1ChipStyles.wrapper,
        isAll && { borderColor: ENTITY_COLORS.sector },
        isPartial && { borderColor: ENTITY_COLORS.sector },
      ]}
    >
      {/* 선택 영역 (좌측 탭) */}
      <TouchableOpacity
        style={[
          l1ChipStyles.chip,
          isAll
            ? { backgroundColor: ENTITY_COLORS.sector }
            : isPartial
            ? l1ChipStyles.chipPartial
            : l1ChipStyles.chipInactive,
          isExpanded && selectionState === 'none' && l1ChipStyles.chipExpandedInactive,
        ]}
        onPress={handleSelect}
        activeOpacity={0.8}
      >
        <Text
          style={[
            l1ChipStyles.chipText,
            isAll
              ? l1ChipStyles.chipTextActive
              : isPartial
              ? l1ChipStyles.chipTextPartial
              : l1ChipStyles.chipTextInactive,
          ]}
        >
          {sector.name}
        </Text>
      </TouchableOpacity>

      {/* 펼침 버튼 (우측 화살표) */}
      <TouchableOpacity
        style={[
          l1ChipStyles.expandBtn,
          isAll
            ? { backgroundColor: ENTITY_COLORS.sector, borderLeftColor: 'rgba(255,255,255,0.3)' }
            : isPartial
            ? { ...l1ChipStyles.expandBtnPartial, borderLeftColor: ENTITY_COLORS.sector }
            : isExpanded
            ? l1ChipStyles.expandBtnExpandedInactive
            : l1ChipStyles.expandBtnInactive,
        ]}
        onPress={handleExpand}
        activeOpacity={0.8}
      >
        <Text
          style={[
            l1ChipStyles.arrow,
            (isAll || isPartial) && l1ChipStyles.arrowActive,
          ]}
        >
          {isExpanded ? '▲' : '▼'}
        </Text>
      </TouchableOpacity>
    </View>
  );
});

// ── L2 섹터 칩 ──

interface L2SectorChipProps {
  sector: Sector;
  active: boolean;
  onToggle: (sectorId: number) => void;
}

const L2SectorChip = React.memo(function L2SectorChip({
  sector,
  active,
  onToggle,
}: L2SectorChipProps) {
  const handlePress = useCallback(() => onToggle(sector.id), [sector.id, onToggle]);
  return (
    <TouchableOpacity
      style={[
        styles.chip,
        styles.l2Chip,
        active
          ? { backgroundColor: ENTITY_COLORS.sector, borderColor: ENTITY_COLORS.sector }
          : styles.chipInactive,
      ]}
      onPress={handlePress}
      activeOpacity={0.8}
    >
      <Text style={[styles.chipText, active ? styles.chipTextActive : styles.chipTextInactive]}>
        {sector.name}
      </Text>
    </TouchableOpacity>
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

// ── [025] 카테고리 칩 (categoryId 캡처, onToggle 안정화) ──

interface CategoryFilterChipProps {
  categoryId: string;
  categoryName: string;
  active: boolean;
  onToggle: (categoryId: string, categoryName: string) => void;
}

const CategoryFilterChip = React.memo(function CategoryFilterChip({
  categoryId,
  categoryName,
  active,
  onToggle,
}: CategoryFilterChipProps) {
  const handlePress = useCallback(
    () => onToggle(categoryId, categoryName),
    [categoryId, categoryName, onToggle],
  );
  return (
    <FilterChip
      label={categoryName}
      active={active}
      color={ENTITY_COLORS.category}
      onPress={handlePress}
    />
  );
});

// ── L2 칩 행 (펼쳐진 L1 하위) ──

interface L2RowProps {
  l2Sectors: Sector[];
  selectedSectorIds: number[];
  loading: boolean;
  onToggle: (sectorId: number) => void;
}

const L2Row = React.memo(function L2Row({ l2Sectors, selectedSectorIds, loading, onToggle }: L2RowProps) {
  if (loading) {
    return (
      <View style={[styles.l2Row, styles.l2RowLoading]}>
        <ActivityIndicator size="small" color="#003ec7" />
      </View>
    );
  }
  if (l2Sectors.length === 0) return null;
  return (
    <View style={styles.l2Row}>
      <Text style={styles.l2RowLabel}>▸</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {l2Sectors.map((sec) => (
          <L2SectorChip
            key={sec.id}
            sector={sec}
            active={selectedSectorIds.includes(sec.id)}
            onToggle={onToggle}
          />
        ))}
      </ScrollView>
    </View>
  );
});

export const MemoFilter = React.memo(function MemoFilter({
  filter,
  l1Sectors,
  l2SectorMap,
  categories,
  onFilterChange,
  onStockPickerOpen,
  onExpandL1,
  onCategoryManagePress,
}: MemoFilterProps) {
  // 현재 expanded된 L1 sector id (하나만 펼침)
  const [expandedL1Id, setExpandedL1Id] = React.useState<number | null>(null);

  // L1별 선택 상태 계산
  // - L2가 로딩된 경우: L2 선택 수 기반으로 none/partial/all 판단
  // - L2가 아직 로딩 안 된 경우: L1 id가 sectorIds에 있으면 all, 없으면 none
  const l1SelectionStates = useMemo(() => {
    const states = new Map<number, L1SelectionState>();
    for (const l1Sector of l1Sectors) {
      const l1Id = l1Sector.id;
      const l1Selected = filter.sectorIds.includes(l1Id);
      const l2List = l2SectorMap.get(l1Id);

      if (l2List === undefined) {
        // L2 미로딩: L1 id 포함 여부로 판단
        states.set(l1Id, l1Selected ? 'all' : 'none');
        continue;
      }
      if (l2List.length === 0) {
        states.set(l1Id, l1Selected ? 'all' : 'none');
        continue;
      }
      const selectedL2Count = l2List.filter((s) => filter.sectorIds.includes(s.id)).length;
      if (selectedL2Count === l2List.length) states.set(l1Id, 'all');
      else if (selectedL2Count > 0 || l1Selected) states.set(l1Id, 'partial');
      else states.set(l1Id, 'none');
    }
    return states;
  }, [l1Sectors, l2SectorMap, filter.sectorIds]);

  const handleToggleTradeEvents = useCallback(() => {
    onFilterChange({ tradeEventsOnly: !filter.tradeEventsOnly, noLinks: false });
  }, [filter.tradeEventsOnly, onFilterChange]);

  const handleToggleNews = useCallback(() => {
    onFilterChange({ newsOnly: !filter.newsOnly, noLinks: false });
  }, [filter.newsOnly, onFilterChange]);

  const handleToggleNoLinks = useCallback(() => {
    if (!filter.noLinks) {
      onFilterChange({
        noLinks: true,
        stockIds: [],
        stockNames: [],
        tradeEventsOnly: false,
        newsOnly: false,
        sectorIds: [],
        sectorNames: [],
        categoryIds: [],
        categoryNames: [],
      });
    } else {
      onFilterChange({ noLinks: false });
    }
  }, [filter.noLinks, onFilterChange]);

  // L1 펼침/접힘 토글 (accordion: 다른 L1 펼치면 이전 L1 닫힘)
  const handleToggleExpand = useCallback((sectorId: number) => {
    setExpandedL1Id((prev) => {
      const next = prev === sectorId ? null : sectorId;
      onExpandL1?.(next);
      return next;
    });
  }, [onExpandL1]);

  // L1 칩 선택 토글
  // - 선택: L1 id를 즉시 sectorIds에 추가. L2가 이미 로딩된 경우 L2 id들도 함께 추가.
  // - 해제: L1 id + 하위 L2 id 전체 제거
  const handleToggleL1Sector = useCallback(
    (sectorId: number) => {
      const currentState = l1SelectionStates.get(sectorId) ?? 'none';
      const l2List = l2SectorMap.get(sectorId) ?? [];
      const l2Ids = new Set(l2List.map((s) => s.id));

      if (currentState !== 'none') {
        // 해제: L1 id + 하위 L2 id 전체 제거
        const removeIds = new Set([sectorId, ...l2Ids]);
        const newIds = filter.sectorIds.filter((id) => !removeIds.has(id));
        const newNames = filter.sectorNames.filter((_, i) => !removeIds.has(filter.sectorIds[i]));
        onFilterChange({ sectorIds: newIds, sectorNames: newNames });
      } else {
        // 선택: L1 id를 즉시 추가. L2가 로딩된 경우 L2 id들도 함께 추가.
        const existingIds = new Set(filter.sectorIds);
        const idsToAdd: number[] = [];
        const namesToAdd: string[] = [];

        // L1 id 추가 (아직 없는 경우)
        if (!existingIds.has(sectorId)) {
          const l1Sector = l1Sectors.find((s) => s.id === sectorId);
          idsToAdd.push(sectorId);
          namesToAdd.push(l1Sector?.name ?? '');
        }

        // L2 id 추가 (로딩된 경우에만)
        for (const l2 of l2List) {
          if (!existingIds.has(l2.id)) {
            idsToAdd.push(l2.id);
            namesToAdd.push(l2.name);
          }
        }

        onFilterChange({
          sectorIds: [...filter.sectorIds, ...idsToAdd],
          sectorNames: [...filter.sectorNames, ...namesToAdd],
          noLinks: false,
        });
      }
    },
    [filter.sectorIds, filter.sectorNames, l1Sectors, l2SectorMap, l1SelectionStates, onFilterChange],
  );

  // L2 칩 선택 토글
  const handleToggleL2Sector = useCallback(
    (sectorId: number) => {
      const currentIds = filter.sectorIds;
      const currentNames = filter.sectorNames;
      const idx = currentIds.indexOf(sectorId);

      if (idx >= 0) {
        const newIds = currentIds.filter((id) => id !== sectorId);
        const newNames = currentNames.filter((_, i) => i !== idx);
        onFilterChange({ sectorIds: newIds, sectorNames: newNames });
      } else {
        // L2 섹터 이름 찾기
        let sectorName = '';
        for (const [, l2List] of l2SectorMap) {
          const found = l2List.find((s) => s.id === sectorId);
          if (found) { sectorName = found.name; break; }
        }
        const newIds = [...currentIds, sectorId];
        const newNames = [...currentNames, sectorName];
        onFilterChange({ sectorIds: newIds, sectorNames: newNames, noLinks: false });
      }
    },
    [filter.sectorIds, filter.sectorNames, l2SectorMap, onFilterChange],
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

  // [025] 카테고리 칩 토글
  const handleToggleCategory = useCallback(
    (categoryId: string, categoryName: string) => {
      const idx = filter.categoryIds.indexOf(categoryId);
      if (idx >= 0) {
        const newIds = filter.categoryIds.filter((id) => id !== categoryId);
        const newNames = filter.categoryNames.filter((_, i) => i !== idx);
        onFilterChange({ categoryIds: newIds, categoryNames: newNames });
      } else {
        onFilterChange({
          categoryIds: [...filter.categoryIds, categoryId],
          categoryNames: [...filter.categoryNames, categoryName],
          noLinks: false,
        });
      }
    },
    [filter.categoryIds, filter.categoryNames, onFilterChange],
  );

  const hasAnyFilter = useMemo(
    () =>
      filter.stockIds.length > 0 ||
      filter.tradeEventsOnly ||
      filter.newsOnly ||
      filter.sectorIds.length > 0 ||
      filter.categoryIds.length > 0 ||
      filter.noLinks,
    [filter],
  );

  const handleClearAll = useCallback(() => {
    onFilterChange({
      stockIds: [],
      stockNames: [],
      tradeEventsOnly: false,
      newsOnly: false,
      sectorIds: [],
      sectorNames: [],
      categoryIds: [],
      categoryNames: [],
      noLinks: false,
    });
    setExpandedL1Id(null);
  }, [onFilterChange]);

  // 현재 펼쳐진 L1의 L2 목록 및 로딩 상태
  // l2SectorMap에 key가 없으면 아직 로딩 중(또는 에러)
  const expandedL2Sectors = useMemo(
    () => (expandedL1Id !== null ? (l2SectorMap.get(expandedL1Id) ?? []) : []),
    [expandedL1Id, l2SectorMap],
  );
  const isL2Loading = expandedL1Id !== null && !l2SectorMap.has(expandedL1Id);

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
          {filter.stockIds.map((stockId, idx) => (
            <SelectedStockChip
              key={stockId}
              stockId={stockId}
              stockName={filter.stockNames[idx] ?? stockId}
              onRemove={handleRemoveStock}
            />
          ))}
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

      {/* 3행: 섹터 행 — L1 칩 나열 */}
      <View style={styles.filterRow}>
        <Text style={styles.rowLabel}>섹터</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {l1Sectors.map((sec) => (
            <L1SectorChip
              key={sec.id}
              sector={sec}
              selectionState={l1SelectionStates.get(sec.id) ?? 'none'}
              expandedL1Id={expandedL1Id}
              onToggleExpand={handleToggleExpand}
              onToggleSelect={handleToggleL1Sector}
            />
          ))}
          {l1Sectors.length === 0 && (
            <Text style={styles.emptyRowText}>섹터 없음</Text>
          )}
        </ScrollView>
      </View>

      {/* 4행 (조건부): 펼쳐진 L1의 L2 칩 행 (로딩 중이면 스피너 표시) */}
      {expandedL1Id !== null && (isL2Loading || expandedL2Sectors.length > 0) && (
        <L2Row
          l2Sectors={expandedL2Sectors}
          selectedSectorIds={filter.sectorIds}
          loading={isL2Loading}
          onToggle={handleToggleL2Sector}
        />
      )}

      {/* [025] 5행: 카테고리 행 — 헤더 + 칩 + 편집 아이콘 */}
      <View style={styles.filterRow}>
        <Text style={styles.rowLabelWide}>카테고리</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {categories.map((cat) => (
            <CategoryFilterChip
              key={cat.id}
              categoryId={cat.id}
              categoryName={cat.name}
              active={filter.categoryIds.includes(cat.id)}
              onToggle={handleToggleCategory}
            />
          ))}
          {categories.length === 0 && (
            <Text style={styles.emptyRowText}>카테고리 없음</Text>
          )}
        </ScrollView>
        {onCategoryManagePress && (
          <TouchableOpacity
            style={styles.categoryEditBtn}
            onPress={onCategoryManagePress}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.categoryEditIcon}>⚙</Text>
          </TouchableOpacity>
        )}
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
  // 4행: L2 칩 행
  l2Row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 20,
    paddingVertical: 4,
    backgroundColor: '#f3f6ff',
    borderTopWidth: 1,
    borderTopColor: '#e5eeff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5eeff',
  },
  l2RowLoading: {
    justifyContent: 'center',
    paddingVertical: 8,
  },
  l2RowLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#003ec7',
    width: 16,
    flexShrink: 0,
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
  l2Chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
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
  // [025] 카테고리 편집 버튼
  categoryEditBtn: {
    paddingRight: 12,
    paddingLeft: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryEditIcon: {
    fontSize: 16,
    color: '#737688',
  },
  // rowLabel 너비를 카테고리 텍스트에 맞게 확장
  rowLabelWide: {
    fontSize: 11,
    fontWeight: '700',
    color: '#737688',
    width: 44,
    flexShrink: 0,
    letterSpacing: 0.3,
  },
});

const l1ChipStyles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    borderRadius: 9999,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#c3c5d9',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipInactive: {
    backgroundColor: '#ffffff',
  },
  chipPartial: {
    backgroundColor: '#ffffff',
  },
  chipExpandedInactive: {
    backgroundColor: '#eff4ff',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#ffffff',
  },
  chipTextPartial: {
    color: ENTITY_COLORS.sector,
  },
  chipTextInactive: {
    color: '#434656',
  },
  expandBtn: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderLeftWidth: 1,
    borderLeftColor: '#c3c5d9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandBtnInactive: {
    backgroundColor: '#ffffff',
  },
  expandBtnPartial: {
    backgroundColor: '#ffffff',
  },
  expandBtnExpandedInactive: {
    backgroundColor: '#eff4ff',
  },
  arrow: {
    fontSize: 8,
    color: '#737688',
  },
  arrowActive: {
    color: '#ffffff',
  },
});
