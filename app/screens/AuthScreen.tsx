import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { signIn, signUp } from '../services/auth';

type Tab = 'login' | 'signup';

interface AuthScreenProps {
  /** 회원가입 후 이메일 인증 대기 상태로 전환 시 호출 */
  onSignupPendingVerification: (email: string, nickname: string) => void;
}

// ────────────────────────────────────────────
// 유효성 검사
// ────────────────────────────────────────────

function validateEmail(email: string): string | null {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return '올바른 이메일 형식을 입력해주세요';
  }
  return null;
}

function validatePassword(password: string): string | null {
  if (password.length < 8) {
    return '비밀번호는 8자 이상이어야 합니다';
  }
  return null;
}

function validateNickname(nickname: string): string | null {
  if (nickname.length < 2 || nickname.length > 20) {
    return '닉네임은 2자 이상 20자 이하로 입력해주세요';
  }
  return null;
}

// ────────────────────────────────────────────
// 에러 메시지 파싱
// ────────────────────────────────────────────

function parseAuthError(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message;
    if (msg.includes('already registered') || msg.includes('User already registered')) {
      return '이미 사용 중인 이메일입니다';
    }
    if (msg.includes('Invalid login credentials') || msg.includes('invalid_credentials')) {
      return '이메일 또는 비밀번호가 올바르지 않습니다';
    }
    if (msg.includes('Email not confirmed') || msg.includes('email_not_confirmed')) {
      return '이메일 인증이 필요합니다. 이메일을 확인해주세요';
    }
    if (msg.includes('network') || msg.includes('fetch')) {
      return '네트워크 오류가 발생했습니다. 다시 시도해주세요';
    }
    return msg;
  }
  return '알 수 없는 오류가 발생했습니다';
}

// ────────────────────────────────────────────
// AuthScreen
// ────────────────────────────────────────────

export function AuthScreen({ onSignupPendingVerification }: AuthScreenProps) {
  const [tab, setTab] = useState<Tab>('login');

  // 로그인 상태
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // 회원가입 상태
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupNickname, setSignupNickname] = useState('');
  const [signupError, setSignupError] = useState('');
  const [signupLoading, setSignupLoading] = useState(false);

  // ─── 로그인 핸들러 ───
  const handleLogin = async () => {
    setLoginError('');

    const emailErr = validateEmail(loginEmail);
    if (emailErr) { setLoginError(emailErr); return; }

    const passwordErr = validatePassword(loginPassword);
    if (passwordErr) { setLoginError(passwordErr); return; }

    setLoginLoading(true);
    try {
      await signIn({ email: loginEmail, password: loginPassword });
      // 성공 시 useAuth 훅이 상태를 업데이트하여 App.tsx에서 화면 전환
    } catch (error) {
      setLoginError(parseAuthError(error));
    } finally {
      setLoginLoading(false);
    }
  };

  // ─── 회원가입 핸들러 ───
  const handleSignup = async () => {
    setSignupError('');

    const emailErr = validateEmail(signupEmail);
    if (emailErr) { setSignupError(emailErr); return; }

    const passwordErr = validatePassword(signupPassword);
    if (passwordErr) { setSignupError(passwordErr); return; }

    const nicknameErr = validateNickname(signupNickname);
    if (nicknameErr) { setSignupError(nicknameErr); return; }

    setSignupLoading(true);
    try {
      const { needsEmailVerification } = await signUp({
        email: signupEmail,
        password: signupPassword,
      });

      if (needsEmailVerification) {
        // 이메일 인증 대기 화면으로 이동, 닉네임 임시 보관
        onSignupPendingVerification(signupEmail, signupNickname);
      }
      // needsEmailVerification === false 이면 onAuthStateChange가 SIGNED_IN을 처리
    } catch (error) {
      setSignupError(parseAuthError(error));
    } finally {
      setSignupLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.keyboardView}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.container}>
          <Text style={styles.title}>투자 대시보드</Text>

          {/* 탭 전환 */}
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tab, tab === 'login' && styles.tabActive]}
              onPress={() => setTab('login')}
            >
              <Text style={[styles.tabText, tab === 'login' && styles.tabTextActive]}>
                로그인
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, tab === 'signup' && styles.tabActive]}
              onPress={() => setTab('signup')}
            >
              <Text style={[styles.tabText, tab === 'signup' && styles.tabTextActive]}>
                회원가입
              </Text>
            </TouchableOpacity>
          </View>

          {/* 로그인 탭 */}
          {tab === 'login' && (
            <View style={styles.form}>
              <TextInput
                style={styles.input}
                placeholder="이메일"
                placeholderTextColor="#999"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                value={loginEmail}
                onChangeText={setLoginEmail}
                editable={!loginLoading}
              />
              <TextInput
                style={styles.input}
                placeholder="비밀번호"
                placeholderTextColor="#999"
                secureTextEntry
                value={loginPassword}
                onChangeText={setLoginPassword}
                editable={!loginLoading}
              />
              {loginError ? (
                <Text style={styles.errorText}>{loginError}</Text>
              ) : null}
              <TouchableOpacity
                style={[styles.button, loginLoading && styles.buttonDisabled]}
                onPress={handleLogin}
                disabled={loginLoading}
              >
                {loginLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>로그인</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* 회원가입 탭 */}
          {tab === 'signup' && (
            <View style={styles.form}>
              <TextInput
                style={styles.input}
                placeholder="이메일"
                placeholderTextColor="#999"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                value={signupEmail}
                onChangeText={setSignupEmail}
                editable={!signupLoading}
              />
              <TextInput
                style={styles.input}
                placeholder="비밀번호 (8자 이상)"
                placeholderTextColor="#999"
                secureTextEntry
                value={signupPassword}
                onChangeText={setSignupPassword}
                editable={!signupLoading}
              />
              <TextInput
                style={styles.input}
                placeholder="닉네임 (2~20자)"
                placeholderTextColor="#999"
                autoCorrect={false}
                value={signupNickname}
                onChangeText={setSignupNickname}
                editable={!signupLoading}
                maxLength={20}
              />
              {signupError ? (
                <Text style={styles.errorText}>{signupError}</Text>
              ) : null}
              <TouchableOpacity
                style={[styles.button, signupLoading && styles.buttonDisabled]}
                onPress={handleSignup}
                disabled={signupLoading}
              >
                {signupLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>회원가입</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  container: {
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111',
    textAlign: 'center',
    marginBottom: 32,
  },
  tabRow: {
    flexDirection: 'row',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginBottom: 24,
    overflow: 'hidden',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  tabActive: {
    backgroundColor: '#111',
  },
  tabText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#666',
  },
  tabTextActive: {
    color: '#fff',
  },
  form: {
    // gap 대신 각 input에 marginBottom 적용 (RN 구버전 호환)
  },
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: '#111',
    backgroundColor: '#fafafa',
    marginBottom: 12,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 13,
    marginTop: 2,
  },
  button: {
    backgroundColor: '#111',
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: {
    backgroundColor: '#999',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
