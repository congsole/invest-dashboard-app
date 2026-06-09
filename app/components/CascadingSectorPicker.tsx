/**
 * CascadingSectorPicker.tsx — L1→L2→L3→L4 cascading 섹터 선택 공통 컴포넌트
 *
 * [019] MemoEditScreen 섹터 연결용 공통 컴포넌트
 *   - 복수 선택 모드: L1~L4 어느 레벨이든 독립적으로 선택/해제 가능
 *   - L1 펼침 → L2 목록 표시, L2 펼침 → L3 목록 표시, L3 펼침 → L4 목록 표시
 *   - 원하는 레벨에서 멈추고 선택 가능 (리프 노드 아닐 때도 선택 허용)
 *
 * [023] 섹터 검색 기능 추가
 *   - 최상단에 검색 입력 필드 추가 (useSectorSearch 훅 사용)
 *   - 검색어 2글자 이상: 기존 cascading UI 숨기고 검색 결과 리스트 표시
 *   - 검색 결과: breadcrumb 경로, 레벨 배지, 선택 상태 표시
 *   - CascadingSectorMultiPicker: onToggle 동작 그대로
 *   - CascadingSectorPicker(단일): 탭 시 즉시 onConfirm
 *
 * CLAUDE.md 렌더링 최적화:
 *   - React.memo + useCallback 활용
 *   - 레벨별 로딩은 해당 섹션에만 반영, 기존 선택 유지
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { getSectors } from '../services/sectors';
import { Sector } from '../types/sector';
import { useSectorSearch, SectorSearchResult } from '../hooks/useSectorSearch';

// ────────────────────────────────────────────
// SectorSearchBar — 검색 입력 필드 (공통)
// ────────────────────────────────────────────

interface SectorSearchBarProps {
  query: string;
  onChangeText: (text: string) => void;
  onClear: () => void;
}

const SectorSearchBar = React.memo(function SectorSearchBar({
  query,
  onChangeText,
  onClear,
}: SectorSearchBarProps) {
  return (
    <View style={searchStyles.searchRow}>
      <TextInput
        style={searchStyles.input}
        placeholder="섹터 검색..."
        placeholderTextColor="#737688"
        value={query}
        onChangeText={onChangeText}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
      />
      {query.length > 0 && (
        <TouchableOpacity style={searchStyles.clearBtn} onPress={onClear} activeOpacity={0.7}>
          <Text style={searchStyles.clearBtnText}>✕</Text>
        </TouchableOpacity>
      )}
    </View>
  );
});

// ────────────────────────────────────────────
// BreadcrumbText — 검색 결과 경로 텍스트 렌더링
// 매칭된 섹터(마지막)는 볼드 + 포인트 색상
// ────────────────────────────────────────────

interface BreadcrumbTextProps {
  breadcrumb: Sector[];
}

const BreadcrumbText = React.memo(function BreadcrumbText({ breadcrumb }: BreadcrumbTextProps) {
  return (
    <View style={searchStyles.breadcrumbRow}>
      {breadcrumb.map((item, index) => {
        const isLast = index === breadcrumb.length - 1;
        return (
          <React.Fragment key={item.id}>
            {index > 0 && (
              <Text style={searchStyles.breadcrumbSeparator}>{' > '}</Text>
            )}
            <Text
              style={[
                searchStyles.breadcrumbItem,
                isLast && searchStyles.breadcrumbItemMatched,
              ]}
            >
              {item.name}
            </Text>
          </React.Fragment>
        );
      })}
    </View>
  );
});

// ────────────────────────────────────────────
// SearchResultItem — 검색 결과 단일 항목 (멀티 선택 모드)
// ────────────────────────────────────────────

interface SearchResultItemMultiProps {
  result: SectorSearchResult;
  isSelected: boolean;
  onToggle: (sector: Sector) => void;
}

const SearchResultItemMulti = React.memo(function SearchResultItemMulti({
  result,
  isSelected,
  onToggle,
}: SearchResultItemMultiProps) {
  const handlePress = useCallback(() => onToggle(result.sector), [result.sector, onToggle]);

  return (
    <TouchableOpacity
      style={[searchStyles.resultItem, isSelected && searchStyles.resultItemSelected]}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <View style={searchStyles.resultLeft}>
        <BreadcrumbText breadcrumb={result.breadcrumb} />
      </View>
      <View style={searchStyles.resultRight}>
        <View style={[searchStyles.levelBadge, isSelected && searchStyles.levelBadgeSelected]}>
          <Text style={[searchStyles.levelBadgeText, isSelected && searchStyles.levelBadgeTextSelected]}>
            L{result.sector.level}
          </Text>
        </View>
        {isSelected && (
          <Text style={searchStyles.checkMark}>✓</Text>
        )}
      </View>
    </TouchableOpacity>
  );
});

// ────────────────────────────────────────────
// SearchResultItemSingle — 검색 결과 단일 항목 (단일 선택 모드)
// ────────────────────────────────────────────

interface SearchResultItemSingleProps {
  result: SectorSearchResult;
  onSelect: (sector: Sector) => void;
}

const SearchResultItemSingle = React.memo(function SearchResultItemSingle({
  result,
  onSelect,
}: SearchResultItemSingleProps) {
  const handlePress = useCallback(() => onSelect(result.sector), [result.sector, onSelect]);

  return (
    <TouchableOpacity
      style={searchStyles.resultItem}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <View style={searchStyles.resultLeft}>
        <BreadcrumbText breadcrumb={result.breadcrumb} />
      </View>
      <View style={searchStyles.resultRight}>
        <View style={searchStyles.levelBadge}>
          <Text style={searchStyles.levelBadgeText}>
            L{result.sector.level}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
});

// ────────────────────────────────────────────
// SearchResultList — 검색 결과 리스트 (멀티)
// ────────────────────────────────────────────

interface SearchResultListMultiProps {
  results: SectorSearchResult[];
  selectedIds: Set<number>;
  loading: boolean;
  error: string | null;
  onToggle: (sector: Sector) => void;
}

const SearchResultListMulti = React.memo(function SearchResultListMulti({
  results,
  selectedIds,
  loading,
  error,
  onToggle,
}: SearchResultListMultiProps) {
  if (loading) {
    return (
      <View style={searchStyles.centerBox}>
        <ActivityIndicator size="small" color="#003ec7" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={searchStyles.centerBox}>
        <Text style={searchStyles.errorText}>섹터 목록을 불러오지 못했습니다</Text>
      </View>
    );
  }

  if (results.length === 0) {
    return (
      <View style={searchStyles.centerBox}>
        <Text style={searchStyles.emptyText}>검색 결과 없음</Text>
      </View>
    );
  }

  return (
    <View style={searchStyles.resultList}>
      {results.map((result) => (
        <SearchResultItemMulti
          key={result.sector.id}
          result={result}
          isSelected={selectedIds.has(result.sector.id)}
          onToggle={onToggle}
        />
      ))}
    </View>
  );
});

// ────────────────────────────────────────────
// SearchResultListSingle — 검색 결과 리스트 (단일)
// ────────────────────────────────────────────

interface SearchResultListSingleProps {
  results: SectorSearchResult[];
  loading: boolean;
  error: string | null;
  onSelect: (sector: Sector) => void;
}

const SearchResultListSingle = React.memo(function SearchResultListSingle({
  results,
  loading,
  error,
  onSelect,
}: SearchResultListSingleProps) {
  if (loading) {
    return (
      <View style={searchStyles.centerBox}>
        <ActivityIndicator size="small" color="#003ec7" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={searchStyles.centerBox}>
        <Text style={searchStyles.errorText}>섹터 목록을 불러오지 못했습니다</Text>
      </View>
    );
  }

  if (results.length === 0) {
    return (
      <View style={searchStyles.centerBox}>
        <Text style={searchStyles.emptyText}>검색 결과 없음</Text>
      </View>
    );
  }

  return (
    <View style={searchStyles.resultList}>
      {results.map((result) => (
        <SearchResultItemSingle
          key={result.sector.id}
          result={result}
          onSelect={onSelect}
        />
      ))}
    </View>
  );
});

// ────────────────────────────────────────────
// 공통 PickerLevel — 단일 레벨 칩 목록 (단일 선택용)
// StockDetailSheet의 CascadingPicker에서도 재사용 가능.
// ────────────────────────────────────────────

interface PickerLevelProps {
  label: string;
  items: Sector[];
  selected: Sector | null;
  loading: boolean;
  emptyNote?: string;
  onSelect: (sector: Sector) => void;
}

export const PickerLevel = React.memo(function PickerLevel({
  label,
  items,
  selected,
  loading,
  emptyNote,
  onSelect,
}: PickerLevelProps) {
  if (loading) {
    return (
      <View style={styles.levelSection}>
        <Text style={styles.levelLabel}>{label}</Text>
        <ActivityIndicator size="small" color="#003ec7" />
      </View>
    );
  }

  if (items.length === 0 && emptyNote) {
    return (
      <View style={styles.levelSection}>
        <Text style={styles.levelLabel}>{label}</Text>
        <Text style={styles.emptyNote}>{emptyNote}</Text>
      </View>
    );
  }

  if (items.length === 0) return null;

  return (
    <View style={styles.levelSection}>
      <Text style={styles.levelLabel}>{label}</Text>
      <View style={styles.chipRow}>
        {items.map((item) => {
          const isSelected = selected?.id === item.id;
          return (
            <TouchableOpacity
              key={item.id}
              style={[styles.chip, isSelected && styles.chipSelected]}
              onPress={() => onSelect(item)}
              activeOpacity={0.7}
            >
              <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                {item.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
});

// ────────────────────────────────────────────
// MultiSectorChip — 복수 선택 모드 칩 (선택 토글 + 펼침 버튼)
// ────────────────────────────────────────────

interface MultiSectorChipProps {
  sector: Sector;
  isSelected: boolean;
  isExpanded: boolean;
  hasChildren: boolean;
  onSelect: (sector: Sector) => void;
  onExpand: (sector: Sector) => void;
}

const MultiSectorChip = React.memo(function MultiSectorChip({
  sector,
  isSelected,
  isExpanded,
  hasChildren,
  onSelect,
  onExpand,
}: MultiSectorChipProps) {
  const handleSelect = useCallback(() => onSelect(sector), [sector, onSelect]);
  const handleExpand = useCallback(() => onExpand(sector), [sector, onExpand]);

  return (
    <View
      style={[
        styles.multiChipWrapper,
        isSelected && styles.multiChipWrapperSelected,
        isExpanded && !isSelected && styles.multiChipWrapperExpanded,
      ]}
    >
      {/* 선택 영역 */}
      <TouchableOpacity
        style={[
          styles.multiChip,
          isSelected && styles.multiChipSelected,
          isExpanded && !isSelected && styles.multiChipExpanded,
        ]}
        onPress={handleSelect}
        activeOpacity={0.7}
      >
        <Text
          style={[
            styles.chipText,
            isSelected && styles.chipTextSelected,
            isExpanded && !isSelected && styles.chipTextExpanded,
          ]}
        >
          {sector.name}
        </Text>
      </TouchableOpacity>

      {/* 펼침 버튼 — L1/L2/L3에만 표시 (L4는 리프) */}
      {hasChildren && (
        <TouchableOpacity
          style={[
            styles.expandBtn,
            isSelected && styles.expandBtnSelected,
            isExpanded && !isSelected && styles.expandBtnExpanded,
          ]}
          onPress={handleExpand}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.expandBtnText,
              isSelected && styles.expandBtnTextSelected,
              !isSelected && isExpanded && styles.expandBtnTextActive,
            ]}
          >
            {isExpanded ? '▲' : '▼'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
});

