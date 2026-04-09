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
