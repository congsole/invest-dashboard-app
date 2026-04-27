import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { EventType } from '../types/accountEvent';
import { CsvUploadSheet } from './CsvUploadSheet';
import { BuySellEventForm } from './forms/BuySellEventForm';
import { DepositWithdrawEventForm } from './forms/DepositWithdrawEventForm';
import { DividendEventForm } from './forms/DividendEventForm';

// ────────────────────────────────────────────
// 상수
// ────────────────────────────────────────────

const SCREEN_H = Dimensions.get('window').height;
const SHEET_HEIGHT = SCREEN_H * 0.92;

// ────────────────────────────────────────────
// 이벤트 타입 메타데이터
// ────────────────────────────────────────────

interface EventTypeOption {
  key: EventType;
  label: string;
  description: string;
  bg: string;
  textColor: string;
  isPrimary: boolean; // 매수/매도: 강조 표시
}

const EVENT_TYPE_OPTIONS: EventTypeOption[] = [
  {
    key: 'buy',
    label: '매수',
    description: '종목 매수. 수수료/세금 함께 입력.',
    bg: '#003ec7',
    textColor: '#ffffff',
    isPrimary: true,
  },
  {
    key: 'sell',
    label: '매도',
    description: '종목 매도. 수수료/세금 함께 입력.',
    bg: '#ba1a1a',
    textColor: '#ffffff',
    isPrimary: true,
  },
  {
    key: 'deposit',
    label: '입금',
    description: '증권 계좌로 현금 이체 (KRW / USD).',
    bg: '#eff4ff',
    textColor: '#0b1c30',
    isPrimary: false,
  },
  {
    key: 'withdraw',
    label: '출금',
    description: '증권 계좌에서 현금 인출 (KRW / USD).',
    bg: '#eff4ff',
    textColor: '#0b1c30',
    isPrimary: false,
  },
  {
    key: 'dividend',
    label: '배당 수령',
    description: '배당금 수령. 원금에 영향 없음.',
    bg: '#eff4ff',
    textColor: '#0b1c30',
    isPrimary: false,
  },
];

// ────────────────────────────────────────────
// Props
// ────────────────────────────────────────────

interface AccountEventBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

// ────────────────────────────────────────────
// 컴포넌트
// ────────────────────────────────────────────