// ────────────────────────────────────────────
// MultiPickerLevel — 복수 선택 모드용 레벨 컴포넌트
// ────────────────────────────────────────────

interface MultiPickerLevelProps {
  label: string;
  items: Sector[];
  selectedIds: Set<number>;
  expandedId: number | null;
  loading: boolean;
  emptyNote?: string;
  isLeaf: boolean;
  indent?: boolean;
  onSelect: (sector: Sector) => void;
  onExpand: (sector: Sector) => void;
}

const MultiPickerLevel = React.memo(function MultiPickerLevel({
  label,
  items,
  selectedIds,
  expandedId,
  loading,
  emptyNote,
  isLeaf,
  indent = false,
  onSelect,
  onExpand,
}: MultiPickerLevelProps) {
  if (loading) {
    return (
      <View style={[styles.levelSection, indent && styles.levelSectionIndent]}>
        <Text style={styles.levelLabel}>{label}</Text>
        <ActivityIndicator size="small" color="#003ec7" />
      </View>
    );
  }

  if (items.length === 0 && emptyNote) {
    return (
      <View style={[styles.levelSection, indent && styles.levelSectionIndent]}>
        <Text style={styles.levelLabel}>{label}</Text>
        <Text style={styles.emptyNote}>{emptyNote}</Text>
      </View>
    );
  }

  if (items.length === 0) return null;

  return (
    <View style={[styles.levelSection, indent && styles.levelSectionIndent]}>
      <Text style={styles.levelLabel}>{label}</Text>
      <View style={styles.chipRow}>
        {items.map((item) => (
          <MultiSectorChip
            key={item.id}
            sector={item}
            isSelected={selectedIds.has(item.id)}
            isExpanded={expandedId === item.id}
            hasChildren={!isLeaf}
            onSelect={onSelect}
            onExpand={onExpand}
          />
        ))}
      </View>
    </View>
  );
});

