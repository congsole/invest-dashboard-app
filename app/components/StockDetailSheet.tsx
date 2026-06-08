/**
 * StockDetailSheet.tsx — 종목 상세 바텀시트
 *
 * 이슈 018: 종목 상세 섹터 breadcrumb 표시 + 섹터 수동 보정 cascading select
 *
 * 기능:
 * - ticker + market으로 getStock 조회
 * - sector_id가 있으면 getSectorBreadcrumb로 breadcrumb 표시
 *   예: '정보기술 > 반도체및반도체장비 > 반도체 > 반도체제조'
 * - 섹터 보정 버튼 탭 시 L1→L2→L3→L4 cascading select 표시
 * - updateStockSector로 저장
 *
 * CLAUDE.md 렌더링 최적화:
 * - 초기 로딩만 전체 스피너, 이후 섹션 단위 처리
 * - React.memo + useCallback 활용
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { getStock, updateStockSector } from '../services/stocks';
import { getSectorBreadcrumb } from '../services/sectors';
import { StockWithSector, StockMarket, SectorBreadcrumb, Sector } from '../types/sector';
import { CascadingSectorPicker } from './CascadingSectorPicker';

// ────────────────────────────────────────────
// Props
// ────────────────────────────────────────────

interface StockDetailSheetProps {
  visible: boolean;
  ticker: string;
  /** HoldingCardData.asset_type → StockMarket 변환 필요 */
  market: StockMarket;
  onClose: () => void;
  /** 섹터 보정 후 대시보드 리프레시용 */
  onSectorUpdated?: () => void;
}

// ────────────────────────────────────────────
// asset_type → StockMarket 변환 유틸
// ────────────────────────────────────────────

export function assetTypeToMarket(assetType: 'korean_stock' | 'us_stock' | 'crypto'): StockMarket {
  switch (assetType) {
    case 'korean_stock': return 'KR';
    case 'us_stock': return 'US';
    case 'crypto': return 'CRYPTO';
  }
}

// ────────────────────────────────────────────
// Breadcrumb 표시 컴포넌트
// ────────────────────────────────────────────

interface BreadcrumbDisplayProps {
  breadcrumb: SectorBreadcrumb;
}

const BreadcrumbDisplay = React.memo(function BreadcrumbDisplay({
  breadcrumb,
}: BreadcrumbDisplayProps) {
  if (breadcrumb.length === 0) {
    return <Text style={breadcrumbStyles.empty}>섹터 미설정</Text>;
  }

  return (
    <View style={breadcrumbStyles.container}>
      {breadcrumb.map((item, idx) => (
        <React.Fragment key={item.id}>
          <View style={[breadcrumbStyles.item, { marginLeft: idx * 8 }]}>
            <Text style={breadcrumbStyles.levelBadge}>L{item.level}</Text>
            <Text style={breadcrumbStyles.name}>{item.name}</Text>
            {item.name_en && (
              <Text style={breadcrumbStyles.nameEn}>{item.name_en}</Text>
            )}
          </View>
          {idx < breadcrumb.length - 1 && (
            <Text style={breadcrumbStyles.separator}>▼</Text>
          )}
        </React.Fragment>
      ))}
    </View>
  );
});

const breadcrumbStyles = StyleSheet.create({
  container: {
    gap: 4,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#eff4ff',
    borderRadius: 8,
  },
  levelBadge: {
    fontSize: 9,
    fontWeight: '700',
    color: '#003ec7',
    backgroundColor: '#dce9ff',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  name: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0b1c30',
    flex: 1,
  },
  nameEn: {
    fontSize: 11,
    color: '#737688',
    fontStyle: 'italic',
    flexShrink: 1,
  },
  separator: {
    fontSize: 10,
    color: '#c3c5d9',
    textAlign: 'center',
    paddingVertical: 2,
    marginLeft: 20,
  },
  empty: {
    fontSize: 13,
    color: '#9ca3af',
    fontStyle: 'italic',
  },
});

// CascadingPicker는 CascadingSectorPicker.tsx의 CascadingSectorPicker로 교체됨

// ────────────────────────────────────────────
// StockDetailSheet (메인)
// ────────────────────────────────────────────

type SheetPhase = 'detail' | 'sector-edit' | 'saving';

