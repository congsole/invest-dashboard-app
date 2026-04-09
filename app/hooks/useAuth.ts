import { useEffect, useState } from 'react';
import { supabase } from '../utils/supabase';
import { AuthUser } from '../types/auth';

interface UseAuthResult {
  user: AuthUser | null;
  loading: boolean;
}

/**
 * Supabase Auth 세션을 구독하여 인증 상태를 관리하는 훅.
 * 앱 시작 시 저장된 세션을 복원하고, 세션 변화(로그인/로그아웃/만료)를 감지한다.
 */
export function useAuth(): UseAuthResult {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. 앱 시작 시 세션 복원
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.error('세션 복원 오류:', error.message);
        setUser(null);
      } else if (data.session?.user) {
        setUser({
          id: data.session.user.id,
          email: data.session.user.email ?? '',
        });
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    // 2. 인증 상태 변화 구독
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email ?? '',
        });
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => {
      subscription.subscription.unsubscribe();
    };
  }, []);

  return { user, loading };
}