// ────────────────────────────────────────────
// CascadingSectorPicker — 단일 선택 모드
//
// StockDetailSheet의 섹터 보정에 사용.
// L4 클릭 시 즉시 onConfirm, 중간 단계에서도 "이 레벨로 확정" 가능.
// [023] 상단 검색 필드 추가 — 검색 결과에서 탭하면 즉시 onConfirm
// ────────────────────────────────────────────

interface CascadingSectorPickerProps {
  onConfirm: (sector: Sector) => void;
  onCancel: () => void;
}

export const CascadingSectorPicker = React.memo(function CascadingSectorPicker({
  onConfirm,
  onCancel,
}: CascadingSectorPickerProps) {
  const [selectedL1, setSelectedL1] = useState<Sector | null>(null);
  const [selectedL2, setSelectedL2] = useState<Sector | null>(null);
  const [selectedL3, setSelectedL3] = useState<Sector | null>(null);

  const [l1List, setL1List] = useState<Sector[]>([]);
  const [l2List, setL2List] = useState<Sector[]>([]);
  const [l3List, setL3List] = useState<Sector[]>([]);
  const [l4List, setL4List] = useState<Sector[]>([]);

  const [l1Loading, setL1Loading] = useState(true);
  const [l2Loading, setL2Loading] = useState(false);
  const [l3Loading, setL3Loading] = useState(false);
  const [l4Loading, setL4Loading] = useState(false);

  const { query, setQuery, clearQuery, results, loading: searchLoading, error: searchError, isSearchMode } =
    useSectorSearch();

  useEffect(() => {
    setL1Loading(true);
    getSectors({ level: 1 })
      .then(setL1List)
      .catch(() => {})
      .finally(() => setL1Loading(false));
  }, []);

  const handleSelectL1 = useCallback((sector: Sector) => {
    setSelectedL1(sector);
    setSelectedL2(null);
    setSelectedL3(null);
    setL2List([]);
    setL3List([]);
    setL4List([]);
    setL2Loading(true);
    getSectors({ level: 2, parent_id: sector.id })
      .then(setL2List)
      .catch(() => {})
      .finally(() => setL2Loading(false));
  }, []);

  const handleSelectL2 = useCallback((sector: Sector) => {
    setSelectedL2(sector);
    setSelectedL3(null);
    setL3List([]);
    setL4List([]);
    setL3Loading(true);
    getSectors({ level: 3, parent_id: sector.id })
      .then(setL3List)
      .catch(() => {})
      .finally(() => setL3Loading(false));
  }, []);

  const handleSelectL3 = useCallback((sector: Sector) => {
    setSelectedL3(sector);
    setL4List([]);
    setL4Loading(true);
    getSectors({ level: 4, parent_id: sector.id })
      .then(setL4List)
      .catch(() => {})
      .finally(() => setL4Loading(false));
  }, []);

  // 확정 가능한 가장 하위 선택
  const confirmable: Sector | null = selectedL3 ?? selectedL2 ?? selectedL1;

  const canConfirmAtL1 = selectedL1 !== null && l2List.length === 0 && !l2Loading;
  const canConfirmAtL2 = selectedL2 !== null && l3List.length === 0 && !l3Loading;
  const canConfirmAtL3 = selectedL3 !== null && l4List.length === 0 && !l4Loading;
  const showConfirmBtn = confirmable !== null && (canConfirmAtL1 || canConfirmAtL2 || canConfirmAtL3);

  const handleConfirm = useCallback(() => {
    if (confirmable) onConfirm(confirmable);
  }, [confirmable, onConfirm]);

  // 검색 결과에서 탭 → 즉시 확정
  const handleSearchSelect = useCallback(
    (sector: Sector) => {
      onConfirm(sector);
    },
    [onConfirm],
  );

  return (
    <View style={styles.container}>
      {/* 검색 입력 필드 */}
      <SectorSearchBar query={query} onChangeText={setQuery} onClear={clearQuery} />

      {isSearchMode ? (
        /* 검색 모드 — 검색 결과 리스트 */
        <SearchResultListSingle
          results={results}
          loading={searchLoading}
          error={searchError}
          onSelect={handleSearchSelect}
        />
      ) : (
        /* cascading 모드 */
        <>
          <PickerLevel
            label="L1 · Sector"
            items={l1List}
            selected={selectedL1}
            loading={l1Loading}
            onSelect={handleSelectL1}
          />

          {selectedL1 !== null && (
            <PickerLevel
              label="L2 · Industry Group"
              items={l2List}
              selected={selectedL2}
              loading={l2Loading}
              emptyNote="하위 항목 없음"
              onSelect={handleSelectL2}
            />
          )}

          {selectedL2 !== null && (
            <PickerLevel
              label="L3 · Industry"
              items={l3List}
              selected={selectedL3}
              loading={l3Loading}
              emptyNote="하위 항목 없음"
              onSelect={handleSelectL3}
            />
          )}

          {selectedL3 !== null && (
            <PickerLevel
              label="L4 · Sub-Industry"
              items={l4List}
              selected={null}
              loading={l4Loading}
              emptyNote="하위 항목 없음"
              onSelect={onConfirm}
            />
          )}

          {showConfirmBtn && confirmable && (
            <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirm}>
              <Text style={styles.confirmBtnText}>
                '{confirmable.name}'(으)로 확정
              </Text>
            </TouchableOpacity>
          )}
        </>
      )}

      <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
        <Text style={styles.cancelBtnText}>취소</Text>
      </TouchableOpacity>
    </View>
  );
});

