import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  Animated,
  Dimensions,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Colors } from '../types/colors';
import { CsvPreviewRow, CsvPreviewResult } from '../types/tradeEvent';
import { confirmTradeCSV } from '../services/tradeEvents';

// ────────────────────────────────────────────
// 타입
// ────────────────────────────────────────────

interface CsvUploadSheetProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

type Step = 'upload' | 'preview' | 'confirming';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.88;

const ASSET_TYPE_KO: Record<string, string> = {
  korean_stock: '한국주식',
  us_stock: '미국주식',
  crypto: '코인',
};

const TRADE_TYPE_KO: Record<string, string> = {
  buy: '매수',
  sell: '매도',
};

// ────────────────────────────────────────────
// 컴포넌트
// ────────────────────────────────────────────

export function CsvUploadSheet({ visible, onClose, onSuccess }: CsvUploadSheetProps) {
  const slideAnim = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const [step, setStep] = useState<Step>('upload');
  const [uploading, setUploading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewResult, setPreviewResult] = useState<CsvPreviewResult | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: SHEET_HEIGHT,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, slideAnim]);

  const handleClose = () => {
    setStep('upload');
    setPreviewResult(null);
    setSelectedFileName(null);
    setError(null);
    onClose();
  };

  // 파일 선택 (expo-document-picker 없이 시뮬레이션)
  // 실제 구현에서는 expo-document-picker를 사용해야 한다.
  // 현재는 파일 선택 UI만 제공하고, 실제 파일 선택 기능은 TODO 처리
  const handleSelectFile = async () => {
    // TODO: expo-document-picker로 CSV 파일 선택
    // 현재 expo-document-picker가 dependencies에 없으므로
    // Alert으로 안내 후 mock 데이터로 UI 테스트 가능하도록 처리

    Alert.alert(
      'CSV 파일 선택',
      'expo-document-picker 설치 후 실제 파일 선택이 가능합니다.\n\n개발 테스트를 위해 mock 데이터를 로드하시겠습니까?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: 'Mock 데이터 로드',
          onPress: () => handleMockUpload(),
        },
      ]
    );
  };

  // Mock 업로드 (개발 테스트용)
  const handleMockUpload = async () => {
    setUploading(true);
    setError(null);
    try {
      // Mock 파싱 결과
      const mockResult: CsvPreviewResult = {
        preview: [
          {
            row: 2,
            asset_type: 'korean_stock',
            trade_type: 'buy',
            ticker: '005930',
            name: '삼성전자',
            trade_date: '2024-01-15',
            quantity: 10,
            price_per_unit: 72000,
            currency: 'KRW',
            fee: 360,
            fee_currency: 'KRW',
            tax: 0,
            settlement_amount: -720360,
          },
          {
            row: 3,
            asset_type: 'us_stock',
            trade_type: 'buy',
            ticker: 'AAPL',
            name: 'Apple Inc.',
            trade_date: '2024-01-20',
            quantity: 5,
            price_per_unit: 185.5,
            currency: 'USD',
            fee: 1.5,
            fee_currency: 'USD',
            tax: 0,
            settlement_amount: -929,
          },
        ],
        errors: [
          {
            row: 4,
            reason: '체결가 형식 오류: "N/A" 는 숫자가 아닙니다',
          },
        ],
        total_rows: 3,
        parsed_rows: 2,
        failed_rows: 1,
      };

      setSelectedFileName('broker_trades_2024.csv');
      setPreviewResult(mockResult);
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'CSV 파싱에 실패했습니다');
    } finally {
      setUploading(false);
    }
  };

  const handleConfirm = async () => {
    if (!previewResult) return;

    setConfirming(true);
    setError(null);
    try {
      const result = await confirmTradeCSV(previewResult.preview);

      if (result.failed.length > 0) {
        Alert.alert(
          '일부 저장 실패',
          `${result.inserted}건 저장 성공\n${result.failed.length}건 실패\n\n` +
            result.failed.map((f) => `행 ${f.row}: ${f.reason}`).join('\n'),
          [
            {
              text: '확인',
              onPress: () => {
                onSuccess?.();
                handleClose();
              },
            },
          ]
        );
      } else {
        Alert.alert('저장 완료', `${result.inserted}건이 성공적으로 저장되었습니다.`, [
          {
            text: '확인',
            onPress: () => {
              onSuccess?.();
              handleClose();
            },
          },
        ]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다');
    } finally {
      setConfirming(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={handleClose}>
      {/* 백드롭 */}
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} />

      {/* 바텀시트 */}
      <Animated.View
        style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}
      >
        {/* 핸들바 */}
        <View style={styles.handlebarContainer}>
          <View style={styles.handlebar} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* 헤더 */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>CSV 파일 업로드</Text>
              <Text style={styles.subtitle}>증권사 거래내역 파일을 가져옵니다</Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
              <Text style={styles.closeIcon}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* 단계 인디케이터 */}
          <View style={styles.stepIndicator}>
            <View style={[styles.stepDot, step !== 'upload' && styles.stepDotDone]}>
              <Text style={styles.stepDotText}>{step !== 'upload' ? '✓' : '1'}</Text>
            </View>
            <View style={[styles.stepLine, step !== 'upload' && styles.stepLineDone]} />
            <View
              style={[
                styles.stepDot,
                step === 'preview' && styles.stepDotActive,
                step === 'confirming' && styles.stepDotDone,
              ]}
            >
              <Text
                style={[
                  styles.stepDotText,
                  (step === 'preview' || step === 'confirming') && styles.stepDotTextActive,
                ]}
              >
                {step === 'confirming' ? '✓' : '2'}
              </Text>
            </View>
            <View style={styles.stepLine} />
            <View style={styles.stepDot}>
              <Text style={styles.stepDotText}>3</Text>
            </View>
          </View>
          <View style={styles.stepLabels}>
            <Text style={[styles.stepLabel, styles.stepLabelActive]}>파일 선택</Text>
            <Text
              style={[
                styles.stepLabel,
                step === 'preview' && styles.stepLabelActive,
              ]}
            >
              미리보기
            </Text>
            <Text style={styles.stepLabel}>저장 완료</Text>
          </View>

          {/* ── 업로드 단계 ── */}
          {step === 'upload' && (
            <View style={styles.uploadArea}>
              <View style={styles.uploadIconArea}>
                <Text style={styles.uploadIcon}>📄</Text>
              </View>
              <Text style={styles.uploadTitle}>CSV 파일을 선택하세요</Text>
              <Text style={styles.uploadDescription}>
                증권사에서 내보낸 거래내역 CSV 파일을 지원합니다.{'\n'}
                서버에서 자동으로 포맷을 감지합니다.
              </Text>
              <TouchableOpacity
                style={[styles.uploadButton, uploading && styles.uploadButtonDisabled]}
                onPress={handleSelectFile}
                disabled={uploading}
                activeOpacity={0.85}
              >
                {uploading ? (
                  <ActivityIndicator color={Colors.onPrimary} />
                ) : (
                  <Text style={styles.uploadButtonText}>파일 선택하기</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* ── 미리보기 단계 ── */}
          {step === 'preview' && previewResult && (
            <View style={styles.previewArea}>
              {/* 파싱 요약 */}
              <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>
                  {selectedFileName ?? 'CSV 파일'}
                </Text>
                <View style={styles.summaryStats}>
                  <View style={styles.summaryStat}>
                    <Text style={styles.summaryStatValue}>{previewResult.total_rows}</Text>
                    <Text style={styles.summaryStatLabel}>전체 행</Text>
                  </View>
                  <View style={styles.summaryStat}>
                    <Text style={[styles.summaryStatValue, styles.successColor]}>
                      {previewResult.parsed_rows}
                    </Text>
                    <Text style={styles.summaryStatLabel}>파싱 성공</Text>
                  </View>
                  <View style={styles.summaryStat}>
                    <Text
                      style={[
                        styles.summaryStatValue,
                        previewResult.failed_rows > 0 && styles.errorColor,
                      ]}
                    >
                      {previewResult.failed_rows}
                    </Text>
                    <Text style={styles.summaryStatLabel}>파싱 실패</Text>
                  </View>
                </View>
              </View>

              {/* 실패 행 표시 */}
              {previewResult.errors.length > 0 && (
                <View style={styles.errorsSection}>
                  <Text style={styles.sectionTitle}>파싱 실패 행</Text>
                  {previewResult.errors.map((err) => (
                    <View key={err.row} style={styles.errorRow}>
                      <View style={styles.errorRowBadge}>
                        <Text style={styles.errorRowBadgeText}>행 {err.row}</Text>
                      </View>
                      <Text style={styles.errorRowReason}>{err.reason}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* 성공 행 미리보기 */}
              {previewResult.preview.length > 0 && (
                <View style={styles.previewSection}>
                  <Text style={styles.sectionTitle}>
                    파싱 성공 ({previewResult.preview.length}건)
                  </Text>
                  {previewResult.preview.map((row) => (
                    <PreviewRowCard key={row.row} row={row} />
                  ))}
                </View>
              )}

              {/* 에러 메시지 */}
              {error && (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              {/* 버튼 */}
              <View style={styles.previewButtons}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => {
                    setStep('upload');
                    setPreviewResult(null);
                  }}
                >
                  <Text style={styles.cancelButtonText}>다시 선택</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.confirmButton,
                    (confirming || previewResult.preview.length === 0) &&
                      styles.confirmButtonDisabled,
                  ]}
                  onPress={handleConfirm}
                  disabled={confirming || previewResult.preview.length === 0}
                  activeOpacity={0.85}
                >
                  {confirming ? (
                    <ActivityIndicator color={Colors.onPrimary} />
                  ) : (
                    <Text style={styles.confirmButtonText}>
                      {previewResult.preview.length}건 저장하기
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

// ────────────────────────────────────────────
// 미리보기 행 카드
// ────────────────────────────────────────────

interface PreviewRowCardProps {
  row: CsvPreviewRow;
}

function PreviewRowCard({ row }: PreviewRowCardProps) {
  const isPositive = row.settlement_amount >= 0;
  return (
    <View style={previewCardStyles.card}>
      <View style={previewCardStyles.header}>
        <View style={previewCardStyles.headerLeft}>
          <Text style={previewCardStyles.ticker}>{row.ticker}</Text>
          <Text style={previewCardStyles.name}>{row.name}</Text>
        </View>
        <View style={previewCardStyles.badges}>
          <View
            style={[
              previewCardStyles.badge,
              row.trade_type === 'buy'
                ? previewCardStyles.buyBadge
                : previewCardStyles.sellBadge,
            ]}
          >
            <Text
              style={[
                previewCardStyles.badgeText,
                row.trade_type === 'buy'
                  ? previewCardStyles.buyBadgeText
                  : previewCardStyles.sellBadgeText,
              ]}
            >
              {TRADE_TYPE_KO[row.trade_type]}
            </Text>
          </View>
          <View style={previewCardStyles.assetBadge}>
            <Text style={previewCardStyles.assetBadgeText}>
              {ASSET_TYPE_KO[row.asset_type]}
            </Text>
          </View>
        </View>
      </View>
      <View style={previewCardStyles.details}>
        <View style={previewCardStyles.detail}>
          <Text style={previewCardStyles.detailLabel}>날짜</Text>
          <Text style={previewCardStyles.detailValue}>{row.trade_date}</Text>
        </View>
        <View style={previewCardStyles.detail}>
          <Text style={previewCardStyles.detailLabel}>수량</Text>
          <Text style={previewCardStyles.detailValue}>{row.quantity.toLocaleString()}</Text>
        </View>
        <View style={previewCardStyles.detail}>
          <Text style={previewCardStyles.detailLabel}>체결가</Text>
          <Text style={previewCardStyles.detailValue}>
            {row.price_per_unit.toLocaleString()} {row.currency}
          </Text>
        </View>
        <View style={previewCardStyles.detail}>
          <Text style={previewCardStyles.detailLabel}>정산금액</Text>
          <Text
            style={[
              previewCardStyles.detailValue,
              isPositive ? previewCardStyles.positiveText : previewCardStyles.negativeText,
            ]}
          >
            {isPositive ? '+' : ''}
            {row.settlement_amount.toLocaleString()} {row.currency}
          </Text>
        </View>
      </View>
      {(row.fee > 0 || row.tax > 0) && (
        <View style={previewCardStyles.extras}>
          {row.fee > 0 && (
            <Text style={previewCardStyles.extraText}>
              수수료 {row.fee.toLocaleString()} {row.fee_currency}
            </Text>
          )}
          {row.tax > 0 && (
            <Text style={previewCardStyles.extraText}>
              세금 {row.tax.toLocaleString()} {row.currency}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

// ────────────────────────────────────────────
// 스타일
// ────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(11, 28, 48, 0.4)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SHEET_HEIGHT,
    backgroundColor: Colors.surfaceBright,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    shadowColor: Colors.onSurface,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 24,
    elevation: 24,
  },
  handlebarContainer: {
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 8,
  },
  handlebar: {
    width: 48,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.outlineVariant,
    opacity: 0.4,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 48,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.onBackground,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.onSurfaceVariant,
    marginTop: 4,
  },
  closeButton: {
    backgroundColor: Colors.surfaceContainerHigh,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIcon: {
    fontSize: 16,
    color: Colors.onSurface,
    fontWeight: '600',
  },

  // 단계 인디케이터
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.surfaceContainerHighest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: {
    backgroundColor: Colors.primary,
  },
  stepDotDone: {
    backgroundColor: Colors.tertiary,
  },
  stepDotText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.onSurfaceVariant,
  },
  stepDotTextActive: {
    color: Colors.onPrimary,
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: Colors.surfaceContainerHighest,
    marginHorizontal: 4,
  },
  stepLineDone: {
    backgroundColor: Colors.tertiary,
  },
  stepLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  stepLabel: {
    fontSize: 11,
    color: Colors.outline,
    fontWeight: '500',
    textAlign: 'center',
    flex: 1,
  },
  stepLabelActive: {
    color: Colors.primary,
    fontWeight: '700',
  },

  // 업로드 영역
  uploadArea: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  uploadIconArea: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: Colors.primaryFixed,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  uploadIcon: {
    fontSize: 36,
  },
  uploadTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.onBackground,
    marginBottom: 8,
  },
  uploadDescription: {
    fontSize: 13,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 32,
  },
  uploadButton: {
    backgroundColor: Colors.primary,
    borderRadius: 9999,
    paddingVertical: 16,
    paddingHorizontal: 48,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  uploadButtonDisabled: {
    backgroundColor: Colors.outline,
    shadowOpacity: 0,
  },
  uploadButtonText: {
    color: Colors.onPrimary,
    fontSize: 15,
    fontWeight: '700',
  },

  // 미리보기 영역
  previewArea: {
    flex: 1,
  },
  summaryCard: {
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.onBackground,
    marginBottom: 12,
  },
  summaryStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  summaryStat: {
    alignItems: 'center',
  },
  summaryStatValue: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.onBackground,
  },
  summaryStatLabel: {
    fontSize: 11,
    color: Colors.onSurfaceVariant,
    marginTop: 4,
    fontWeight: '500',
  },
  successColor: {
    color: Colors.tertiary,
  },
  errorColor: {
    color: Colors.error,
  },

  // 실패 행
  errorsSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.onSurfaceVariant,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  errorRow: {
    backgroundColor: Colors.errorContainer,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 8,
  },
  errorRowBadge: {
    backgroundColor: Colors.error,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  errorRowBadgeText: {
    color: Colors.onError,
    fontSize: 11,
    fontWeight: '700',
  },
  errorRowReason: {
    flex: 1,
    fontSize: 12,
    color: Colors.onErrorContainer,
    lineHeight: 18,
  },

  // 미리보기 섹션
  previewSection: {
    marginBottom: 20,
  },

  // 에러
  errorContainer: {
    backgroundColor: Colors.errorContainer,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  errorText: {
    color: Colors.onErrorContainer,
    fontSize: 13,
    fontWeight: '500',
  },

  // 미리보기 버튼
  previewButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: Colors.surfaceContainerHighest,
    borderRadius: 9999,
    paddingVertical: 16,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: Colors.onSurface,
    fontSize: 15,
    fontWeight: '600',
  },
  confirmButton: {
    flex: 2,
    backgroundColor: Colors.primary,
    borderRadius: 9999,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  confirmButtonDisabled: {
    backgroundColor: Colors.outline,
    shadowOpacity: 0,
    elevation: 0,
  },
  confirmButtonText: {
    color: Colors.onPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
});

const previewCardStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    shadowColor: Colors.onSurface,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  headerLeft: {
    flex: 1,
  },
  ticker: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.onBackground,
  },
  name: {
    fontSize: 12,
    color: Colors.onSurfaceVariant,
    marginTop: 2,
  },
  badges: {
    flexDirection: 'row',
    gap: 6,
  },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  buyBadge: {
    backgroundColor: `${Colors.tertiary}1A`,
  },
  sellBadge: {
    backgroundColor: `${Colors.error}1A`,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  buyBadgeText: {
    color: Colors.tertiary,
  },
  sellBadgeText: {
    color: Colors.error,
  },
  assetBadge: {
    backgroundColor: Colors.surfaceContainerHigh,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  assetBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.onSurfaceVariant,
  },
  details: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  detail: {
    flex: 1,
    minWidth: '40%',
  },
  detailLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.outline,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.onSurface,
  },
  positiveText: {
    color: Colors.tertiary,
  },
  negativeText: {
    color: Colors.error,
  },
  extras: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    paddingTop: 8,
  },
  extraText: {
    fontSize: 11,
    color: Colors.onSurfaceVariant,
  },
});
