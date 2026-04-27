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
import { DepositEventInput, WithdrawEventInput } from '../../types/accountEvent';
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

interface DepositWithdrawEventFormProps {
  eventType: 'deposit' | 'withdraw';
  onSuccess: () => void;
  onCancel: () => void;
}

// ────────────────────────────────────────────
// 컴포넌트
// ────────────────────────────────────────────

export function DepositWithdrawEventForm({
  eventType,
  onSuccess,
  onCancel,
}: DepositWithdrawEventFormProps) {
  const [currency, setCurrency] = useState<'KRW' | 'USD'>('KRW');
  const [eventDate, setEventDate] = useState(today());
  const [amount, setAmount] = useState('');
  const [fxRate, setFxRate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isDeposit = eventType === 'deposit';

  const resetForm = useCallback(() => {
    setCurrency('KRW');
    setEventDate(today());
    setAmount('');
    setFxRate('');
    setError('');
  }, []);

  const handleSubmit = async () => {
    setError('');

    if (!eventDate) { setError('날짜를 입력해주세요'); return; }
    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum <= 0) { setError('유효한 금액을 입력해주세요'); return; }
    const fxRateNum = parseFloat(fxRate);
    if (isNaN(fxRateNum) || fxRateNum <= 0) { setError('환율을 입력해주세요 (KRW인 경우 1 입력)'); return; }

    const input: DepositEventInput | WithdrawEventInput = {
      event_type: eventType,
      event_date: eventDate,
      currency,
      amount: amountNum,
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

      {/* 통화 선택 */}
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

      {/* 금액 */}
      <View style={styles.field}>
        <Text style={styles.label}>
          {isDeposit ? '입금 금액' : '출금 금액'} ({currency})
        </Text>
        <TextInput
          style={styles.input}
          placeholder="0"
          placeholderTextColor="#737688"
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={setAmount}
        />
      </View>

      {/* 환율 (KRW 원금 환산용) */}
      <View style={styles.field}>
        <Text style={styles.label}>KRW/USD 환율</Text>
        <Text style={styles.hint}>
          {currency === 'KRW' ? 'KRW 입출금은 1 입력 (원금 환산 불필요)' : '예: 1385.5 (거래 시점 환율)'}
        </Text>
        <TextInput
          style={styles.input}
          placeholder={currency === 'KRW' ? '1' : '1385.5'}
          placeholderTextColor="#737688"
          keyboardType="decimal-pad"
          value={fxRate}
          onChangeText={setFxRate}
        />
      </View>

      {/* 효과 안내 */}
      <View style={styles.effectNote}>
        <Text style={styles.effectNoteTitle}>
          {isDeposit ? '입금 효과' : '출금 효과'}
        </Text>
        <Text style={styles.effectNoteText}>
          {isDeposit
            ? '• 예수금 +\n• 원금 + (입금 시점 환율로 KRW 환산 고정)'
            : '• 예수금 −\n• 원금 − (출금 시점 환율로 KRW 환산 고정)'}
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
          <Text style={styles.submitBtnText}>
            {isDeposit ? '입금 등록' : '출금 등록'}
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
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#737688',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  hint: {
    fontSize: 11,
    color: '#737688',
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
    shadowOpacity: 0,
    elevation: 0,
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
