import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  Animated,
  Dimensions,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  Alert,
} from 'react-native';
import { Colors } from '../types/colors';
import { AssetType, TradeType, TradeEventInput } from '../types/tradeEvent';
import { createTradeEvent } from '../services/tradeEvents';
import { CsvUploadSheet } from './CsvUploadSheet';

// ────────────────────────────────────────────
// 타입
// ────────────────────────────────────────────

interface TradeEventBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface FormState {
  asset_type: AssetType;
  trade_type: TradeType;
  name: string;
  ticker: string;
  trade_date: string;
  quantity: string;
  price_per_unit: string;
  currency: string;
  fee: string;
  fee_currency: string;
  tax: string;
  settlement_amount: string;
  settlement_manual: boolean;
}

const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  korean_stock: '한국주식',
  us_stock: '미국주식',
  crypto: '코인',
};

const TRADE_TYPE_LABELS: Record<TradeType, string> = {
  buy: '매수',
  sell: '매도',
};

const ASSET_TYPES: AssetType[] = ['korean_stock', 'us_stock', 'crypto'];
const TRADE_TYPES: TradeType[] = ['buy', 'sell'];

const SCREEN_HEIGHT = Dimensions.get('window').height;
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.92;

// ────────────────────────────────────────────
// 정산금액 자동 계산
// ────────────────────────────────────────────

function calcSettlement(
  trade_type: TradeType,
  quantity: string,
  price_per_unit: string,
  fee: string,
  tax: string
): string {
  const q = parseFloat(quantity) || 0;
  const p = parseFloat(price_per_unit) || 0;
  const f = parseFloat(fee) || 0;
  const t = parseFloat(tax) || 0;

  const base = q * p;
  // 매수: 지출 (음수), 매도: 수입 (양수)
  const result = trade_type === 'buy' ? -(base + f + t) : base - f - t;

  if (result === 0) return '';
  return result.toFixed(2);
}

// ────────────────────────────────────────────
// 유효성 검사
// ────────────────────────────────────────────

function validate(form: FormState): string | null {
  if (!form.ticker.trim()) return '티커를 입력해주세요';
  if (!form.name.trim()) return '종목명을 입력해주세요';
  if (!form.trade_date) return '체결 날짜를 입력해주세요';

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(form.trade_date)) return '날짜 형식: YYYY-MM-DD';

  const qty = parseFloat(form.quantity);
  if (!form.quantity || isNaN(qty) || qty <= 0) return '수량은 0보다 커야 합니다';

  const price = parseFloat(form.price_per_unit);
  if (!form.price_per_unit || isNaN(price) || price < 0) return '체결가를 입력해주세요';

  return null;
}

// ────────────────────────────────────────────
// 컴포넌트
// ────────────────────────────────────────────

