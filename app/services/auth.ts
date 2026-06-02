import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../utils/supabase';
import type { OAuthProvider } from '../types/auth';

export type { OAuthProvider } from '../types/auth';

// ────────────────────────────────────────────
// Types
// ────────────────────────────────────────────

export interface SignUpParams {
  email: string;
  password: string;
}

export interface ResendVerificationEmailParams {
  email: string;
}

export interface SignInParams {
  email: string;
  password: string;
}

export interface Profile {
  id: string;
  user_id: string;
  nickname: string;
  created_at: string;
  updated_at: string;
}

export interface AuthUser {
  id: string;
  email: string;
}

// ────────────────────────────────────────────
// Auth API
// ────────────────────────────────────────────

/**
 * 회원가입: Supabase Auth에 계정을 생성한다.
 * 이메일 인증이 필요하므로 session은 null로 반환된다.
 * 닉네임은 이메일 인증 완료(SIGNED_IN 이벤트) 후 createProfile로 저장한다.
 */
export async function signUp({ email, password }: SignUpParams): Promise<{ user: AuthUser; needsEmailVerification: boolean }> {
  const redirectTo = Linking.createURL('auth/callback');
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: redirectTo },
  });

  if (error) {
    throw error;
  }

  if (!data.user) {
    throw new Error('회원가입에 실패했습니다.');
  }

  return {
    user: {
      id: data.user.id,
      email: data.user.email ?? email,
    },
    // session이 null이면 이메일 인증 대기 상태
    needsEmailVerification: data.session === null,
  };
}

/**
 * 인증 이메일 재발송: 이메일 인증 대기 중 재발송 요청.
 */
export async function resendVerificationEmail({ email }: ResendVerificationEmailParams): Promise<void> {
  const redirectTo = Linking.createURL('auth/callback');
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: redirectTo },
  });

  if (error) {
    throw error;
  }
}

/**
 * 프로필 생성: 이메일 인증 완료(SIGNED_IN 이벤트) 후 profiles 테이블에 닉네임을 저장한다.
 */
export async function createProfile({
  userId,
  nickname,
}: {
  userId: string;
  nickname: string;
}): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .insert({ user_id: userId, nickname })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data as Profile;
}

/**
 * 로그인: 이메일/비밀번호로 인증하고 세션을 생성한다.
 */
export async function signIn({ email, password }: SignInParams): Promise<AuthUser> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    throw error;
  }

  if (!data.user) {
    throw new Error('로그인에 실패했습니다.');
  }

  return {
    id: data.user.id,
    email: data.user.email ?? email,
  };
}

/**
 * 로그아웃: 현재 세션을 종료한다.
 * 네트워크 오류 시에도 로컬 세션은 삭제된다.
 */
export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw error;
  }
}

/**
 * 세션 복원: 저장된 세션이 있으면 반환한다.
 */
export async function getSession(): Promise<AuthUser | null> {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  if (!data.session?.user) {
    return null;
  }

  return {
    id: data.session.user.id,
    email: data.session.user.email ?? '',
  };
}

/**
 * 소셜 로그인: Google 또는 Apple OAuth 플로우를 시스템 브라우저에서 실행한다.
 * 인증 완료 후 딥링크로 앱에 복귀하면 onAuthStateChange → SIGNED_IN 이벤트가 발생한다.
 * 신규 사용자의 경우 useAuth 훅에서 프로필 자동 생성을 처리한다.
 */
export async function signInWithOAuth(provider: OAuthProvider): Promise<void> {
  const redirectTo = Linking.createURL('auth/callback');

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (error) {
    throw error;
  }

  if (!data.url) {
    throw new Error('소셜 로그인 URL을 가져올 수 없습니다.');
  }

  // 시스템 브라우저에서 OAuth 페이지를 열고 딥링크 복귀를 대기한다.
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  if (result.type === 'cancel' || result.type === 'dismiss') {
    throw new Error('USER_CANCELLED');
  }

  // 브라우저에서 딥링크로 복귀한 경우, URL에서 세션 토큰을 추출하여 설정
  if (result.type === 'success' && result.url) {
    const hashIndex = result.url.indexOf('#');
    if (hashIndex !== -1) {
      const hash = result.url.substring(hashIndex + 1);
      const params = new URLSearchParams(hash);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');

      if (accessToken && refreshToken) {
        await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
      }
    }
  }
}

/**
 * 소셜 로그인 시 provider display name에서 닉네임을 추출한다.
 * full_name → name → 이메일 @ 앞부분 → '사용자' 순서로 폴백한다.
 * 닉네임 길이 제약(2~20자)에 맞게 잘라낸다.
 */
export function extractSocialNickname(
  userMetadata: Record<string, unknown> | undefined,
  email: string | undefined,
): string {
  const fullName = userMetadata?.full_name as string | undefined;
  const name = userMetadata?.name as string | undefined;
  const emailPrefix = email?.split('@')[0];

  // 빈 문자열도 폴백 대상이므로 || 사용 (nullish coalescing 대신)
  const raw = fullName || name || emailPrefix || '사용자';

  // 닉네임 길이 제약: 2~20자
  const trimmed = raw.slice(0, 20);
  return trimmed.length >= 2 ? trimmed : '사용자';
}

/**
 * 현재 사용자의 프로필을 조회한다.
 */
export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // 레코드 없음
      return null;
    }
    throw error;
  }

  return data as Profile;
}
