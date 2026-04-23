import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { AssetType, TradeType, TradeEventInput } from '../types/tradeEvent';
import { createTradeEvent } from '../services/tradeEvents';
import { CsvUploadSheet } from './CsvUploadSheet';

interface NewTradeEventSheetProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const ASSET_TABS: { key: AssetType; label: string }[] = [
  { key: 'korean_stock', label: 'KR주식' },
  { key: 'us_stock', label: '미국주식' },
  { key: 'crypto', label: '코인' },
];

const TRADE_TABS: { key: TradeType; label: string }[] = [
  { key: 'buy', label: '매수' },
  { key: 'sell', label: '매도' },
];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function NewTradeEventSheet({
  visible,
  onClose,
  onSuccess,
}: NewTradeEventSheetProps) {
  const [assetType, setAssetType] = useState<AssetType>('korean_stock');
  const [tradeType, setTradeType] = useState<TradeType>('buy');
  const [ticker, setTicker] = useState('');
  const [name, setName] = useState('');
  const [tradeDate, setTradeDate] = useState(today());
  const [quantity, setQuantity] = useState('');
  const [pricePerUnit, setPricePerUnit] = useState('');
  const [fee, setFee] = useState('');
  const [tax, setTax] = useState('');
  const [feeCurrency, setFeeCurrency] = useState('KRW');
  const [settlementManual, setSettlementManual] = useState(false);
  const [settlementOverride, setSettlementOverride] = useState('');
  const [csvSheetVisible, setCsvSheetVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 통화 자동 결정
  const currency = assetType === 'korean_stock' ? 'KRW' : 'USD';

  // 정산금액 자동 계산
  const calcSettlement = useCallback((): number => {
    const q = parseFloat(quantity) || 0;
    const p = parseFloat(pricePerUnit) || 0;
    const f = parseFloat(fee) || 0;
    const t = parseFloat(tax) || 0;
    const gross = q * p;
    if (tradeType === 'buy') return -(gross + f + t);
    return gross - f - t;
  }, [quantity, pricePerUnit, fee, tax, tradeType]);

  const autoSettlement = calcSettlement();
  const effectiveSettlement = settlementManual
    ? parseFloat(settlementOverride) || 0
    : autoSettlement;

  const formatSettlement = (amount: number): string => {
    const prefix = currency === 'KRW' ? '₩' : '$';
    if (currency === 'KRW') {
      return `${amount >= 0 ? '+' : ''}${prefix}${Math.round(amount).toLocaleString('ko-KR')}`;
    }
    return `${amount >= 0 ? '+' : ''}${prefix}${amount.toFixed(2)}`;
  };

  const resetForm = () => {
    setAssetType('korean_stock');
    setTradeType('buy');
    setTicker('');
    setName('');
    setTradeDate(today());
    setQuantity('');
    setPricePerUnit('');
    setFee('');
    setTax('');
    setFeeCurrency('KRW');
    setSettlementManual(false);
    setSettlementOverride('');
    setError('');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    setError('');

    if (!ticker.trim()) { setError('티커를 입력해주세요'); return; }
    if (!name.trim()) { setError('종목명을 입력해주세요'); return; }
    if (!tradeDate) { setError('체결 날짜를 입력해주세요'); return; }
    const qty = parseFloat(quantity);
    if (!qty || qty <= 0) { setError('유효한 수량을 입력해주세요'); return; }
    const price = parseFloat(pricePerUnit);
    if (isNaN(price) || price < 0) { setError('유효한 체결가를 입력해주세요'); return; }

    const input: TradeEventInput = {
      asset_type: assetType,
      trade_type: tradeType,
      ticker: ticker.trim().toUpperCase(),
      name: name.trim(),
      trade_date: tradeDate,
      quantity: qty,
      price_per_unit: price,
      currency,
      fee: parseFloat(fee) || 0,
      fee_currency: feeCurrency,
      tax: parseFloat(tax) || 0,
      settlement_amount: effectiveSettlement,
    };

    setLoading(true);
    try {
      await createTradeEvent(input);
      resetForm();
      onSuccess();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '저장 중 오류가 발생했습니다';
      Alert.alert('오류', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={handleClose}
      >
        <View style={styles.overlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.keyboardView}
          >
            <View style={styles.sheet}>
              {/* 핸들바 */}
              <View style={styles.handlebarWrapper}>
                <View style={styles.handlebar} />
              </View>

              {/* 헤더 */}
              <View style={styles.sheetHeader}>
                <View>
                  <Text style={styles.sheetTitle}>매매 이벤트 등록</Text>
                  <Text style={styles.sheetSubtitle}>직접 입력 또는 CSV 업로드</Text>
                </View>
                <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
                  <Text style={styles.closeBtnText}>X</Text>
                </TouchableOpacity>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
              >
                {/* CSV 업로드 버튼 */}
                <TouchableOpacity
                  style={styles.csvButton}
                  onPress={() => setCsvSheetVisible(true)}
                  activeOpacity={0.85}
                >
                  <View style={styles.csvIconBox}>
                    <Text style={styles.csvIcon}>^</Text>
                  </View>
                  <View style={styles.csvTextArea}>
                    <Text style={styles.csvTitle}>CSV 파일 업로드</Text>
                    <Text style={styles.csvSub}>증권사 거래내역 일괄 가져오기</Text>
                  </View>
                  <Text style={styles.csvChevron}>{'>'}</Text>
                </TouchableOpacity>

                {/* 자산 유형 / 매매 유형 선택 */}
                <View style={styles.segmentRow}>
                  <View style={styles.segmentGroup}>
                    <Text style={styles.label}>자산 유형</Text>
                    <View style={styles.segmentBar}>
                      {ASSET_TABS.map((t) => (
                        <TouchableOpacity
                          key={t.key}
                          style={[
                            styles.segmentBtn,
                            assetType === t.key && styles.segmentBtnActive,
                          ]}
                          onPress={() => setAssetType(t.key)}
                        >
                          <Text
                            style={[
                              styles.segmentText,
                              assetType === t.key && styles.segmentTextActive,
                            ]}
                          >
                            {t.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  <View style={styles.segmentGroup}>
                    <Text style={styles.label}>매매 유형</Text>
                    <View style={styles.segmentBar}>
                      {TRADE_TABS.map((t) => (
                        <TouchableOpacity
                          key={t.key}
                          style={[
                            styles.segmentBtn,
                            tradeType === t.key && styles.segmentBtnActive,
                            tradeType === t.key && t.key === 'buy' && styles.segmentBtnBuy,
                            tradeType === t.key && t.key === 'sell' && styles.segmentBtnSell,
                          ]}
                          onPress={() => setTradeType(t.key)}
                        >
                          <Text
                            style={[
                              styles.segmentText,
                              tradeType === t.key && styles.segmentTextActive,
                            ]}
                          >
                            {t.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </View>

                {/* 티커 / 종목명 */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>티커</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="예: AAPL, 005930, BTC"
                    placeholderTextColor="#737688"
                    autoCapitalize="characters"
                    autoCorrect={false}
                    value={ticker}
                    onChangeText={setTicker}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>종목명</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="예: Apple Inc., 삼성전자"
                    placeholderTextColor="#737688"
                    autoCorrect={false}
                    value={name}
                    onChangeText={setName}
                  />
                </View>

                {/* 체결 날짜 */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>체결 날짜 (YYYY-MM-DD)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="2024-01-15"
                    placeholderTextColor="#737688"
                    value={tradeDate}
                    onChangeText={setTradeDate}
                    keyboardType="numbers-and-punctuation"
                  />
                </View>

                {/* 수량 / 체결가 / 수수료 / 세금 */}
                <View style={styles.financialGrid}>
                  <View style={styles.financialItem}>
                    <Text style={styles.labelSmall}>수량</Text>
                    <TextInput
                      style={styles.inputSmall}
                      placeholder="0"
                      placeholderTextColor="#737688"
                      keyboardType="decimal-pad"
                      value={quantity}
                      onChangeText={setQuantity}
                    />
                  </View>
                  <View style={styles.financialItem}>
                    <Text style={styles.labelSmall}>
                      {`체결가 (${currency === 'KRW' ? 'KRW' : 'USD'})`}
                    </Text>
                    <TextInput
                      style={styles.inputSmall}
                      placeholder="0"
                      placeholderTextColor="#737688"
                      keyboardType="decimal-pad"
                      value={pricePerUnit}
                      onChangeText={setPricePerUnit}
                    />
                  </View>
                  <View style={styles.financialItem}>
                    <Text style={styles.labelSmall}>수수료</Text>
                    <TextInput
                      style={styles.inputSmall}
                      placeholder="0"
                      placeholderTextColor="#737688"
                      keyboardType="decimal-pad"
                      value={fee}
                      onChangeText={setFee}
                    />
                  </View>
                  <View style={styles.financialItem}>
                    <Text style={styles.labelSmall}>세금</Text>
                    <TextInput
                      style={styles.inputSmall}
                      placeholder="0"
                      placeholderTextColor="#737688"
                      keyboardType="decimal-pad"
                      value={tax}
                      onChangeText={setTax}
                    />
                  </View>
                </View>

                {/* 수수료 통화 선택 */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>수수료 통화</Text>
                  <View style={styles.segmentBarSmall}>
                    {['KRW', 'USD'].map((c) => (
                      <TouchableOpacity
                        key={c}
                        style={[
                          styles.segmentBtn,
                          feeCurrency === c && styles.segmentBtnActive,
                        ]}
                        onPress={() => setFeeCurrency(c)}
                      >
                        <Text
                          style={[
                            styles.segmentText,
                            feeCurrency === c && styles.segmentTextActive,
                          ]}
                        >
                          {c}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* 정산금액 */}
                <View style={styles.settlementWrapper}>
                  <View style={styles.settlementHeaderRow}>
                    <Text style={styles.label}>정산금액</Text>
                    <TouchableOpacity
                      onPress={() => {
                        if (settlementManual) {
                          setSettlementManual(false);
                          setSettlementOverride('');
                        } else {
                          setSettlementManual(true);
                          setSettlementOverride(String(Math.round(autoSettlement)));
                        }
                      }}
                    >
                      <Text style={styles.settlementToggleText}>
                        {settlementManual ? '자동 계산으로 전환' : '수동 입력'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {settlementManual ? (
                    <TextInput
                      style={styles.input}
                      placeholder="정산금액 직접 입력 (음수: 지출)"
                      placeholderTextColor="#737688"
                      value={settlementOverride}
                      onChangeText={setSettlementOverride}
                      keyboardType="numbers-and-punctuation"
                    />
                  ) : (
                    <View style={styles.settlementBox}>
                      <Text style={styles.settlementLabel}>
                        {tradeType === 'buy' ? '지출' : '수입'}
                      </Text>
                      <Text
                        style={[
                          styles.settlementValue,
                          effectiveSettlement >= 0
                            ? styles.settlementPositive
                            : styles.settlementNegative,
                        ]}
                      >
                        {formatSettlement(effectiveSettlement)}
                      </Text>
                    </View>
                  )}
                </View>

                {/* 에러 */}
                {error ? <Text style={styles.errorText}>{error}</Text> : null}

                {/* 저장 버튼 */}
                <TouchableOpacity
                  style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
                  onPress={handleSubmit}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.submitBtnText}>매매 이벤트 저장</Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* CSV 업로드 바텀시트 */}
      <CsvUploadSheet
        visible={csvSheetVisible}
        onClose={() => setCsvSheetVisible(false)}
        onSuccess={() => {
          setCsvSheetVisible(false);
          onSuccess();
          handleClose();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(11, 28, 48, 0.4)',
    justifyContent: 'flex-end',
  },
  keyboardView: {
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#f8f9ff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
  },
  handlebarWrapper: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 4,
  },
  handlebar: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#c3c5d9',
    opacity: 0.5,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  sheetTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0b1c30',
  },
  sheetSubtitle: {
    fontSize: 13,
    color: '#434656',
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#dce9ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 14,
    color: '#434656',
    fontWeight: '600',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    gap: 16,
  },
  csvButton: {
    backgroundColor: '#dde1ff',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  csvIconBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#003ec7',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#003ec7',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  csvIcon: {
    fontSize: 20,
    color: '#ffffff',
    fontWeight: '700',
  },
  csvTextArea: {
    flex: 1,
  },
  csvTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#001452',
  },
  csvSub: {
    fontSize: 11,
    color: '#0038b6',
    marginTop: 2,
  },
  csvChevron: {
    fontSize: 20,
    color: '#001452',
    fontWeight: '700',
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 12,
  },
  segmentGroup: {
    flex: 1,
    gap: 6,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#737688',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  labelSmall: {
    fontSize: 10,
    fontWeight: '700',
    color: '#737688',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  segmentBar: {
    flexDirection: 'row',
    backgroundColor: '#eff4ff',
    borderRadius: 9999,
    padding: 3,
  },
  segmentBarSmall: {
    flexDirection: 'row',
    backgroundColor: '#eff4ff',
    borderRadius: 9999,
    padding: 3,
    alignSelf: 'flex-start',
    minWidth: 160,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 9999,
    alignItems: 'center',
  },
  segmentBtnActive: {
    backgroundColor: '#003ec7',
  },
  segmentBtnBuy: {
    backgroundColor: '#005b21',
  },
  segmentBtnSell: {
    backgroundColor: '#ba1a1a',
  },
  segmentText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#434656',
  },
  segmentTextActive: {
    color: '#ffffff',
  },
  inputGroup: {
    gap: 6,
  },
  input: {
    backgroundColor: '#dce9ff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 14,
    fontWeight: '600',
    color: '#0b1c30',
  },
  financialGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    backgroundColor: '#e5eeff',
    borderRadius: 16,
    padding: 14,
  },
  financialItem: {
    width: '47%',
  },
  inputSmall: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontWeight: '700',
    color: '#0b1c30',
  },
  settlementWrapper: {
    gap: 8,
  },
  settlementHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settlementToggleText: {
    fontSize: 12,
    color: '#003ec7',
    fontWeight: '600',
  },
  settlementBox: {
    backgroundColor: 'rgba(0, 62, 199, 0.05)',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settlementLabel: {
    fontSize: 13,
    color: '#434656',
  },
  settlementValue: {
    fontSize: 20,
    fontWeight: '800',
  },
  settlementPositive: {
    color: '#005b21',
  },
  settlementNegative: {
    color: '#ba1a1a',
  },
  errorText: {
    color: '#ba1a1a',
    fontSize: 13,
    fontWeight: '500',
  },
  submitBtn: {
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
  submitBtnDisabled: {
    backgroundColor: '#737688',
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
