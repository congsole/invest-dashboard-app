/**
 * MainScreen.tsx — 앱 메인 화면 (탭 네비게이션 컨테이너)
 *
 * 탭 구성:
 *   - 대시보드 (DashboardScreen)
 *   - 투자 일지 (MemoListScreen → MemoEditScreen)
 *   - 설정 (SettingsScreen → CategoryManageScreen → CategoryStocksScreen)
 *
 * 이슈 024: 설정 탭에 카테고리 관리 스택 추가
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { DashboardScreen } from './DashboardScreen';
import { MemoListScreen } from './MemoListScreen';
import { MemoEditScreen } from './MemoEditScreen';
import { SettingsScreen } from './SettingsScreen';
import { CategoryManageScreen } from './CategoryManageScreen';
import { CategoryStocksScreen } from './CategoryStocksScreen';
import { AuthUser } from '../types/auth';
import { UserCategoryWithCount } from '../types/category';

// ────────────────────────────────────────────
// 탭 타입
// ────────────────────────────────────────────

type TabKey = 'dashboard' | 'memo' | 'settings';

// ────────────────────────────────────────────
// 메모 화면 스택 상태
// ────────────────────────────────────────────

type MemoRoute =
  | { screen: 'list' }
  | { screen: 'edit'; memoId?: string }
  // [025] 메모 탭에서 카테고리 관리 화면으로 이동
  | { screen: 'category-manage-from-memo' }
  | { screen: 'category-stocks-from-memo'; category: UserCategoryWithCount };

// ────────────────────────────────────────────
// 설정 화면 스택 상태
// ────────────────────────────────────────────

type SettingsRoute =
  | { screen: 'settings' }
  | { screen: 'category-manage' }
  | { screen: 'category-stocks'; category: UserCategoryWithCount };

// ────────────────────────────────────────────
// Props
// ────────────────────────────────────────────

interface MainScreenProps {
  user: AuthUser;
}

// ────────────────────────────────────────────
// MainScreen
// ────────────────────────────────────────────

export function MainScreen({ user }: MainScreenProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [memoRoute, setMemoRoute] = useState<MemoRoute>({ screen: 'list' });
  const [settingsRoute, setSettingsRoute] = useState<SettingsRoute>({ screen: 'settings' });

  // ── 메모 탭 핸들러 ──

  const handleMemoPress = useCallback((memoId: string) => {
    setMemoRoute({ screen: 'edit', memoId });
  }, []);

  const handleAddMemo = useCallback(() => {
    setMemoRoute({ screen: 'edit', memoId: undefined });
  }, []);

  const handleMemoSaved = useCallback(() => {
    setMemoRoute({ screen: 'list' });
  }, []);

  const handleMemoDeleted = useCallback(() => {
    setMemoRoute({ screen: 'list' });
  }, []);

  const handleMemoBack = useCallback(() => {
    setMemoRoute({ screen: 'list' });
  }, []);

  // [025] 메모 탭 → 카테고리 관리 화면
  const handleCategoryManageFromMemo = useCallback(() => {
    setMemoRoute({ screen: 'category-manage-from-memo' });
  }, []);

  const handleCategoryPressFromMemo = useCallback((category: UserCategoryWithCount) => {
    setMemoRoute({ screen: 'category-stocks-from-memo', category });
  }, []);

  const handleBackToCategoryManageFromMemo = useCallback(() => {
    setMemoRoute({ screen: 'category-manage-from-memo' });
  }, []);

  const handleBackToMemoList = useCallback(() => {
    setMemoRoute({ screen: 'list' });
  }, []);

  // ── 설정 탭 핸들러 ──

  const handleCategoryManage = useCallback(() => {
    setSettingsRoute({ screen: 'category-manage' });
  }, []);

  const handleCategoryPress = useCallback((category: UserCategoryWithCount) => {
    setSettingsRoute({ screen: 'category-stocks', category });
  }, []);

  const handleBackToSettings = useCallback(() => {
    setSettingsRoute({ screen: 'settings' });
  }, []);

  const handleBackToCategoryManage = useCallback(() => {
    setSettingsRoute({ screen: 'category-manage' });
  }, []);

  // ── 탭 전환 핸들러 ──

  const handleTabPress = useCallback(
    (tab: TabKey) => {
      setActiveTab(tab);
      // 탭 전환 시 각 스택을 루트로 리셋
      if (tab === 'memo') {
        setMemoRoute({ screen: 'list' });
      }
      if (tab === 'settings') {
        setSettingsRoute({ screen: 'settings' });
      }
    },
    [],
  );

  return (
    <View style={styles.container}>
      {/* 탭 콘텐츠 */}
      <View style={styles.content}>
        {/* 대시보드 */}
        {activeTab === 'dashboard' && <DashboardScreen />}

        {/* 투자 일지 */}
        {activeTab === 'memo' && memoRoute.screen === 'list' && (
          <MemoListScreen
            onMemoPress={handleMemoPress}
            onAddMemo={handleAddMemo}
            userId={user.id}
            onCategoryManagePress={handleCategoryManageFromMemo}
          />
        )}
        {activeTab === 'memo' && memoRoute.screen === 'edit' && (
          <MemoEditScreen
            memoId={memoRoute.memoId}
            userId={user.id}
            onSaved={handleMemoSaved}
            onDeleted={handleMemoDeleted}
            onBack={handleMemoBack}
          />
        )}
        {/* [025] 메모 탭 → 카테고리 관리 화면 */}
        {activeTab === 'memo' && memoRoute.screen === 'category-manage-from-memo' && (
          <CategoryManageScreen
            user={user}
            onCategoryPress={handleCategoryPressFromMemo}
            onBack={handleBackToMemoList}
          />
        )}
        {activeTab === 'memo' && memoRoute.screen === 'category-stocks-from-memo' && (
          <CategoryStocksScreen
            categoryId={memoRoute.category.id}
            categoryName={memoRoute.category.name}
            onBack={handleBackToCategoryManageFromMemo}
          />
        )}

        {/* 설정 */}
        {activeTab === 'settings' && settingsRoute.screen === 'settings' && (
          <SettingsScreen
            user={user}
            onCategoryManage={handleCategoryManage}
          />
        )}
        {activeTab === 'settings' && settingsRoute.screen === 'category-manage' && (
          <CategoryManageScreen
            user={user}
            onCategoryPress={handleCategoryPress}
            onBack={handleBackToSettings}
          />
        )}
        {activeTab === 'settings' && settingsRoute.screen === 'category-stocks' && (
          <CategoryStocksScreen
            categoryId={settingsRoute.category.id}
            categoryName={settingsRoute.category.name}
            onBack={handleBackToCategoryManage}
          />
        )}
      </View>

      {/* 하단 탭 바 */}
      <SafeAreaView style={styles.tabBarSafeArea}>
        <View style={styles.tabBar}>
          <TabBarItem
            label="대시보드"
            icon="chart"
            active={activeTab === 'dashboard'}
            onPress={() => handleTabPress('dashboard')}
          />
          <TabBarItem
            label="투자 일지"
            icon="memo"
            active={activeTab === 'memo'}
            onPress={() => handleTabPress('memo')}
          />
          <TabBarItem
            label="설정"
            icon="settings"
            active={activeTab === 'settings'}
            onPress={() => handleTabPress('settings')}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}

// ────────────────────────────────────────────
// TabBarItem
// ────────────────────────────────────────────

interface TabBarItemProps {
  label: string;
  icon: 'chart' | 'memo' | 'settings';
  active: boolean;
  onPress: () => void;
}

function TabBarItem({ label, icon, active, onPress }: TabBarItemProps) {
  const iconChar = icon === 'chart' ? '◎' : icon === 'memo' ? '✏' : '⚙';
  return (
    <TouchableOpacity style={styles.tabItem} onPress={onPress} activeOpacity={0.8}>
      <Text style={[styles.tabIcon, active && styles.tabIconActive]}>{iconChar}</Text>
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ────────────────────────────────────────────
// 스타일
// ────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9ff',
  },
  content: {
    flex: 1,
  },
  tabBarSafeArea: {
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5eeff',
  },
  tabBar: {
    flexDirection: 'row',
    paddingTop: 8,
    paddingBottom: 4,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: 4,
  },
  tabIcon: {
    fontSize: 20,
    color: '#737688',
  },
  tabIconActive: {
    color: '#003ec7',
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#737688',
  },
  tabLabelActive: {
    color: '#003ec7',
  },
});
