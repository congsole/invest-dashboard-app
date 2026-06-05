/**
 * StockSearchModal.tsx — 종목 검색 모달
 *
 * 이슈 013: 종목 검색 UI 컴포넌트
 * 이슈 018: SectorPicker → cascading select(L1→L2→L3→L4) 변경
 *           naver_industry → yfinance_sector/yfinance_industry 수정
 *
 * 기능:
 * - 검색어 2자 이상 → 로컬 DB 검색 (디바운스 300ms, useStockSearch 훅 사용)
 * - 로컬 결과 0건 → 외부 FastAPI 자동 전환
 * - 외부 검색 결과에 "추가" 칩 표시
 * - 종목 선택 후 sector_id가 null이면 cascading 섹터 선택 UI 노출 (L1→L2→L3→L4)
 * - 섹터 선택 후 콜백으로 최종 종목 + 섹터 정보 전달
 *
 * CLAUDE.md 렌더링 최적화:
 * - React.memo + useCallback으로 불필요한 리렌더링 방지
 * - 로딩 상태: localLoading (로컬+외부 통합 검색 중, 기존 결과 유지)
 * - 섹터 선택 UI는 별도 상태로 관리 (검색 결과 목록 유지)
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  SafeAreaView,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useStockSearch } from '../hooks/useStockSearch';
import { StockSearchResult, ExternalStockSearchResult, StockMarket, Sector } from '../types/sector';
import { getSectors } from '../services/sectors';
import {
  getOrRecommendStockSector,
  GetOrRecommendStockSectorInput,
} from '../services/stocks';

// ────────────────────────────────────────────
// 타입 정의
// ────────────────────────────────────────────

/**
 * 섹터 정보 (code는 API 응답 기준 string)
 */
export interface SectorInfo {
  id: number;
  code: string;
  name: string;
}

/** 모달에서 선택 완료된 종목 정보 */
export interface SelectedStockInfo {
  id: string;
  ticker: string;
  name: string;
  market: StockMarket;
  currency: string;
  sector_id: number | null;
  /** 사용자가 수동으로 지정한 섹터 (sector_id가 null이었던 경우) */
  assigned_sector: SectorInfo | null;
}

interface StockSearchModalProps {
  visible: boolean;
  /** 이미 선택된 종목 ID 목록 (중복 제외용) */
  excludeIds: string[];
  onClose: () => void;
  onSelect: (stock: SelectedStockInfo) => void;
}

// ────────────────────────────────────────────
// Cascading 섹터 선택 패널 (L1 → L2 → L3 → L4)
// sector_id가 null일 때 노출
// ────────────────────────────────────────────

interface CascadingSectorPickerProps {
  onPick: (sector: SectorInfo) => void;
  onSkip: () => void;
}

