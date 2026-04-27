import React, { useState, useCallback } from 'react';
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
import { DividendEventInput } from '../../types/accountEvent';
import { createAccountEvent } from '../../services/accountEvents';

// ────────────────────────────────────────────
// 유틸
// ────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// ────────────────────────────────────────────
// Props
// ────────────────────────────────────────────

interface DividendEventFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

// ────────────────────────────────────────────
// 컴포넌트
// ────────────────────────────────────────────

export function DividendEventForm({ onSuccess, onCancel }: DividendEventFormProps) {
  const [eventDate, setEventDate] = useState(today());
  const [ticker, setTicker] = useState('');
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState<'KRW' | 'USD'>('KRW');
  const [amount, setAmount] = useState('');
  const [withholdingTax, setWithholdingTax] = useState('');
  const [fxRate, setFxRate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const resetForm = useCallback(() => {
    setEventDate(today());
    setTicker('');
    setName('');
    setCurrency('KRW');
    setAmount('');
    setWithholdingTax('');
    setFxRate('');
    setError('');
  }, []);

  const handleSubmit = async () => {
    setError('');

    if (!eventDate) { setError('날짜를 입력해주세요'); return; }
    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum <= 0) { setError('유효한 배당금액을 입력해주세요'); return; }

    const fxRateNum = fxRate ? parseFloat(fxRate) : null;
    if (currency === 'USD' && (!fxRateNum || fxRateNum <= 0)) {
      setError('USD 배당은 환율을 입력해주세요');
      return;
    }

    const input: DividendEventInput = {
      event_type: 'dividend',
      event_date: eventDate,
      ticker: ticker.trim().toUpperCase() || null,
      name: name.trim() || null,
      currency,
      amount: amountNum,
      tax: parseFloat(withholdingTax) || 0,
      fx_rate_at_event: fxRateNum,
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

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* 날짜 */}
      <View style={styles.field}>
        <Text style={styles.label}>날짜 (YYYY-MM-DD)</Text>
        <TextInput
          style={styles.input}
          placeholder="2024-01-15"
          placeholderTextColor="#737688"
          value={eventDate}
          onChangeText={setEventDate}
          keyboardType="numbers-and-punctuation"
        />
      </View>

      {/* 종목 (선택) */}
      <View style={styles.row2}>
        <View style={[styles.field, styles.flex1]}>
          <Text style={styles.label}>티커 (선택)</Text>
          <TextInput
            style={styles.input}
            placeholder="AAPL (비워도 됨)"
            placeholderTextColor="#737688"
            autoCapitalize="characters"
            autoCorrect={false}
            value={ticker}
            onChangeText={setTicker}
          />
        </View>
        <View style={[styles.field, styles.flex1]}>
          <Text style={styles.label}>종목명 (선택)</Text>
          <TextInput
            style={styles.input}
            placeholder="예금이자 가능"
            placeholderTextColor="#737688"
            autoCorrect={false}
            value={name}
            onChangeText={setName}
          />
        </View>
      </View>

      {/* 통화 */}
      <View style={styles.field}>
        <Text style={styles.label}>통화</Text>
        <View style={styles.segmentBar}>
          {(['KRW', 'USD'] as const).map((c) => (
            <TouchableOpacity
              key={c}
              style={[
                styles.segmentBtn,
                currency === c && styles.segmentBtnActive,
              ]}
              onPress={() => setCurrency(c)}
            >
              <Text
                style={[
                  styles.segmentText,
                  currency === c && styles.segmentTextActive,
                ]}
              >
                {c === 'KRW' ? '원화 (₩)' : '달러 ($)'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* 금액 (세후) + 원천징수 세금 */}
      <View style={styles.financialGrid}>
        <View style={styles.financialItem}>
          <Text style={styles.labelSmall}>금액 (세후) ({currency})</Text>
          <TextInput
            style={styles.inputSmall}
            placeholder="0"
            placeholderTextColor="#737688"
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
          />
        </View>
        <View style={styles.financialItem}>
          <Text style={styles.labelSmall}>원천징수 세금</Text>
          <TextInput
            style={styles.inputSmall}
            placeholder="0"
            placeholderTextColor="#737688"
            keyboardType="decimal-pad"
            value={withholdingTax}
            onChangeText={setWithholdingTax}
          />
        </View>
      </View>

      {/* USD인 경우 환율 */}
      {currency === 'USD' && (
        <View style={styles.field}>
          <Text style={styles.label}>KRW/USD 환율</Text>
          <TextInput
            style={styles.input}
            placeholder="예: 1385.5"
            placeholderTextColor="#737688"
            keyboardType="decimal-pad"
            value={fxRate}
            onChangeText={setFxRate}
          />
        </View>
      )}

      {/* 효과 안내 */}
      <View style={styles.effectNote}>
        <Text style={styles.effectNoteTitle}>배당 효과</Text>
        <Text style={styles.effectNoteText}>
          {'• 예수금 +\n• 누적 배당금 +\n• 원금에는 영향 없음'}
        </Text>
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
          <Text style={styles.submitBtnText}>배당 수령 등록</Text>
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
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 9999,
    alignItems: 'center',
  },
  segmentBtnActive: {
    backgroundColor: '#003ec7',
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#434656',
  },
  segmentTextActive: {
    color: '#ffffff',
  },
  financialGrid: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#e5eeff',
    borderRadius: 16,
    padding: 14,
  },
  financialItem: {
    flex: 1,
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
  effectNote: {
    backgroundColor: '#eff4ff',
    borderRadius: 12,
    padding: 14,
    gap: 6,
  },
  effectNoteTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#434656',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  effectNoteText: {
    fontSize: 12,
    color: '#434656',
    lineHeight: 20,
  },
  errorText: {
    color: '#ba1a1a',
    fontSize: 13,
    fontWeight: '500',
  },
  submitBtn: {
    backgroundColor: '#FF8C00',
    borderRadius: 9999,
    paddingVertical: 18,
    alignItems: 'center',
    shadowColor: '#FF8C00',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
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
