/**
 * useSnapshotRefresh — 당일 스냅샷 수동 새로고침 훅
 *
 * 담당:
 * - 초기 마운트 및 앱 포그라운드 복귀 시 쿼터 동기화
 * - 새로고침 버튼 탭 처리: refreshTodaySnapshot 호출 → 응답 quota로 상태 갱신
 * - 횟수 소진(remaining=0) 감지
 * - 에러 상태 관리 (429, 422, 502 등)
 *
 * CLAUDE.md 렌더링 최적화 원칙 준수:
 * - refreshing 상태를 분리하여 새로고침 중에도 기존 그래프 유지
 * - quota 상태는 이 훅 내부로 격리 (부모 리렌더링 최소화)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import {
  getSnapshotRefreshQuota,
  refreshTodaySnapshot,
} from '../services/dashboard';
import {
  DailySnapshot,
  MarketPriceItem,
  SnapshotRefreshQuota,
} from '../types/dashboard';

export const MAX_SNAPSHOT_QUOTA = 3;

const INITIAL_QUOTA: SnapshotRefreshQuota = {
  used_count: 0,
  remaining: MAX_SNAPSHOT_QUOTA,
  last_refreshed_at: null,
};

// ────────────────────────────────────────────
// 에러 코드 → 사용자 친화적 메시지
// ────────────────────────────────────────────

function toUserMessage(e: unknown): string {
  if (!(e instanceof Error)) return '새로고침에 실패했습니다.';

  const msg = e.message;

  if (msg.includes('429') || msg.includes('일 3회 제한')) {
    return '오늘 새로고침 횟수(3회)를 모두 사용했습니다.';
  }
  if (msg.includes('422') || msg.includes('account_events')) {
    return '등록된 이벤트가 없어 스냅샷을 계산할 수 없습니다.';
  }
  if (msg.includes('502') || msg.includes('내부 계산')) {
    return '서버 내부 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
  }
  if (msg.includes('401') || msg.includes('인증')) {
    return '인증이 만료되었습니다. 다시 로그인해 주세요.';
  }
  if (msg.includes('400')) {
    return '요청 데이터에 오류가 있습니다. 앱을 새로고침 해 주세요.';
  }

  return '새로고침에 실패했습니다. 잠시 후 다시 시도해 주세요.';
}

// ────────────────────────────────────────────
// 훅 결과 타입
// ────────────────────────────────────────────

export interface UseSnapshotRefreshResult {
  quota: SnapshotRefreshQuota;
  /** 새로고침 API 호출 중 (기존 그래프는 유지됨) */
  refreshing: boolean;
  /** 에러 메시지 (null이면 정상) */
  refreshError: string | null;
  /**
   * 새로고침 버튼 탭 핸들러.
   * @param currentPrices 현재 화면에서 사용 중인 시장가 목록
   * @param fxRateUsd     현재 환율
   * @param onSuccess     성공 시 갱신된 스냅샷을 전달받는 콜백
   */
  handleRefresh: (
    currentPrices: MarketPriceItem[],
    fxRateUsd: number,
    onSuccess: (snapshot: DailySnapshot) => void,
  ) => void;
  /** 에러 메시지 닫기 */
  clearRefreshError: () => void;
}

// ────────────────────────────────────────────
// 훅
// ────────────────────────────────────────────

export function useSnapshotRefresh(): UseSnapshotRefreshResult {
  const [quota, setQuota] = useState<SnapshotRefreshQuota>(INITIAL_QUOTA);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  // AppState 이벤트 구독을 위한 ref
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // ── 쿼터 동기화 ──
  const syncQuota = useCallback(async () => {
    try {
      const q = await getSnapshotRefreshQuota();
      setQuota(q);
    } catch {
      // 쿼터 조회 실패는 조용히 무시 (UI 기본값 유지)
    }
  }, []);

  // ── 초기 마운트 시 쿼터 동기화 ──
  useEffect(() => {
    syncQuota();
  }, [syncQuota]);

  // ── 앱 포그라운드 복귀 시 쿼터 재동기화 ──
  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        const prev = appStateRef.current;
        appStateRef.current = nextState;

        // background/inactive → active 전환 시에만 재조회
        if (
          (prev === 'background' || prev === 'inactive') &&
          nextState === 'active'
        ) {
          syncQuota();
        }
      },
    );

    return () => subscription.remove();
  }, [syncQuota]);

  // ── 새로고침 버튼 핸들러 ──
  const handleRefresh = useCallback(
    (
      currentPrices: MarketPriceItem[],
      fxRateUsd: number,
      onSuccess: (snapshot: DailySnapshot) => void,
    ) => {
      // 소진 상태라면 즉시 안내 후 반환
      if (quota.remaining <= 0) {
        setRefreshError('오늘 새로고침 횟수(3회)를 모두 사용했습니다.');
        return;
      }

      if (refreshing) return;

      setRefreshing(true);
      setRefreshError(null);

      refreshTodaySnapshot(currentPrices, fxRateUsd)
        .then((res) => {
          setQuota(res.quota);
          onSuccess(res.snapshot);
        })
        .catch((e: unknown) => {
          setRefreshError(toUserMessage(e));
          // 429는 서버에서 횟수를 차감하지 않지만 쿼터를 재동기화해 최신 상태 반영
          syncQuota();
        })
        .finally(() => {
          setRefreshing(false);
        });
    },
    [quota.remaining, refreshing, syncQuota],
  );

  const clearRefreshError = useCallback(() => {
    setRefreshError(null);
  }, []);

  return {
    quota,
    refreshing,
    refreshError,
    handleRefresh,
    clearRefreshError,
  };
}
