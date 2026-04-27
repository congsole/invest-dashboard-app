import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { BuySellEventInput } from '../../types/accountEvent';

type BuySellAssetType = 'korean_stock' | 'us_stock' | 'crypto';
import { createAccountEvent } from '../../services/accountEvents';

// ────────────────────────────────────────────
// 상수
// ────────────────────────────────────────────

const ASSET_TABS: { key: BuySellAssetType; label: string }[] = [
  { key: 'korean_stock', label: 'KR주식' },
  { key: 'us_stock', label: '미국주식' },
  { key: 'crypto', label: '코인' },
];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// ────────────────────────────────────────────
// Props
// ────────────────────────────────────────────

interface BuySellEventFormProps {
  eventType: 'buy' | 'sell';
  onSuccess: () => void;
  onCancel: () => void;
}

// ────────────────────────────────────────────
// 컴포넌트
// ────────────────────────────────────────────

export function BuySellEventForm({
  eventType,
  onSuccess,
  onCancel,
}: BuySellEventFormProps) {
  const [assetType, setAssetType] = useState<BuySellAssetType>('korean_stock');
  const [ticker, setTicker] = useState('');
  const [name, setName] = useState('');
  const [eventDate, setEventDate] = useState(today());
  const [quantity, setQuantity] = useState('');
  const [pricePerUnit, setPricePerUnit] = useState('');
  const [fee, setFee] = useState('');
  const [feeCurrency, setFeeCurrency] = useState('KRW');
  const [tax, setTax] = useState('');
  const [cryptoCurrency, setCryptoCurrency] = useState('');
  const [settlementManual, setSettlementManual] = useState(false);
  const [settlementOverride, setSettlementOverride] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 통화 결정: 한국주식=KRW, 미국주식=USD, 코인=코인티커(직접 입력)
  const currency =
    assetType === 'korean_stock'
      ? 'KRW'
      : assetType === 'us_stock'
      ? 'USD'
      : cryptoCurrency.trim().toUpperCase() || 'USD';

  // 정산금액 자동 계산
  const autoSettlement = useMemo(() => {
    const q = parseFloat(quantity) || 0;
    const p = parseFloat(pricePerUnit) || 0;
    const f = parseFloat(fee) || 0;
    const t = parseFloat(tax) || 0;
    const gross = q * p;
    if (eventType === 'buy') return -(gross + f + t);
    return gross - f - t;
  }, [quantity, pricePerUnit, fee, tax, eventType]);

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

  const resetForm = useCallback(() => {
    setAssetType('korean_stock');
    setTicker('');
    setName('');
    setEventDate(today());
    setQuantity('');
    setPricePerUnit('');
    setFee('');
    setTax('');
    setFeeCurrency('KRW');
    setCryptoCurrency('');
    setSettlementManual(false);
    setSettlementOverride('');
    setError('');
  }, []);

  const handleSubmit = async () => {
    setError('');

    if (!ticker.trim()) { setError('티커를 입력해주세요'); return; }
    if (!name.trim()) { setError('종목명을 입력해주세요'); return; }
    if (!eventDate) { setError('체결 날짜를 입력해주세요'); return; }
    if (assetType === 'crypto' && !cryptoCurrency.trim()) {
      setError('코인 거래 통화(티커)를 입력해주세요 (예: BTC, ETH)');
      return;
    }
    const qty = parseFloat(quantity);
    if (!qty || qty <= 0) { setError('유효한 수량을 입력해주세요'); return; }
    const price = parseFloat(pricePerUnit);
    if (isNaN(price) || price < 0) { setError('유효한 체결가를 입력해주세요'); return; }

    const input: BuySellEventInput = {
      event_type: eventType,
      event_date: eventDate,
      asset_type: assetType,
      ticker: ticker.trim().toUpperCase(),
      name: name.trim(),
      quantity: qty,
      price_per_unit: price,
      currency,
      fee: parseFloat(fee) || 0,
      fee_currency: feeCurrency,
      tax: parseFloat(tax) || 0,
      amount: effectiveSettlement,
      source: 'manual',
    };

    setLoading(true);
    try {
      await createAccountEvent(input);
      resetForm();
      onSuccess();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '저장 중 오류가 발생했습니다';
      Alert.alert('오류', msg);
    } finally {
      setLoading(false);
    }
  };

  const isBuy = eventType === 'buy';

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* 자산 유형 선택 */}
      <View style={styles.field}>
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

      {/* 코인 거래 통화 입력 (코인 선택 시에만 표시) */}
      {assetType === 'crypto' && (
        <View style={styles.field}>
          <Text style={styles.label}>거래 통화 (코인 티커)</Text>
          <TextInput
            style={styles.input}
            placeholder="예: BTC, ETH, SOL"
            placeholderTextColor="#737688"
            autoCapitalize="characters"
            autoCorrect={false}
            value={cryptoCurrency}
            onChangeText={setCryptoCurrency}
          />
        </View>
      )}

      {/* 종목명 / 티커 */}
      <View style={styles.row2}>
        <View style={[styles.field, styles.flex1]}>
          <Text style={styles.label}>티커</Text>
          <TextInput
            style={styles.input}
            placeholder="AAPL, 005930, BTC"
            placeholderTextColor="#737688"
            autoCapitalize="characters"
            autoCorrect={false}
            value={ticker}
            onChangeText={setTicker}
          />
        </View>
        <View style={[styles.field, styles.flex1]}>
          <Text style={styles.label}>종목명</Text>
          <TextInput
            style={styles.input}
            placeholder="Apple Inc."
            placeholderTextColor="#737688"
            autoCorrect={false}
            value={name}
            onChangeText={setName}
          />
        </View>
      </View>

      {/* 체결 날짜 */}
      <View style={styles.field}>
        <Text style={styles.label}>체결 날짜 (YYYY-MM-DD)</Text>
        <TextInput
          style={styles.input}
          placeholder="2024-01-15"
          placeholderTextColor="#737688"
          value={eventDate}
          onChangeText={setEventDate}
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
          <Text style={styles.labelSmall}>체결가 ({currency})</Text>
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

      {/* 수수료 통화 */}
      <View style={styles.field}>
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
      <View style={styles.field}>
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
            <Text style={styles.toggleText}>
              {settlementManual ? '자동 계산으로 전환' : '수동 입력'}
            </Text>
          </TouchableOpacity>
        </View>
        {settlementManual ? (
          <TextInput
            style={styles.input}
            placeholder="정산금액 (음수: 지출)"
            placeholderTextColor="#737688"
            value={settlementOverride}
            onChangeText={setSettlementOverride}
            keyboardType="numbers-and-punctuation"
          />
        ) : (
          <View style={styles.settlementBox}>
            <Text style={styles.settlementLabel}>
              {isBuy ? '지출' : '수입'}
            </Text>
            <Text
              style={[
                styles.settlementValue,
                effectiveSettlement >= 0 ? styles.positive : styles.negative,
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
        style={[
          styles.submitBtn,
          isBuy ? styles.submitBtnBuy : styles.submitBtnSell,
          loading && styles.submitBtnDisabled,
        ]}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.submitBtnText}>
            {isBuy ? '매수 등록' : '매도 등록'}
          </Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

// ────────────────────────────────────────────
// 스타일
// ────────────────────────────────────────────

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 24,
    paddingBottom: 48,
    gap: 14,
  },
  field: {
    gap: 6,
  },
  row2: {
    flexDirection: 'row',
    gap: 10,
  },
  flex1: {
    flex: 1,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#737688',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  labelSmall: {
    fontSize: 9,
    fontWeight: '700',
    color: '#737688',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
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
    minWidth: 140,
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
  segmentText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#434656',
  },
  segmentTextActive: {
    color: '#ffffff',
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
  settlementHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toggleText: {
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
  positive: {
    color: '#005b21',
  },
  negative: {
    color: '#ba1a1a',
  },
  errorText: {
    color: '#ba1a1a',
    fontSize: 13,
    fontWeight: '500',
  },
  submitBtn: {
    borderRadius: 9999,
    paddingVertical: 18,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  submitBtnBuy: {
    backgroundColor: '#003ec7',
    shadowColor: '#003ec7',
  },
  submitBtnSell: {
    backgroundColor: '#ba1a1a',
    shadowColor: '#ba1a1a',
  },
  submitBtnDisabled: {
    backgroundColor: '#737688',
    shadowOpacity: 0,
    elevation: 0,
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
