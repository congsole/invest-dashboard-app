import React, { useState } from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from './hooks/useAuth';
import { AuthScreen } from './screens/AuthScreen';
import { EmailVerificationScreen } from './screens/EmailVerificationScreen';
import { SettingsScreen } from './screens/SettingsScreen';

export default function App() {
  const { user, loading, setPendingNickname } = useAuth();

  // 이메일 인증 대기 상태: 회원가입 후 이메일 인증 완료 전
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string | null>(null);

  const handleSignupPendingVerification = (email: string, nickname: string) => {
    setPendingNickname(nickname);
    setPendingVerificationEmail(email);
  };

  const handleBackToLogin = () => {
    setPendingVerificationEmail(null);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#111" />
        <StatusBar style="auto" />
      </View>
    );
  }

  // 인증된 사용자 → 메인 화면 (이번 이슈 범위에서는 SettingsScreen)
  if (user) {
    return (
      <>
        <SettingsScreen />
        <StatusBar style="auto" />
      </>
    );
  }

  // 이메일 인증 대기 중
  if (pendingVerificationEmail) {
    return (
      <>
        <EmailVerificationScreen
          email={pendingVerificationEmail}
          onBackToLogin={handleBackToLogin}
        />
        <StatusBar style="auto" />
      </>
    );
  }

  // 미인증 → 로그인/회원가입 화면
  return (
    <>
      <AuthScreen onSignupPendingVerification={handleSignupPendingVerification} />
      <StatusBar style="auto" />
    </>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