// ────────────────────────────────────────────
// CascadingSectorMultiPicker — 복수 선택 모드
//
// MemoEditScreen 섹터 연결에 사용.
// L1~L4 어느 레벨이든 독립적으로 선택/해제 가능.
// [023] 상단 검색 필드 추가 — 검색 모드에서도 onToggle 동일 동작
// ────────────────────────────────────────────

interface CascadingSectorMultiPickerProps {
  /** 현재 선택된 섹터 목록 */
  selectedSectors: Sector[];
  /** 섹터 선택/해제 콜백 */
  onToggle: (sector: Sector) => void;
}

export const CascadingSectorMultiPicker = React.memo(function CascadingSectorMultiPicker({
  selectedSectors,
  onToggle,
}: CascadingSectorMultiPickerProps) {
  const [expandedL1Id, setExpandedL1Id] = useState<number | null>(null);
  const [expandedL2Id, setExpandedL2Id] = useState<number | null>(null);
  const [expandedL3Id, setExpandedL3Id] = useState<number | null>(null);

  const [l1List, setL1List] = useState<Sector[]>([]);
  const [l2List, setL2List] = useState<Sector[]>([]);
  const [l3List, setL3List] = useState<Sector[]>([]);
  const [l4List, setL4List] = useState<Sector[]>([]);

  const [l1Loading, setL1Loading] = useState(true);
  const [l2Loading, setL2Loading] = useState(false);
  const [l3Loading, setL3Loading] = useState(false);
  const [l4Loading, setL4Loading] = useState(false);

  const { query, setQuery, clearQuery, results, loading: searchLoading, error: searchError, isSearchMode } =
    useSectorSearch();

  const selectedIds = useMemo(
    () => new Set(selectedSectors.map((s) => s.id)),
    [selectedSectors],
  );

  useEffect(() => {
    setL1Loading(true);
    getSectors({ level: 1 })
      .then(setL1List)
      .catch(() => {})
      .finally(() => setL1Loading(false));
  }, []);

  // L1 펼침 토글
  const handleExpandL1 = useCallback((sector: Sector) => {
    setExpandedL1Id((prev) => {
      if (prev === sector.id) {
        // 접기
        setExpandedL2Id(null);
        setExpandedL3Id(null);
        setL2List([]);
        setL3List([]);
        setL4List([]);
        return null;
      }
      // 새 L1 펼침
      setExpandedL2Id(null);
      setExpandedL3Id(null);
      setL2List([]);
      setL3List([]);
      setL4List([]);
      setL2Loading(true);
      getSectors({ level: 2, parent_id: sector.id })
        .then(setL2List)
        .catch(() => {})
        .finally(() => setL2Loading(false));
      return sector.id;
    });
  }, []);

  // L2 펼침 토글
  const handleExpandL2 = useCallback((sector: Sector) => {
    setExpandedL2Id((prev) => {
      if (prev === sector.id) {
        setExpandedL3Id(null);
        setL3List([]);
        setL4List([]);
        return null;
      }
      setExpandedL3Id(null);
      setL3List([]);
      setL4List([]);
      setL3Loading(true);
      getSectors({ level: 3, parent_id: sector.id })
        .then(setL3List)
        .catch(() => {})
        .finally(() => setL3Loading(false));
      return sector.id;
    });
  }, []);

  // L3 펼침 토글
  const handleExpandL3 = useCallback((sector: Sector) => {
    setExpandedL3Id((prev) => {
      if (prev === sector.id) {
        setL4List([]);
        return null;
      }
      setL4List([]);
      setL4Loading(true);
      getSectors({ level: 4, parent_id: sector.id })
        .then(setL4List)
        .catch(() => {})
        .finally(() => setL4Loading(false));
      return sector.id;
    });
  }, []);

  // L4 펼침 없음 (리프)
  const handleExpandL4 = useCallback((_sector: Sector) => {}, []);

  return (
    <View style={styles.container}>
      {/* 검색 입력 필드 */}
      <SectorSearchBar query={query} onChangeText={setQuery} onClear={clearQuery} />

      {isSearchMode ? (
        /* 검색 모드 — 검색 결과 리스트 */
        <SearchResultListMulti
          results={results}
          selectedIds={selectedIds}
          loading={searchLoading}
          error={searchError}
          onToggle={onToggle}
        />
      ) : (
        /* cascading 모드 */
        <>
          {/* L1 */}
          <MultiPickerLevel
            label="L1 · Sector"
            items={l1List}
            selectedIds={selectedIds}
            expandedId={expandedL1Id}
            loading={l1Loading}
            isLeaf={false}
            onSelect={onToggle}
            onExpand={handleExpandL1}
          />

          {/* L2 — L1 펼쳤을 때 */}
          {expandedL1Id !== null && (
            <MultiPickerLevel
              label="L2 · Industry Group"
              items={l2List}
              selectedIds={selectedIds}
              expandedId={expandedL2Id}
              loading={l2Loading}
              emptyNote="하위 항목 없음"
              isLeaf={false}
              indent
              onSelect={onToggle}
              onExpand={handleExpandL2}
            />
          )}

          {/* L3 — L2 펼쳤을 때 */}
          {expandedL2Id !== null && (
            <MultiPickerLevel
              label="L3 · Industry"
              items={l3List}
              selectedIds={selectedIds}
              expandedId={expandedL3Id}
              loading={l3Loading}
              emptyNote="하위 항목 없음"
              isLeaf={false}
              indent
              onSelect={onToggle}
              onExpand={handleExpandL3}
            />
          )}

          {/* L4 — L3 펼쳤을 때 */}
          {expandedL3Id !== null && (
            <MultiPickerLevel
              label="L4 · Sub-Industry"
              items={l4List}
              selectedIds={selectedIds}
              expandedId={null}
              loading={l4Loading}
              emptyNote="하위 항목 없음"
              isLeaf
              indent
              onSelect={onToggle}
              onExpand={handleExpandL4}
            />
          )}
        </>
      )}
    </View>
  );
});

