/**
 * MainScreen.tsx — 앱 메인 화면 (탭 네비게이션 컨테이너)
 *
 * 탭 구성:
 *   - 대시보드 (DashboardScreen)
 *   - 투자 일지 (MemoListScreen → MemoEditScreen)
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

// ────────────────────────────────────────────
// 탭 타입
// ────────────────────────────────────────────

type TabKey = 'dashboard' | 'memo';

// ────────────────────────────────────────────
// 메모 화면 스택 상태
// ────────────────────────────────────────────

type MemoRoute =
  | { screen: 'list' }
  | { screen: 'edit'; memoId?: string };

// ────────────────────────────────────────────
// MainScreen
// ────────────────────────────────────────────

export function MainScreen() {
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [memoRoute, setMemoRoute] = useState<MemoRoute>({ screen: 'list' });

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

  const handleTabPress = useCallback(
    (tab: TabKey) => {
      setActiveTab(tab);
      // 메모 탭으로 돌아오면 목록으로 리셋
      if (tab === 'memo') {
        setMemoRoute({ screen: 'list' });
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
          />
        )}
        {activeTab === 'memo' && memoRoute.screen === 'edit' && (
          <MemoEditScreen
            memoId={memoRoute.memoId}
            onSaved={handleMemoSaved}
            onDeleted={handleMemoDeleted}
            onBack={handleMemoBack}
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
  icon: 'chart' | 'memo';
  active: boolean;
  onPress: () => void;
}

function TabBarItem({ label, icon, active, onPress }: TabBarItemProps) {
  const iconChar = icon === 'chart' ? '◎' : '✏';
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
