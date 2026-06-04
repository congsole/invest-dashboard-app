import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import { useAuth } from './hooks/useAuth';
import { AuthScreen } from './screens/AuthScreen';
import { EmailVerificationScreen } from './screens/EmailVerificationScreen';
import { MainScreen } from './screens/MainScreen';
import { supabase } from './utils/supabase';

export default function App() {
  const { user, loading, setPendingNickname } = useAuth();

  // 딥링크로 전달된 인증 토큰 처리
  useEffect(() => {
    const handleDeepLink = async (url: string) => {
      // Supabase 인증 콜백 URL에서 토큰 추출
      // 형식: ...#access_token=...&refresh_token=...&type=signup
      const hashIndex = url.indexOf('#');
      if (hashIndex === -1) return;

      const hash = url.substring(hashIndex + 1);
      const params = new URLSearchParams(hash);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');

      if (accessToken && refreshToken) {
        await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      }
    };

    // 앱이 이미 열린 상태에서 딥링크 수신
    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleDeepLink(url);
    });

    // 앱이 딥링크로 cold start된 경우
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink(url);
    });

    return () => subscription.remove();
  }, []);

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

  // 인증된 사용자 → 메인 화면 (대시보드 + 투자 일지 탭)
  if (user) {
    return (
      <>
        <MainScreen />
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