const CascadingSectorPicker = React.memo(function CascadingSectorPicker({
  onPick,
  onSkip,
}: CascadingSectorPickerProps) {
  // 각 레벨의 선택된 섹터
  const [selectedL1, setSelectedL1] = useState<Sector | null>(null);
  const [selectedL2, setSelectedL2] = useState<Sector | null>(null);
  const [selectedL3, setSelectedL3] = useState<Sector | null>(null);

  // 각 레벨의 목록
  const [l1List, setL1List] = useState<Sector[]>([]);
  const [l2List, setL2List] = useState<Sector[]>([]);
  const [l3List, setL3List] = useState<Sector[]>([]);
  const [l4List, setL4List] = useState<Sector[]>([]);

  // 각 레벨 로딩 상태
  const [l1Loading, setL1Loading] = useState(true);
  const [l2Loading, setL2Loading] = useState(false);
  const [l3Loading, setL3Loading] = useState(false);
  const [l4Loading, setL4Loading] = useState(false);

  // L1 목록 초기 로드
  React.useEffect(() => {
    setL1Loading(true);
    getSectors({ level: 1 })
      .then(setL1List)
      .catch(() => {})
      .finally(() => setL1Loading(false));
  }, []);

  // L1 선택 핸들러
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

  // L2 선택 핸들러
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

  // L3 선택 핸들러
  const handleSelectL3 = useCallback((sector: Sector) => {
    setSelectedL3(sector);
    setL4List([]);
    setL4Loading(true);
    getSectors({ level: 4, parent_id: sector.id })
      .then(setL4List)
      .catch(() => {})
      .finally(() => setL4Loading(false));
  }, []);

  // L4 선택 핸들러
  const handleSelectL4 = useCallback((sector: Sector) => {
    onPick({ id: sector.id, code: sector.code, name: sector.name });
  }, [onPick]);

  // 현재 단계 선택 완료 버튼 (L1 선택 후 L2 없이 바로 확정 가능)
  const canConfirmAtL1 = selectedL1 !== null && l2List.length === 0 && !l2Loading;
  const canConfirmAtL2 = selectedL2 !== null && l3List.length === 0 && !l3Loading;
  const canConfirmAtL3 = selectedL3 !== null && l4List.length === 0 && !l4Loading;

  // 현재 확정 가능한 섹터 (가장 하위 선택된 것)
  const confirmable: Sector | null = selectedL3 ?? selectedL2 ?? selectedL1;

  const handleConfirmCurrent = useCallback(() => {
    if (!confirmable) return;
    onPick({ id: confirmable.id, code: confirmable.code, name: confirmable.name });
  }, [confirmable, onPick]);

  const levelLabel = (level: number) => {
    switch (level) {
      case 1: return 'Sector';
      case 2: return 'Industry Group';
      case 3: return 'Industry';
      case 4: return 'Sub-Industry';
      default: return '';
    }
  };

  return (
    <View style={cascadeStyles.container}>
      <Text style={cascadeStyles.title}>섹터를 선택해주세요</Text>
      <Text style={cascadeStyles.subtitle}>
        이 종목의 섹터 정보가 없습니다. L1(Sector)부터 순서대로 선택하세요.
      </Text>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={cascadeStyles.scrollContent}>

        {/* L1 선택 */}
        <SectorLevelSection
          levelLabel={`L1 · ${levelLabel(1)}`}
          sectors={l1List}
          selected={selectedL1}
          loading={l1Loading}
          onSelect={handleSelectL1}
        />

        {/* L2 선택 (L1 선택 후 노출) */}
        {selectedL1 !== null && (
          <SectorLevelSection
            levelLabel={`L2 · ${levelLabel(2)}`}
            sectors={l2List}
            selected={selectedL2}
            loading={l2Loading}
            emptyMessage="하위 항목 없음 — 현재 선택으로 확정할 수 있습니다"
            onSelect={handleSelectL2}
          />
        )}

        {/* L3 선택 (L2 선택 후 노출) */}
        {selectedL2 !== null && (
          <SectorLevelSection
            levelLabel={`L3 · ${levelLabel(3)}`}
            sectors={l3List}
            selected={selectedL3}
            loading={l3Loading}
            emptyMessage="하위 항목 없음 — 현재 선택으로 확정할 수 있습니다"
            onSelect={handleSelectL3}
          />
        )}

        {/* L4 선택 (L3 선택 후 노출) */}
        {selectedL3 !== null && (
          <SectorLevelSection
            levelLabel={`L4 · ${levelLabel(4)}`}
            sectors={l4List}
            selected={null}
            loading={l4Loading}
            emptyMessage="하위 항목 없음 — 현재 선택으로 확정할 수 있습니다"
            onSelect={handleSelectL4}
          />
        )}

        {/* 현재 선택으로 확정 버튼 (하위 없거나 로딩 완료 후) */}
        {confirmable !== null && (canConfirmAtL1 || canConfirmAtL2 || canConfirmAtL3) && (
          <TouchableOpacity style={cascadeStyles.confirmBtn} onPress={handleConfirmCurrent}>
            <Text style={cascadeStyles.confirmBtnText}>
              '{confirmable.name}'(으)로 확정
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <TouchableOpacity style={cascadeStyles.skipBtn} onPress={onSkip}>
        <Text style={cascadeStyles.skipText}>섹터 없이 추가</Text>
      </TouchableOpacity>
    </View>
  );
});

// ── 섹터 레벨 섹션 ──

interface SectorLevelSectionProps {
  levelLabel: string;
  sectors: Sector[];
  selected: Sector | null;
  loading: boolean;
  emptyMessage?: string;
  onSelect: (sector: Sector) => void;
}

const SectorLevelSection = React.memo(function SectorLevelSection({
  levelLabel,
  sectors,
  selected,
  loading,
  emptyMessage,
  onSelect,
}: SectorLevelSectionProps) {
  if (loading) {
    return (
      <View style={cascadeStyles.levelSection}>
        <Text style={cascadeStyles.levelLabel}>{levelLabel}</Text>
        <ActivityIndicator size="small" color="#003ec7" style={{ marginTop: 8 }} />
      </View>
    );
  }

  if (sectors.length === 0) {
    return emptyMessage ? (
      <View style={cascadeStyles.levelSection}>
        <Text style={cascadeStyles.levelLabel}>{levelLabel}</Text>
        <Text style={cascadeStyles.emptyMessage}>{emptyMessage}</Text>
      </View>
    ) : null;
  }

  return (
    <View style={cascadeStyles.levelSection}>
      <Text style={cascadeStyles.levelLabel}>{levelLabel}</Text>
      <View style={cascadeStyles.chipRow}>
        {sectors.map((sec) => {
          const isSelected = selected?.id === sec.id;
          return (
            <TouchableOpacity
              key={sec.id}
              style={[cascadeStyles.chip, isSelected && cascadeStyles.chipSelected]}
              onPress={() => onSelect(sec)}
              activeOpacity={0.7}
            >
              <Text style={[cascadeStyles.chipText, isSelected && cascadeStyles.chipTextSelected]}>
                {sec.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
});

const cascadeStyles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0b1c30',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: '#737688',
    marginBottom: 16,
    lineHeight: 18,
  },
  scrollContent: {
    gap: 16,
    paddingBottom: 16,
  },
  levelSection: {
    gap: 8,
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
  emptyMessage: {
    fontSize: 12,
    color: '#737688',
    fontStyle: 'italic',
  },
  confirmBtn: {
    backgroundColor: '#14B8A6',
    borderRadius: 9999,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  skipBtn: {
    paddingVertical: 16,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#e5eeff',
    marginBottom: 8,
  },
  skipText: {
    fontSize: 14,
    color: '#737688',
    fontWeight: '600',
  },
});

// ────────────────────────────────────────────
// 검색 결과 아이템 — 로컬 종목
// ────────────────────────────────────────────

interface LocalResultItemProps {
  item: StockSearchResult;
  onPress: (item: StockSearchResult) => void;
}

const LocalResultItem = React.memo(function LocalResultItem({
  item,
  onPress,
}: LocalResultItemProps) {
  const handlePress = useCallback(() => onPress(item), [item, onPress]);

  return (
    <TouchableOpacity style={resultItemStyles.container} onPress={handlePress} activeOpacity={0.7}>
      <View style={resultItemStyles.left}>
        <Text style={resultItemStyles.ticker}>{item.ticker}</Text>
        <View style={resultItemStyles.marketBadge}>
          <Text style={resultItemStyles.marketText}>{item.market}</Text>
        </View>
      </View>
      <View style={resultItemStyles.right}>
        <Text style={resultItemStyles.name} numberOfLines={1}>
          {item.name}
        </Text>
        {item.sectors && (
          <Text style={resultItemStyles.sector} numberOfLines={1}>
            {item.sectors.name}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
});

// ────────────────────────────────────────────
// 검색 결과 아이템 — 외부 종목 ("추가" 칩 표시)
// ────────────────────────────────────────────

interface ExternalResultItemProps {
  item: ExternalStockSearchResult;
  onPress: (item: ExternalStockSearchResult) => void;
}

const ExternalResultItem = React.memo(function ExternalResultItem({
  item,
  onPress,
}: ExternalResultItemProps) {
  const handlePress = useCallback(() => onPress(item), [item, onPress]);

  return (
    <TouchableOpacity style={resultItemStyles.container} onPress={handlePress} activeOpacity={0.7}>
      <View style={resultItemStyles.left}>
        <Text style={resultItemStyles.ticker}>{item.ticker}</Text>
        <View style={resultItemStyles.marketBadge}>
          <Text style={resultItemStyles.marketText}>{item.market}</Text>
        </View>
      </View>
      <View style={resultItemStyles.right}>
        <Text style={resultItemStyles.name} numberOfLines={1}>
          {item.name}
        </Text>
      </View>
      {/* "추가" 칩 — 외부 검색 결과 전용 */}
      <View style={resultItemStyles.addChip}>
        <Text style={resultItemStyles.addChipText}>추가</Text>
      </View>
    </TouchableOpacity>
  );
});

const resultItemStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e5eeff',
    gap: 12,
  },
  left: {
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
  right: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 14,
    color: '#0b1c30',
    fontWeight: '500',
  },
  sector: {
    fontSize: 11,
    color: '#737688',
  },
  addChip: {
    backgroundColor: '#e8f5e9',
    borderRadius: 9999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  addChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#22C55E',
  },
});

// ────────────────────────────────────────────
// StockSearchModal (메인)
// ────────────────────────────────────────────

type ModalPhase = 'search' | 'sector-pick' | 'registering';

export function StockSearchModal({
  visible,
  excludeIds,
  onClose,
  onSelect,
}: StockSearchModalProps) {
  const { query, setQuery, reset, localResults, externalResults, source, localLoading, error } =
    useStockSearch();

  const [phase, setPhase] = useState<ModalPhase>('search');
  const [pendingStock, setPendingStock] = useState<SelectedStockInfo | null>(null);

  // 모달 닫힐 때 상태 초기화
  React.useEffect(() => {
    if (!visible) {
      reset();
      setPhase('search');
      setPendingStock(null);
    }
  }, [visible, reset]);

  // 이미 선택된 종목 제외 (로컬 결과)
  const filteredLocalResults = useMemo(
    () => localResults.filter((s) => !excludeIds.includes(s.id)),
    [localResults, excludeIds],
  );

  // 로컬 종목 선택 처리
  const handleLocalSelect = useCallback(
    (item: StockSearchResult) => {
      const stockInfo: SelectedStockInfo = {
        id: item.id,
        ticker: item.ticker,
        name: item.name,
        market: item.market,
        currency: item.currency,
        sector_id: item.sector_id,
        assigned_sector: item.sectors
          ? { id: item.sectors.id, code: item.sectors.code, name: item.sectors.name }
          : null,
      };

      if (item.sector_id === null) {
        // 섹터 미설정 → cascading 섹터 선택 UI 노출
        setPendingStock(stockInfo);
        setPhase('sector-pick');
      } else {
        onSelect(stockInfo);
        onClose();
      }
    },
    [onSelect, onClose],
  );

  // 외부 종목 선택 처리 (FastAPI 등록 경유)
  // [016] naver_industry → yfinance_sector / yfinance_industry
  const handleExternalSelect = useCallback(
    async (item: ExternalStockSearchResult) => {
      setPhase('registering');
      try {
        const input: GetOrRecommendStockSectorInput = {
          ticker: item.ticker,
          market: item.market,
          name: item.name,
          currency: item.currency,
          yfinance_sector: item.yfinance_sector ?? null,
          yfinance_industry: item.yfinance_industry ?? null,
        };
        const result = await getOrRecommendStockSector(input);

        const stockInfo: SelectedStockInfo = {
          id: result.id,
          ticker: result.ticker,
          name: result.name,
          market: result.market,
          currency: result.currency,
          sector_id: result.sector_id,
          assigned_sector: result.recommended_sector
            ? {
                id: result.recommended_sector.id,
                code: result.recommended_sector.code,
                name: result.recommended_sector.name,
              }
            : null,
        };

        if (result.sector_id === null) {
          // 섹터 추천 불가 → cascading 섹터 선택 UI 노출
          setPendingStock(stockInfo);
          setPhase('sector-pick');
        } else {
          onSelect(stockInfo);
          onClose();
        }
      } catch {
        // 등록 실패 시 검색 화면으로 복귀
        setPhase('search');
      }
    },
    [onSelect, onClose],
  );

  // 섹터 선택 완료 (cascading picker에서 최하위 선택)
  const handleSectorPick = useCallback(
    (sector: SectorInfo) => {
      if (!pendingStock) return;
      onSelect({
        ...pendingStock,
        sector_id: sector.id,
        assigned_sector: sector,
      });
      onClose();
    },
    [pendingStock, onSelect, onClose],
  );

  // 섹터 없이 추가
  const handleSectorSkip = useCallback(() => {
    if (!pendingStock) return;
    onSelect(pendingStock);
    onClose();
  }, [pendingStock, onSelect, onClose]);

  // 헤더 뒤로가기 (섹터 선택 → 검색)
  const handleBack = useCallback(() => {
    setPhase('search');
    setPendingStock(null);
  }, []);

  // 결과 없음 메시지
  const showEmpty =
    query.trim().length >= 2 &&
    !localLoading &&
    filteredLocalResults.length === 0 &&
    externalResults.length === 0;

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
          {phase === 'sector-pick' ? (
            <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
              <Text style={styles.backText}>{'< 검색'}</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.backBtn} />
          )}
          <Text style={styles.headerTitle}>
            {phase === 'search' || phase === 'registering' ? '종목 연결' : '섹터 선택'}
          </Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>닫기</Text>
          </TouchableOpacity>
        </View>

        {/* 등록 중 스피너 */}
        {phase === 'registering' && (
          <View style={styles.registeringOverlay}>
            <ActivityIndicator size="large" color="#003ec7" />
            <Text style={styles.registeringText}>종목 등록 중...</Text>
          </View>
        )}

        {/* cascading 섹터 선택 패널 */}
        {phase === 'sector-pick' && (
          <CascadingSectorPicker
            onPick={handleSectorPick}
            onSkip={handleSectorSkip}
          />
        )}

        {/* 검색 패널 */}
        {(phase === 'search') && (
          <>
            {/* 검색 입력 */}
            <View style={styles.searchRow}>
              <TextInput
                style={styles.searchInput}
                placeholder="종목명 또는 티커 입력 (2자 이상)"
                placeholderTextColor="#737688"
                value={query}
                onChangeText={setQuery}
                autoFocus
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
              />
              {localLoading && (
                <ActivityIndicator
                  style={styles.searchSpinner}
                  color="#003ec7"
                  size="small"
                />
              )}
            </View>

            {/* 검색 출처 표시 */}
            {source === 'external' && externalResults.length > 0 && (
              <View style={styles.sourceLabel}>
                <Text style={styles.sourceLabelText}>외부 검색 결과 — 항목을 선택하면 DB에 추가됩니다</Text>
              </View>
            )}

            {/* 에러 */}
            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* 결과 없음 */}
            {showEmpty && (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>검색 결과가 없습니다</Text>
              </View>
            )}

            {/* 로컬 검색 결과 */}
            {source === 'local' && (
              <FlatList
                data={filteredLocalResults}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <LocalResultItem item={item} onPress={handleLocalSelect} />
                )}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              />
            )}

            {/* 외부 검색 결과 */}
            {source === 'external' && (
              <FlatList
                data={externalResults}
                keyExtractor={(item) => `${item.ticker}-${item.market}`}
                renderItem={({ item }) => (
                  <ExternalResultItem item={item} onPress={handleExternalSelect} />
                )}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              />
            )}
          </>
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
  backBtn: {
    minWidth: 60,
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
  },
  closeBtn: {
    minWidth: 60,
    alignItems: 'flex-end',
  },
  closeText: {
    fontSize: 14,
    color: '#003ec7',
    fontWeight: '600',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginVertical: 12,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#dce9ff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: '#0b1c30',
  },
  searchSpinner: {
    marginLeft: 10,
  },
  sourceLabel: {
    marginHorizontal: 20,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#e8f5e9',
    borderRadius: 8,
  },
  sourceLabelText: {
    fontSize: 11,
    color: '#22C55E',
    fontWeight: '600',
  },
  errorBox: {
    marginHorizontal: 20,
    marginBottom: 8,
    padding: 12,
    backgroundColor: '#ffdad6',
    borderRadius: 10,
  },
  errorText: {
    fontSize: 12,
    color: '#93000a',
  },
  emptyBox: {
    alignItems: 'center',
    marginTop: 48,
  },
  emptyText: {
    fontSize: 14,
    color: '#737688',
  },
  registeringOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  registeringText: {
    fontSize: 15,
    color: '#737688',
  },
});
