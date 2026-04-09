import { supabase } from '../utils/supabase';

// ────────────────────────────────────────────
// Types
// ────────────────────────────────────────────

export interface SignUpParams {
  email: string;
  password: string;
  nickname: string;
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
 * 회원가입: Supabase Auth에 계정을 생성하고, profiles 테이블에 닉네임을 저장한다.
 */
export async function signUp({ email, password, nickname }: SignUpParams): Promise<AuthUser> {
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    throw error;
  }

  if (!data.user) {
    throw new Error('회원가입에 실패했습니다.');
  }

  // profiles 테이블에 닉네임 저장
  // 실패 시 auth 계정도 롤백 (onAuthStateChange로 인한 조기 화면 전환 방지)
  try {
    await createProfile({ userId: data.user.id, nickname });
  } catch (profileError) {
    await supabase.auth.signOut();
    throw profileError;
  }

  return {
    id: data.user.id,
    email: data.user.email ?? email,
  };
}

/**
 * 프로필 생성: 회원가입 직후 profiles 테이블에 닉네임을 저장한다.
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
