import { supabase } from '../utils/supabase';

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
  const { data, error } = await supabase.auth.signUp({ email, password });

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
  const { error } = await supabase.auth.resend({ type: 'signup', email });

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
