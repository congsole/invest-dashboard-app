/**
 * MemoEditScreen.tsx — 메모 작성/편집 화면
 *
 * - 본문 입력
 * - 엔티티 연결 선택 (종목/섹터, 복수 선택)
 * - 종목 선택 시 목표가 입력 필드 노출
 * - 생성 모드: memoId === undefined
 * - 편집 모드: memoId가 전달됨 → 상세 조회 후 초기값 설정
 * - 수정/삭제 기능 포함
 *
 * [013] StockSearchModal 컴포넌트로 교체:
 * - 로컬 → 외부 자동전환 검색
 * - "추가" 칩으로 외부 검색 결과 구분
 * - sector_id null 시 섹터 선택 드롭다운 자동 노출
 *
 * [019] 섹터 연결 L1~L4 cascading multi-select로 변경:
 * - CascadingSectorMultiPicker 사용
 * - L1~L4 어느 레벨이든 선택 가능
 * - 선택된 섹터는 selectedSectors 배열로 관리
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useMemoDetail } from '../hooks/useMemoDetail';
import { useMemoMutation } from '../hooks/useMemoMutation';
import { Sector } from '../types/sector';
import { MemoStockInput, ENTITY_COLORS } from '../types/memo';
import { EntityChip } from '../components/EntityChip';
import { StockSearchModal, SelectedStockInfo } from '../components/StockSearchModal';
import { CascadingSectorMultiPicker } from '../components/CascadingSectorPicker';

// ────────────────────────────────────────────
// 연결 종목 상태 (goal_price 포함)
// ────────────────────────────────────────────

interface SelectedStock {
  stock_id: string;
  ticker: string;
  name: string;
  market: 'KR' | 'US' | 'CRYPTO';
  sector_id: number | null;
  goal_price: string; // 입력 문자열
}

// ────────────────────────────────────────────
// Props
// ────────────────────────────────────────────

interface MemoEditScreenProps {
  memoId?: string;         // 편집 모드 시 전달
  onSaved: () => void;
  onDeleted?: () => void;
  onBack: () => void;
}

// ────────────────────────────────────────────
// MemoEditScreen
// ────────────────────────────────────────────

export function MemoEditScreen({ memoId, onSaved, onDeleted, onBack }: MemoEditScreenProps) {
  const isEdit = memoId !== undefined;
  const { memo: existingMemo, loading: detailLoading, fetch: fetchDetail } = useMemoDetail();
  const { loading: mutLoading, error: mutError, create, update, remove } = useMemoMutation();

  const [body, setBody] = useState('');
  const [selectedStocks, setSelectedStocks] = useState<SelectedStock[]>([]);
  // [019] 섹터 연결: sector id 배열 대신 Sector 객체 배열로 관리 (레벨 표시 등 메타 활용)
  const [selectedSectors, setSelectedSectors] = useState<Sector[]>([]);
  const [stockModalVisible, setStockModalVisible] = useState(false);

  // 편집 모드: 기존 데이터 로드
  useEffect(() => {
    if (isEdit && memoId) {
      fetchDetail(memoId);
    }
  }, [isEdit, memoId, fetchDetail]);

  // 기존 데이터로 폼 초기화
  useEffect(() => {
    if (!existingMemo) return;
    setBody(existingMemo.body);
    setSelectedStocks(
      existingMemo.memo_stocks.map((ms) => ({
        stock_id: ms.stock_id,
        ticker: ms.stocks.ticker,
        name: ms.stocks.name,
        market: ms.stocks.market,
        sector_id: null,
        goal_price: ms.goal_price !== null ? String(ms.goal_price) : '',
      })),
    );
    // [019] memo_sectors → Sector 객체로 변환 (level 포함)
    setSelectedSectors(
      existingMemo.memo_sectors.map((ms) => ({
        id: ms.sector_id,
        code: ms.sectors.code,
        name: ms.sectors.name,
        name_en: null,
        parent_id: null,
        level: ms.sectors.level,
      })),
    );
  }, [existingMemo]);

  // ── 종목 선택 (StockSearchModal 콜백) ──
  const handleStockSelect = useCallback((stockInfo: SelectedStockInfo) => {
    setSelectedStocks((prev) => {
      // 이미 선택된 종목이면 무시
      if (prev.some((s) => s.stock_id === stockInfo.id)) return prev;
      return [
        ...prev,
        {
          stock_id: stockInfo.id,
          ticker: stockInfo.ticker,
          name: stockInfo.name,
          market: stockInfo.market,
          sector_id: stockInfo.sector_id,
          goal_price: '',
        },
      ];
    });
  }, []);

  const handleRemoveStock = useCallback((stockId: string) => {
    setSelectedStocks((prev) => prev.filter((s) => s.stock_id !== stockId));
  }, []);

  const handleGoalPriceChange = useCallback((stockId: string, value: string) => {
    setSelectedStocks((prev) =>
      prev.map((s) => (s.stock_id === stockId ? { ...s, goal_price: value } : s)),
    );
  }, []);

  // ── 섹터 토글 (CascadingSectorMultiPicker 콜백) ──
  const handleSectorToggle = useCallback((sector: Sector) => {
    setSelectedSectors((prev) => {
      const exists = prev.some((s) => s.id === sector.id);
      return exists ? prev.filter((s) => s.id !== sector.id) : [...prev, sector];
    });
  }, []);

  // p_sector_ids: selectedSectors에서 id 배열 추출
  const selectedSectorIds = useMemo(
    () => selectedSectors.map((s) => s.id),
    [selectedSectors],
  );

  // ── 저장 ──
  const handleSave = useCallback(async () => {
    const trimmedBody = body.trim();
    if (!trimmedBody) {
      Alert.alert('알림', '메모 내용을 입력해주세요');
      return;
    }

    const stocksInput: MemoStockInput[] = selectedStocks.map((s) => ({
      stock_id: s.stock_id,
      goal_price: s.goal_price ? parseFloat(s.goal_price) : null,
    }));

    if (isEdit && memoId) {
      const result = await update({
        p_memo_id: memoId,
        p_body: trimmedBody,
        p_stocks: stocksInput,
        p_sector_ids: selectedSectorIds,
        p_trade_event_ids: null, // 수정 시 매매이벤트 연결은 유지
        p_news_ids: null,
      });
      if (result) onSaved();
    } else {
      const result = await create({
        p_body: trimmedBody,
        p_stocks: stocksInput,
        p_sector_ids: selectedSectorIds,
      });
      if (result) onSaved();
    }
  }, [body, selectedStocks, selectedSectorIds, isEdit, memoId, create, update, onSaved]);

  // ── 삭제 ──
  const handleDelete = useCallback(() => {
    Alert.alert('메모 삭제', '이 메모를 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          if (!memoId) return;
          const success = await remove(memoId);
          if (success && onDeleted) onDeleted();
        },
      },
    ]);
  }, [memoId, remove, onDeleted]);

  const isLoading = mutLoading || detailLoading;
  const excludeIds = selectedStocks.map((s) => s.stock_id);

  if (isEdit && detailLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#003ec7" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Text style={styles.backIcon}>{'<'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{isEdit ? '메모 편집' : '메모 작성'}</Text>
        <View style={styles.headerRight}>
          {isEdit && (
            <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete} disabled={isLoading}>
              <Text style={styles.deleteBtnText}>삭제</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* 본문 입력 */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>내용</Text>
          <TextInput
            style={styles.bodyInput}
            placeholder="투자 메모를 작성하세요..."
            placeholderTextColor="#737688"
            multiline
            numberOfLines={6}
            textAlignVertical="top"
            value={body}
            onChangeText={setBody}
          />
        </View>

        {/* 종목 연결 */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionLabel}>종목 연결</Text>
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => setStockModalVisible(true)}
            >
              <Text style={styles.addBtnText}>+ 추가</Text>
            </TouchableOpacity>
          </View>

          {selectedStocks.length === 0 ? (
            <Text style={styles.emptyHint}>연결할 종목을 추가하세요</Text>
          ) : (
            <View style={styles.stockList}>
              {selectedStocks.map((stock) => (
                <View key={stock.stock_id} style={styles.stockItem}>
                  <View style={styles.stockInfo}>
                    <EntityChip
                      entityType="stock"
                      label={`${stock.ticker} ${stock.name}`}
                    />
                    <TouchableOpacity
                      style={styles.removeBtn}
                      onPress={() => handleRemoveStock(stock.stock_id)}
                    >
                      <Text style={styles.removeBtnText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                  {/* 목표가 입력 */}
                  <View style={styles.goalPriceRow}>
                    <Text style={styles.goalPriceLabel}>목표가 (선택)</Text>
                    <TextInput
                      style={styles.goalPriceInput}
                      placeholder="예: 80000"
                      placeholderTextColor="#737688"
                      keyboardType="decimal-pad"
                      value={stock.goal_price}
                      onChangeText={(v) => handleGoalPriceChange(stock.stock_id, v)}
                    />
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* 섹터 연결 — [019] L1~L4 cascading multi-select */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionLabel}>섹터 연결</Text>
            {selectedSectors.length > 0 && (
              <Text style={styles.sectorHint}>
                {selectedSectors.length}개 선택됨
              </Text>
            )}
          </View>

          {/* 선택된 섹터 목록 (레벨 배지 표시) */}
          {selectedSectors.length > 0 && (
            <View style={styles.selectedSectorList}>
              {selectedSectors.map((sec) => (
                <View key={sec.id} style={styles.selectedSectorItem}>
                  <View style={styles.selectedSectorLeft}>
                    <View style={styles.levelBadge}>
                      <Text style={styles.levelBadgeText}>L{sec.level}</Text>
                    </View>
                    <Text style={styles.selectedSectorName}>{sec.name}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.removeBtn}
                    onPress={() => handleSectorToggle(sec)}
                  >
                    <Text style={styles.removeBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/* Cascading Picker */}
          <View style={styles.pickerContainer}>
            <CascadingSectorMultiPicker
              selectedSectors={selectedSectors}
              onToggle={handleSectorToggle}
            />
          </View>
        </View>

        {/* 에러 */}
        {mutError && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{mutError}</Text>
          </View>
        )}

        {/* 저장 버튼 */}
        <TouchableOpacity
          style={[styles.saveBtn, isLoading && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.saveBtnText}>{isEdit ? '수정 완료' : '저장'}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* 종목 검색 모달 (이슈 013: 로컬→외부 자동전환 + 섹터 선택) */}
      <StockSearchModal
        visible={stockModalVisible}
        excludeIds={excludeIds}
        onClose={() => setStockModalVisible(false)}
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5eeff',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#dce9ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    fontSize: 16,
    color: '#003ec7',
    fontWeight: '700',
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#0b1c30',
    textAlign: 'center',
  },
  headerRight: {
    width: 36,
    alignItems: 'flex-end',
  },
  deleteBtn: {
    paddingHorizontal: 4,
  },
  deleteBtnText: {
    fontSize: 14,
    color: '#ba1a1a',
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    gap: 24,
    paddingBottom: 48,
  },
  section: {
    gap: 10,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#737688',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bodyInput: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    fontSize: 15,
    color: '#0b1c30',
    minHeight: 140,
    borderWidth: 1,
    borderColor: '#e5eeff',
    lineHeight: 22,
  },
  addBtn: {
    backgroundColor: '#dce9ff',
    borderRadius: 9999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  addBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#003ec7',
  },
  emptyHint: {
    fontSize: 13,
    color: '#737688',
    paddingVertical: 8,
  },
  stockList: {
    gap: 10,
  },
  stockItem: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: '#e5eeff',
  },
  stockInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  removeBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#ffdad6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtnText: {
    fontSize: 11,
    color: '#ba1a1a',
    fontWeight: '700',
  },
  goalPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  goalPriceLabel: {
    fontSize: 12,
    color: '#737688',
    width: 70,
  },
  goalPriceInput: {
    flex: 1,
    backgroundColor: '#dce9ff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    fontWeight: '600',
    color: '#0b1c30',
  },
  // [019] 섹터 연결 — cascading picker 영역
  sectorHint: {
    fontSize: 12,
    color: ENTITY_COLORS.sector,
    fontWeight: '600',
  },
  selectedSectorList: {
    gap: 6,
  },
  selectedSectorItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#e5eeff',
  },
  selectedSectorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  levelBadge: {
    backgroundColor: '#dce9ff',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  levelBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#003ec7',
  },
  selectedSectorName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0b1c30',
    flex: 1,
  },
  pickerContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e5eeff',
  },
  errorBox: {
    backgroundColor: '#ffdad6',
    borderRadius: 10,
    padding: 12,
  },
  errorText: {
    fontSize: 13,
    color: '#93000a',
  },
  saveBtn: {
    backgroundColor: '#003ec7',
    borderRadius: 9999,
    paddingVertical: 18,
    alignItems: 'center',
    shadowColor: '#003ec7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  saveBtnDisabled: {
    backgroundColor: '#737688',
    shadowOpacity: 0,
    elevation: 0,
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
});