// ────────────────────────────────────────────
// 검색 관련 스타일
// ────────────────────────────────────────────

const searchStyles = StyleSheet.create({
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f4ff',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#dce9ff',
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: '#0b1c30',
    paddingVertical: 10,
  },
  clearBtn: {
    padding: 6,
  },
  clearBtnText: {
    fontSize: 12,
    color: '#737688',
    fontWeight: '700',
  },
  resultList: {
    gap: 2,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5eeff',
    backgroundColor: '#ffffff',
  },
  resultItemSelected: {
    backgroundColor: '#eff4ff',
    borderColor: '#003ec7',
  },
  resultLeft: {
    flex: 1,
    marginRight: 8,
  },
  resultRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  breadcrumbRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  breadcrumbItem: {
    fontSize: 13,
    color: '#737688',
  },
  breadcrumbItemMatched: {
    fontWeight: '700',
    color: '#003ec7',
  },
  breadcrumbSeparator: {
    fontSize: 12,
    color: '#b0b3c6',
  },
  levelBadge: {
    backgroundColor: '#dce9ff',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  levelBadgeSelected: {
    backgroundColor: '#003ec7',
  },
  levelBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#003ec7',
  },
  levelBadgeTextSelected: {
    color: '#ffffff',
  },
  checkMark: {
    fontSize: 13,
    color: '#003ec7',
    fontWeight: '700',
  },
  centerBox: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: '#737688',
  },
  errorText: {
    fontSize: 13,
    color: '#93000a',
  },
});