export function AccountEventBottomSheet({
  visible,
  onClose,
  onSuccess,
}: AccountEventBottomSheetProps) {
  const slideAnim = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const [step, setStep] = useState<'type' | 'form'>('type');
  const [selectedType, setSelectedType] = useState<EventType | null>(null);
  const [csvSheetVisible, setCsvSheetVisible] = useState(false);

  // 슬라이드 애니메이션
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

  const handleClose = useCallback(() => {
    setStep('type');
    setSelectedType(null);
    onClose();
  }, [onClose]);

  const handleTypeSelect = useCallback((type: EventType) => {
    setSelectedType(type);
    setStep('form');
  }, []);

  const handleBack = useCallback(() => {
    setStep('type');
    setSelectedType(null);
  }, []);

  const handleFormSuccess = useCallback(() => {
    setStep('type');
    setSelectedType(null);
    onSuccess();
  }, [onSuccess]);

  const handleCsvSuccess = useCallback(() => {
    setCsvSheetVisible(false);
    onSuccess();
    handleClose();
  }, [onSuccess, handleClose]);

  if (!visible) return null;

  return (
    <>
      <Modal
        transparent
        animationType="none"
        visible={visible}
        onRequestClose={handleClose}
      >
        {/* 백드롭 */}
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={handleClose}
        />

        {/* 바텀시트 */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.kvWrapper}
        >
          <Animated.View
            style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}
          >
            {/* 핸들바 */}
            <View style={styles.handlebarContainer}>
              <View style={styles.handlebar} />
            </View>

            {/* 헤더 */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                {step === 'form' && (
                  <TouchableOpacity
                    style={styles.backButton}
                    onPress={handleBack}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.backIcon}>{'<'}</Text>
                  </TouchableOpacity>
                )}
                <View>
                  <Text style={styles.title}>
                    {step === 'type'
                      ? '계정 이벤트 등록'
                      : selectedType
                      ? EVENT_TYPE_OPTIONS.find((o) => o.key === selectedType)?.label ?? ''
                      : ''}
                  </Text>
                  <Text style={styles.subtitle}>
                    {step === 'type' ? '이벤트 유형을 선택하세요' : ''}
                  </Text>
                </View>
              </View>
              <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
                <Text style={styles.closeIcon}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* 1단계: 이벤트 타입 선택 */}
            {step === 'type' && (
              <View style={styles.typeSelectContent}>
                {/* CSV 업로드 버튼 */}
                <TouchableOpacity
                  style={styles.csvButton}
                  onPress={() => setCsvSheetVisible(true)}
                  activeOpacity={0.85}
                >
                  <View style={styles.csvIconBox}>
                    <Text style={styles.csvIconText}>↑</Text>
                  </View>
                  <View style={styles.csvTextArea}>
                    <Text style={styles.csvTitle}>CSV 파일 업로드</Text>
                    <Text style={styles.csvSub}>증권사 거래내역 일괄 가져오기</Text>
                  </View>
                  <Text style={styles.chevron}>{'>'}</Text>
                </TouchableOpacity>

                {/* 구분선 */}
                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>또는 직접 입력</Text>
                  <View style={styles.dividerLine} />
                </View>

                {/* 매수/매도 강조 행 */}
                <View style={styles.primaryEventRow}>
                  {EVENT_TYPE_OPTIONS.filter((o) => o.isPrimary).map((option) => (
                    <TouchableOpacity
                      key={option.key}
                      style={[
                        styles.primaryEventButton,
                        { backgroundColor: option.bg },
                      ]}
                      onPress={() => handleTypeSelect(option.key)}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.primaryEventLabel, { color: option.textColor }]}>
                        {option.label}
                      </Text>
                      <Text style={[styles.primaryEventDesc, { color: option.textColor, opacity: 0.75 }]}>
                        {option.description}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* 입금/출금/배당 행 */}
                <View style={styles.secondaryEventList}>
                  {EVENT_TYPE_OPTIONS.filter((o) => !o.isPrimary).map((option) => (
                    <TouchableOpacity
                      key={option.key}
                      style={[
                        styles.secondaryEventButton,
                        { backgroundColor: option.bg },
                      ]}
                      onPress={() => handleTypeSelect(option.key)}
                      activeOpacity={0.85}
                    >
                      <View>
                        <Text style={[styles.secondaryEventLabel, { color: option.textColor }]}>
                          {option.label}
                        </Text>
                        <Text style={[styles.secondaryEventDesc, { color: '#434656' }]}>
                          {option.description}
                        </Text>
                      </View>
                      <Text style={styles.chevron}>{'>'}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* 2단계: 타입별 입력 폼 */}
            {step === 'form' && selectedType !== null && (
              <View style={styles.formContent}>
                {(selectedType === 'buy' || selectedType === 'sell') && (
                  <BuySellEventForm
                    eventType={selectedType}
                    onSuccess={handleFormSuccess}
                    onCancel={handleBack}
                  />
                )}
                {(selectedType === 'deposit' || selectedType === 'withdraw') && (
                  <DepositWithdrawEventForm
                    eventType={selectedType}
                    onSuccess={handleFormSuccess}
                    onCancel={handleBack}
                  />
                )}
                {selectedType === 'dividend' && (
                  <DividendEventForm
                    onSuccess={handleFormSuccess}
                    onCancel={handleBack}
                  />
                )}
              </View>
            )}
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>

      {/* CSV 업로드 시트 */}
      <CsvUploadSheet
        visible={csvSheetVisible}
        onClose={() => setCsvSheetVisible(false)}
        onSuccess={handleCsvSuccess}
      />
    </>
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
  kvWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: 'flex-end',
  },
  sheet: {
    height: SHEET_HEIGHT,
    backgroundColor: '#f8f9ff',
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    shadowColor: '#0b1c30',
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
    backgroundColor: '#c3c5d9',
    opacity: 0.4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
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
    fontSize: 22,
    fontWeight: '800',
    color: '#0b1c30',
  },
  subtitle: {
    fontSize: 13,
    color: '#434656',
    marginTop: 2,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#dce9ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIcon: {
    fontSize: 15,
    color: '#434656',
    fontWeight: '600',
  },
  // ── 1단계 콘텐츠 ──
  typeSelectContent: {
    paddingHorizontal: 24,
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
  csvIconText: {
    fontSize: 22,
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
  chevron: {
    fontSize: 18,
    color: '#434656',
    fontWeight: '700',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#c3c5d9',
    opacity: 0.4,
  },
  dividerText: {
    fontSize: 11,
    color: '#737688',
    fontWeight: '500',
  },
  primaryEventRow: {
    flexDirection: 'row',
    gap: 12,
  },
  primaryEventButton: {
    flex: 1,
    borderRadius: 16,
    padding: 18,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  primaryEventLabel: {
    fontSize: 18,
    fontWeight: '800',
  },
  primaryEventDesc: {
    fontSize: 11,
    lineHeight: 16,
  },
  secondaryEventList: {
    gap: 8,
  },
  secondaryEventButton: {
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  secondaryEventLabel: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 3,
  },
  secondaryEventDesc: {
    fontSize: 11,
  },
  // ── 2단계 콘텐츠 ──
  formContent: {
    flex: 1,
  },
});
