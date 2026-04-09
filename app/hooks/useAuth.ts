import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../utils/supabase';
import { createProfile } from '../services/auth';
import { AuthUser } from '../types/auth';

interface UseAuthResult {
  user: AuthUser | null;
  loading: boolean;
  /** 이메일 인증 완료 시 프로필을 생성하기 위해 닉네임을 임시 보관하는 setter */
  setPendingNickname: (nickname: string) => void;
}

/**
 * Supabase Auth 세션을 구독하여 인증 상태를 관리하는 훅.
 * 앱 시작 시 저장된 세션을 복원하고, 세션 변화(로그인/로그아웃/만료)를 감지한다.
 *
 * 이메일 인증 플로우:
 * - 회원가입 후 이메일 인증 대기 중: user=null, pendingNickname에 닉네임 보관
 * - 이메일 인증 완료(SIGNED_IN 이벤트): pendingNickname이 있으면 createProfile 호출 후 user 설정
 */
export function useAuth(): UseAuthResult {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  // 이메일 인증 완료 전 닉네임을 임시 보관 (메모리)
  const pendingNicknameRef = useRef<string | null>(null);

  const setPendingNickname = useCallback((nickname: string) => {
    pendingNicknameRef.current = nickname;
  }, []);

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
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        const authUser: AuthUser = {
          id: session.user.id,
          email: session.user.email ?? '',
        };

        // 이메일 인증 완료(SIGNED_IN) + 닉네임 보관 중이면 프로필 생성
        if (event === 'SIGNED_IN' && pendingNicknameRef.current) {
          const nickname = pendingNicknameRef.current;
          pendingNicknameRef.current = null;

          // setLoading(true)로 AuthScreen 깜빡임 방지 후 프로필 생성 완료 시 user 설정
          setLoading(true);
          createProfile({ userId: authUser.id, nickname })
            .then(() => {
              setUser(authUser);
            })
            .catch((profileError) => {
              console.error('프로필 생성 오류:', profileError);
              // 프로필 생성 실패 시에도 로그인은 유지 (재시도 가능)
              setUser(authUser);
            })
            .finally(() => {
              setLoading(false);
            });
        } else {
          setUser(authUser);
          setLoading(false);
        }
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      subscription.subscription.unsubscribe();
    };
  }, []);

  return { user, loading, setPendingNickname };
}
