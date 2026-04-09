import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { resendVerificationEmail } from '../services/auth';

interface EmailVerificationScreenProps {
  email: string;
  onBackToLogin: () => void;
}

const RESEND_COOLDOWN_SECONDS = 60;

export function EmailVerificationScreen({ email, onBackToLogin }: EmailVerificationScreenProps) {
  const [cooldown, setCooldown] = useState(0);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendError, setResendError] = useState('');
  const [resendSuccess, setResendSuccess] = useState(false);

  // 쿨다운 카운트다운
  useEffect(() => {
    if (cooldown <= 0) return;

    const timer = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [cooldown]);

  const handleResend = useCallback(async () => {
    if (cooldown > 0 || resendLoading) return;

    setResendError('');
    setResendSuccess(false);
    setResendLoading(true);

    try {
      await resendVerificationEmail({ email });
      setResendSuccess(true);
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (error) {
      const message = error instanceof Error ? error.message : '재발송 중 오류가 발생했습니다';
      if (message.includes('rate') || message.includes('429') || message.includes('limit')) {
        setResendError('잠시 후 다시 시도해주세요');
      } else if (message.includes('network') || message.includes('fetch')) {
        setResendError('네트워크 오류가 발생했습니다. 다시 시도해주세요');
      } else {
        setResendError(message);
      }
    } finally {
      setResendLoading(false);
    }
  }, [cooldown, resendLoading, email]);

  const isResendDisabled = cooldown > 0 || resendLoading;

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Text style={styles.icon}>✉️</Text>
      </View>

      <Text style={styles.title}>이메일을 확인해주세요</Text>
      <Text style={styles.description}>
        <Text style={styles.emailHighlight}>{email}</Text>
        {'\n'}으로 인증 링크를 보냈습니다.{'\n'}
        이메일의 인증 링크를 클릭하면{'\n'}자동으로 로그인됩니다.
      </Text>

      {resendSuccess && (
        <Text style={styles.successText}>인증 메일을 재발송했습니다.</Text>
      )}
      {resendError ? (
        <Text style={styles.errorText}>{resendError}</Text>
      ) : null}

      <TouchableOpacity
        style={[styles.resendButton, isResendDisabled && styles.resendButtonDisabled]}
        onPress={handleResend}
        disabled={isResendDisabled}
      >
        {resendLoading ? (
          <ActivityIndicator color="#111" />
        ) : (
          <Text style={[styles.resendButtonText, isResendDisabled && styles.resendButtonTextDisabled]}>
            {cooldown > 0 ? `재발송 (${cooldown}초 후 가능)` : '인증 메일 재발송'}
          </Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.backButton} onPress={onBackToLogin}>
        <Text style={styles.backButtonText}>로그인 화면으로 돌아가기</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 24,
    paddingTop: 80,
    alignItems: 'center',
  },
  iconContainer: {
    marginBottom: 24,
  },
  icon: {
    fontSize: 56,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#111',
    marginBottom: 16,
    textAlign: 'center',
  },
  description: {
    fontSize: 15,
    color: '#555',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  emailHighlight: {
    fontWeight: '600',
    color: '#111',
  },
  successText: {
    color: '#22c55e',
    fontSize: 14,
    marginBottom: 8,
    textAlign: 'center',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    marginBottom: 8,
    textAlign: 'center',
  },
  resendButton: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#111',
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  resendButtonDisabled: {
    borderColor: '#ccc',
  },
  resendButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#111',
  },
  resendButtonTextDisabled: {
    color: '#999',
  },
  backButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 14,
    color: '#666',
    textDecorationLine: 'underline',
  },
});