export function StockDetailSheet({
  visible,
  ticker,
  market,
  onClose,
  onSectorUpdated,
}: StockDetailSheetProps) {
  const [phase, setPhase] = useState<SheetPhase>('detail');
  const [stock, setStock] = useState<StockWithSector | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<SectorBreadcrumb>([]);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);

  // 종목 정보 + breadcrumb 조회
  useEffect(() => {
    if (!visible) {
      setPhase('detail');
      setSaveError(null);
      return;
    }

    setLoading(true);
    setStock(null);
    setBreadcrumb([]);

    getStock(ticker, market)
      .then(async (stockData) => {
        setStock(stockData);
        if (stockData?.sector_id) {
          try {
            const bc = await getSectorBreadcrumb(stockData.sector_id);
            setBreadcrumb(bc);
          } catch {
            setBreadcrumb([]);
          }
        } else {
          setBreadcrumb([]);
        }
      })
      .catch(() => {
        setStock(null);
        setBreadcrumb([]);
      })
      .finally(() => setLoading(false));
  }, [visible, ticker, market]);

  // 섹터 수동 보정 확정
  const handleSectorConfirm = useCallback(
    async (sector: Sector) => {
      if (!stock) return;
      setPhase('saving');
      setSaveError(null);
      try {
        await updateStockSector({ stockId: stock.id, sectorId: sector.id });
        // 성공 후 breadcrumb 갱신
        const bc = await getSectorBreadcrumb(sector.id);
        setBreadcrumb(bc);
        setStock((prev) => (prev ? { ...prev, sector_id: sector.id } : prev));
        setPhase('detail');
        onSectorUpdated?.();
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : '섹터 저장 실패');
        setPhase('sector-edit');
      }
    },
    [stock, onSectorUpdated],
  );

  const handleCancelSectorEdit = useCallback(() => setPhase('detail'), []);
  const handleStartSectorEdit = useCallback(() => setPhase('sector-edit'), []);

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
          <View style={styles.headerLeft}>
            {phase === 'sector-edit' && (
              <TouchableOpacity onPress={handleCancelSectorEdit}>
                <Text style={styles.backText}>{'< 상세'}</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.headerTitle}>
            {phase === 'sector-edit' ? '섹터 보정' : '종목 상세'}
          </Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>닫기</Text>
          </TouchableOpacity>
        </View>

        {/* 로딩 */}
        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#003ec7" />
          </View>
        )}

        {/* 저장 중 */}
        {phase === 'saving' && !loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#003ec7" />
            <Text style={styles.loadingText}>섹터 저장 중...</Text>
          </View>
        )}

        {/* 상세 뷰 */}
        {!loading && phase === 'detail' && (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* 종목 기본 정보 */}
            {stock ? (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>종목 정보</Text>
                <View style={styles.infoCard}>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoKey}>종목명</Text>
                    <Text style={styles.infoValue}>{stock.name}</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoKey}>티커</Text>
                    <Text style={styles.infoValue}>{stock.ticker}</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoKey}>시장</Text>
                    <Text style={styles.infoValue}>{stock.market}</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoKey}>통화</Text>
                    <Text style={styles.infoValue}>{stock.currency}</Text>
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.section}>
                <Text style={styles.emptyText}>종목 정보를 불러올 수 없습니다</Text>
              </View>
            )}

            {/* 섹터 breadcrumb */}
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionLabel}>섹터 분류 (GICS)</Text>
                {stock && (
                  <TouchableOpacity style={styles.editBtn} onPress={handleStartSectorEdit}>
                    <Text style={styles.editBtnText}>보정</Text>
                  </TouchableOpacity>
                )}
              </View>
              <BreadcrumbDisplay breadcrumb={breadcrumb} />
            </View>

            {/* 오류 배너 */}
            {saveError && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{saveError}</Text>
              </View>
            )}
          </ScrollView>
        )}

        {/* 섹터 보정 뷰 */}
        {!loading && phase === 'sector-edit' && (
          <View style={styles.pickerContainer}>
            <CascadingSectorPicker
              onConfirm={handleSectorConfirm}
              onCancel={handleCancelSectorEdit}
            />
          </View>
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
  headerLeft: {
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
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#737688',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    gap: 24,
    paddingBottom: 48,
  },
  pickerContainer: {
    flex: 1,
    padding: 20,
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
  infoCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: '#e5eeff',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  infoKey: {
    fontSize: 13,
    color: '#737688',
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 13,
    color: '#0b1c30',
    fontWeight: '600',
  },
  editBtn: {
    backgroundColor: '#dce9ff',
    borderRadius: 9999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  editBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#003ec7',
  },
  emptyText: {
    fontSize: 13,
    color: '#737688',
  },
  errorBanner: {
    backgroundColor: '#ffdad6',
    borderRadius: 10,
    padding: 12,
  },
  errorText: {
    fontSize: 13,
    color: '#93000a',
  },
});