export function TradeEventBottomSheet({ visible, onClose, onSuccess }: TradeEventBottomSheetProps) {
  const slideAnim = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const [csvSheetVisible, setCsvSheetVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialForm: FormState = {
    asset_type: 'korean_stock',
    trade_type: 'buy',
    name: '',
    ticker: '',
    trade_date: new Date().toISOString().split('T')[0],
    quantity: '',
    price_per_unit: '',
    currency: 'KRW',
    fee: '',
    fee_currency: 'KRW',
    tax: '',
    settlement_amount: '',
    settlement_manual: false,
  };

  const [form, setForm] = useState<FormState>(initialForm);

  // 바텀시트 진입/퇴장 애니메이션
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

  // 자산 유형 변경 시 통화 자동 설정
  const handleAssetTypeChange = useCallback((asset_type: AssetType) => {
    let currency = 'KRW';
    if (asset_type === 'us_stock') currency = 'USD';
    // crypto는 ticker 기반이지만 초기엔 KRW
    setForm((prev) => ({
      ...prev,
      asset_type,
      currency,
      settlement_manual: false,
      settlement_amount: '',
    }));
  }, []);

  // 정산금액 자동 갱신 (수동 수정 중이 아닐 때)
  const updateSettlement = useCallback(
    (updated: Partial<FormState>, current: FormState) => {
      const merged = { ...current, ...updated };
      if (!merged.settlement_manual) {
        const auto = calcSettlement(
          merged.trade_type,
          merged.quantity,
          merged.price_per_unit,
          merged.fee,
          merged.tax
        );
        return { ...merged, settlement_amount: auto };
      }
      return merged;
    },
    []
  );

  const setFormField = useCallback(
    (field: keyof FormState, value: string | boolean | AssetType | TradeType) => {
      setForm((prev) => {
        const updated = { [field]: value } as Partial<FormState>;
        if (
          field === 'quantity' ||
          field === 'price_per_unit' ||
          field === 'fee' ||
          field === 'tax' ||
          field === 'trade_type'
        ) {
          return updateSettlement(updated, prev);
        }
        return { ...prev, ...updated };
      });
    },
    [updateSettlement]
  );

  const handleClose = useCallback(() => {
    setForm(initialForm);
    setError(null);
    onClose();
  }, [onClose]);

  const handleSubmit = async () => {
    setError(null);
    const validationError = validate(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    try {
      const input: TradeEventInput = {
        asset_type: form.asset_type,
        trade_type: form.trade_type,
        ticker: form.ticker.trim().toUpperCase(),
        name: form.name.trim(),
        trade_date: form.trade_date,
        quantity: parseFloat(form.quantity),
        price_per_unit: parseFloat(form.price_per_unit),
        currency: form.currency,
        fee: parseFloat(form.fee) || 0,
        fee_currency: form.fee_currency,
        tax: parseFloat(form.tax) || 0,
        settlement_amount: parseFloat(form.settlement_amount) || 0,
      };

      await createTradeEvent(input);
      setForm(initialForm);
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다');
    } finally {
      setLoading(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={handleClose}>
      {/* 백드롭 */}
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={handleClose}
      />

      {/* 바텀시트 */}
      <Animated.View
        style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}
      >
        {/* 핸들바 */}
        <View style={styles.handlebarContainer}>
          <View style={styles.handlebar} />
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
          keyboardVerticalOffset={0}
        >
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* 헤더 */}
            <View style={styles.header}>
              <View>
                <Text style={styles.title}>New Trade Event</Text>
                <Text style={styles.subtitle}>수동 입력 또는 CSV 업로드</Text>
              </View>
              <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
                <Text style={styles.closeIcon}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* CSV 업로드 버튼 */}
            <TouchableOpacity
              style={styles.csvButton}
              onPress={() => setCsvSheetVisible(true)}
              activeOpacity={0.85}
            >
              <View style={styles.csvIconContainer}>
                <Text style={styles.csvIconText}>↑</Text>
              </View>
              <View style={styles.csvTextContainer}>
                <Text style={styles.csvTitle}>CSV 파일 업로드</Text>
                <Text style={styles.csvSubtitle}>증권사 거래내역 파일 가져오기</Text>
              </View>
              <Text style={styles.csvChevron}>›</Text>
            </TouchableOpacity>

            {/* 자산 유형 / 매매 유형 선택 */}
            <View style={styles.segmentRow}>
              {/* 자산 유형 */}
              <View style={styles.segmentGroup}>
                <Text style={styles.fieldLabel}>자산 유형</Text>
                <View style={styles.segmentContainer}>
                  {ASSET_TYPES.map((type) => (
                    <TouchableOpacity
                      key={type}
                      style={[
                        styles.segmentButton,
                        form.asset_type === type && styles.segmentButtonActive,
                      ]}
                      onPress={() => handleAssetTypeChange(type)}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          form.asset_type === type && styles.segmentTextActive,
                        ]}
                      >
                        {ASSET_TYPE_LABELS[type]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* 매매 유형 */}
              <View style={styles.segmentGroup}>
                <Text style={styles.fieldLabel}>매매 유형</Text>
                <View style={styles.segmentContainer}>
                  {TRADE_TYPES.map((type) => (
                    <TouchableOpacity
                      key={type}
                      style={[
                        styles.segmentButton,
                        form.trade_type === type &&
                          (type === 'buy'
                            ? styles.segmentButtonBuy
                            : styles.segmentButtonSell),
                      ]}
                      onPress={() => setFormField('trade_type', type)}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          form.trade_type === type && styles.segmentTextActive,
                        ]}
                      >
                        {TRADE_TYPE_LABELS[type]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            {/* 종목명 / 체결 날짜 */}
            <View style={styles.rowFields}>
              <View style={styles.fieldHalf}>
                <Text style={styles.fieldLabel}>종목명</Text>
                <TextInput
                  style={styles.input}
                  placeholder="예: 삼성전자, Apple Inc."
                  placeholderTextColor={Colors.outline}
                  value={form.name}
                  onChangeText={(v) => setFormField('name', v)}
                  autoCorrect={false}
                />
              </View>
              <View style={styles.fieldHalf}>
                <Text style={styles.fieldLabel}>티커</Text>
                <TextInput
                  style={styles.input}
                  placeholder="예: 005930, AAPL, BTC"
                  placeholderTextColor={Colors.outline}
                  value={form.ticker}
                  onChangeText={(v) => setFormField('ticker', v)}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
              </View>
            </View>

            {/* 체결 날짜 */}
            <View style={styles.fieldFull}>
              <Text style={styles.fieldLabel}>체결 날짜</Text>
              <TextInput
                style={styles.input}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={Colors.outline}
                value={form.trade_date}
                onChangeText={(v) => setFormField('trade_date', v)}
                keyboardType="numeric"
                maxLength={10}
              />
            </View>

            {/* 수치 입력 그리드 */}
            <View style={styles.numberGrid}>
              <View style={styles.numberCell}>
                <Text style={styles.numberLabel}>수량</Text>
                <TextInput
                  style={styles.numberInput}
                  placeholder="0"
                  placeholderTextColor={Colors.outline}
                  value={form.quantity}
                  onChangeText={(v) => setFormField('quantity', v)}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.numberCell}>
                <Text style={styles.numberLabel}>체결가 (1주당)</Text>
                <TextInput
                  style={styles.numberInput}
                  placeholder="0.00"
                  placeholderTextColor={Colors.outline}
                  value={form.price_per_unit}
                  onChangeText={(v) => setFormField('price_per_unit', v)}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.numberCell}>
                <Text style={styles.numberLabel}>수수료</Text>
                <TextInput
                  style={styles.numberInput}
                  placeholder="0.00"
                  placeholderTextColor={Colors.outline}
                  value={form.fee}
                  onChangeText={(v) => setFormField('fee', v)}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.numberCell}>
                <Text style={styles.numberLabel}>세금</Text>
                <TextInput
                  style={styles.numberInput}
                  placeholder="0.00"
                  placeholderTextColor={Colors.outline}
                  value={form.tax}
                  onChangeText={(v) => setFormField('tax', v)}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            {/* 통화 선택 / 수수료 통화 선택 */}
            <View style={styles.rowFields}>
              <View style={styles.fieldHalf}>
                <Text style={styles.fieldLabel}>통화</Text>
                <View style={styles.segmentContainerSmall}>
                  {(['KRW', 'USD'] as const).map((c) => (
                    <TouchableOpacity
                      key={c}
                      style={[
                        styles.segmentButtonSmall,
                        form.currency === c && styles.segmentButtonActive,
                      ]}
                      onPress={() => setFormField('currency', c)}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          form.currency === c && styles.segmentTextActive,
                        ]}
                      >
                        {c}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  {form.asset_type === 'crypto' && (
                    <TouchableOpacity
                      style={[
                        styles.segmentButtonSmall,
                        form.currency === form.ticker && styles.segmentButtonActive,
                      ]}
                      onPress={() => setFormField('currency', form.ticker || 'BTC')}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          form.currency === form.ticker && styles.segmentTextActive,
                        ]}
                        numberOfLines={1}
                      >
                        {form.ticker || '티커'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              <View style={styles.fieldHalf}>
                <Text style={styles.fieldLabel}>수수료 통화</Text>
                <View style={styles.segmentContainerSmall}>
                  {(['KRW', 'USD'] as const).map((c) => (
                    <TouchableOpacity
                      key={c}
                      style={[
                        styles.segmentButtonSmall,
                        form.fee_currency === c && styles.segmentButtonActive,
                      ]}
                      onPress={() => setFormField('fee_currency', c)}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          form.fee_currency === c && styles.segmentTextActive,
                        ]}
                      >
                        {c}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            {/* 정산금액 */}
            <View style={styles.settlementContainer}>
              <View style={styles.settlementHeader}>
                <Text style={styles.fieldLabel}>정산금액</Text>
                <TouchableOpacity
                  onPress={() =>
                    setForm((prev) => ({
                      ...prev,
                      settlement_manual: !prev.settlement_manual,
                      settlement_amount: prev.settlement_manual
                        ? calcSettlement(
                            prev.trade_type,
                            prev.quantity,
                            prev.price_per_unit,
                            prev.fee,
                            prev.tax
                          )
                        : prev.settlement_amount,
                    }))
                  }
                >
                  <Text style={styles.settlementToggleText}>
                    {form.settlement_manual ? '자동 계산으로 전환' : '수동 입력'}
                  </Text>
                </TouchableOpacity>
              </View>
              {form.settlement_manual ? (
                <TextInput
                  style={[styles.input, styles.settlementInput]}
                  placeholder="정산금액 직접 입력"
                  placeholderTextColor={Colors.outline}
                  value={form.settlement_amount}
                  onChangeText={(v) =>
                    setForm((prev) => ({ ...prev, settlement_amount: v }))
                  }
                  keyboardType="numbers-and-punctuation"
                />
              ) : (
                <View style={styles.settlementDisplay}>
                  <Text style={styles.settlementLabel}>
                    {form.trade_type === 'buy' ? '지출' : '수입'}
                  </Text>
                  <Text
                    style={[
                      styles.settlementValue,
                      parseFloat(form.settlement_amount) >= 0
                        ? styles.settlementPositive
                        : styles.settlementNegative,
                    ]}
                  >
                    {form.settlement_amount
                      ? `${parseFloat(form.settlement_amount) > 0 ? '+' : ''}${parseFloat(form.settlement_amount).toLocaleString()} ${form.currency}`
                      : '—'}
                  </Text>
                </View>
              )}
            </View>

            {/* 에러 메시지 */}
            {error && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* 저장 버튼 */}
            <TouchableOpacity
              style={[styles.submitButton, loading && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color={Colors.onPrimary} />
              ) : (
                <Text style={styles.submitButtonText}>매매 이벤트 저장</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>

      {/* CSV 업로드 바텀시트 */}
      <CsvUploadSheet
        visible={csvSheetVisible}
        onClose={() => setCsvSheetVisible(false)}
        onSuccess={() => {
          setCsvSheetVisible(false);
          onSuccess?.();
          onClose();
        }}
      />
    </Modal>
  );
}

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
    // ambient shadow
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
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
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

  // CSV 버튼
  csvButton: {
    backgroundColor: Colors.primaryFixed,
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  csvIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  csvIconText: {
    fontSize: 22,
    color: Colors.onPrimary,
    fontWeight: '700',
  },
  csvTextContainer: {
    flex: 1,
  },
  csvTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.onPrimaryFixed,
  },
  csvSubtitle: {
    fontSize: 12,
    color: Colors.onPrimaryFixedVariant,
    marginTop: 2,
  },
  csvChevron: {
    fontSize: 24,
    color: Colors.onPrimaryFixed,
    fontWeight: '600',
  },

  // 세그먼트 선택
  segmentRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  segmentGroup: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.outline,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 8,
    marginLeft: 4,
  },
  segmentContainer: {
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: 9999,
    padding: 4,
    flexDirection: 'row',
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 9999,
    alignItems: 'center',
  },
  segmentButtonActive: {
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  segmentButtonBuy: {
    backgroundColor: Colors.tertiary,
    shadowColor: Colors.tertiary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  segmentButtonSell: {
    backgroundColor: Colors.error,
    shadowColor: Colors.error,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  segmentText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.onSurfaceVariant,
  },
  segmentTextActive: {
    color: Colors.onPrimary,
  },

  // 입력 필드
  rowFields: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  fieldHalf: {
    flex: 1,
  },
  fieldFull: {
    marginBottom: 16,
  },
  input: {
    backgroundColor: Colors.surfaceContainerHigh,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 14,
    fontWeight: '600',
    color: Colors.onSurface,
  },

  // 수치 그리드
  numberGrid: {
    backgroundColor: `${Colors.surfaceContainer}80`,
    borderRadius: 24,
    padding: 20,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  numberCell: {
    width: '46%',
  },
  numberLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.outline,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  numberInput: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: '700',
    color: Colors.onSurface,
  },

  // 통화 세그먼트 (작은 버전)
  segmentContainerSmall: {
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: 9999,
    padding: 4,
    flexDirection: 'row',
  },
  segmentButtonSmall: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 9999,
    alignItems: 'center',
  },

  // 정산금액
  settlementContainer: {
    marginBottom: 16,
  },
  settlementHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  settlementToggleText: {
    fontSize: 11,
    color: Colors.primary,
    fontWeight: '600',
  },
  settlementDisplay: {
    backgroundColor: `${Colors.primary}0D`,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: `${Colors.primary}1A`,
  },
  settlementLabel: {
    fontSize: 13,
    color: Colors.onSurfaceVariant,
    fontWeight: '500',
  },
  settlementValue: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  settlementPositive: {
    color: Colors.tertiary,
  },
  settlementNegative: {
    color: Colors.error,
  },
  settlementInput: {
    backgroundColor: Colors.surfaceContainerHigh,
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

  // 저장 버튼
  submitButton: {
    backgroundColor: Colors.primary,
    borderRadius: 9999,
    paddingVertical: 20,
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
    marginTop: 8,
  },
  submitButtonDisabled: {
    backgroundColor: Colors.outline,
    shadowOpacity: 0,
    elevation: 0,
  },
  submitButtonText: {
    color: Colors.onPrimary,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
