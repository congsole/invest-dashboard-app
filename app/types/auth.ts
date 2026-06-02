export interface AuthUser {
  id: string;
  email: string;
}

export interface Profile {
  id: string;
  user_id: string;
  nickname: string;
  created_at: string;
  updated_at: string;
}

export type AuthScreen = 'login' | 'signup';

/** 지원하는 소셜 로그인 provider */
export type OAuthProvider = 'google' | 'apple';

export interface SignInWithOAuthParams {
  provider: OAuthProvider;
}

export interface SignInWithOAuthResult {
  provider: OAuthProvider;
  url: string;
}