// ────────────────────────────────────────────
// cascading 스타일
// ────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  levelSection: {
    gap: 8,
  },
  levelSectionIndent: {
    paddingLeft: 12,
    borderLeftWidth: 2,
    borderLeftColor: '#dce9ff',
    marginLeft: 4,
  },
  levelLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#737688',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  // 단일 선택 모드 칩 (PickerLevel에서 사용)
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 9999,
    borderWidth: 1.5,
    borderColor: '#c3c5d9',
    backgroundColor: '#ffffff',
  },
  chipSelected: {
    backgroundColor: '#003ec7',
    borderColor: '#003ec7',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#434656',
  },
  chipTextSelected: {
    color: '#ffffff',
  },
  chipTextExpanded: {
    color: '#003ec7',
  },
  emptyNote: {
    fontSize: 12,
    color: '#737688',
    fontStyle: 'italic',
  },
  // 복수 선택 모드 — wrapper (선택 + 펼침 버튼 묶음)
  multiChipWrapper: {
    flexDirection: 'row',
    borderRadius: 9999,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#c3c5d9',
  },
  multiChipWrapperSelected: {
    borderColor: '#003ec7',
  },
  multiChipWrapperExpanded: {
    borderColor: '#003ec7',
  },
  multiChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
  },
  multiChipSelected: {
    backgroundColor: '#003ec7',
  },
  multiChipExpanded: {
    backgroundColor: '#eff4ff',
  },
  expandBtn: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderLeftWidth: 1,
    borderLeftColor: '#c3c5d9',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandBtnSelected: {
    backgroundColor: '#003ec7',
    borderLeftColor: 'rgba(255,255,255,0.3)',
  },
  expandBtnExpanded: {
    backgroundColor: '#eff4ff',
    borderLeftColor: '#c3c5d9',
  },
  expandBtnText: {
    fontSize: 8,
    color: '#737688',
  },
  expandBtnTextActive: {
    color: '#003ec7',
  },
  // 선택 상태(배경 #003ec7)에서 화살표 흰색
  expandBtnTextSelected: {
    color: '#ffffff',
  },
  // 단일 선택 모드 — 확정/취소 버튼
  confirmBtn: {
    backgroundColor: '#14B8A6',
    borderRadius: 9999,
    paddingVertical: 14,
    alignItems: 'center' as const,
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: '#ffffff',
  },
  cancelBtn: {
    paddingVertical: 12,
    alignItems: 'center' as const,
  },
  cancelBtnText: {
    fontSize: 14,
    color: '#737688',
    fontWeight: '600' as const,
  },
});
