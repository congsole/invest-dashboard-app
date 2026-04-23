import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { AssetType } from '../types/dashboard';

export type FilterTab = 'all' | AssetType;

interface SectorFilterTabsProps {
  selected: FilterTab;
  onSelect: (tab: FilterTab) => void;
}

const TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'korean_stock', label: '한국주식' },
  { key: 'us_stock', label: '미국주식' },
  { key: 'crypto', label: '코인' },
];

export function SectorFilterTabs({ selected, onSelect }: SectorFilterTabsProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {TABS.map((tab) => {
        const isActive = selected === tab.key;
        return (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, isActive && styles.tabActive]}
            onPress={() => onSelect(tab.key)}
            activeOpacity={0.75}
          >
            <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 4,
    gap: 8,
  },
  tab: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 9999,
    backgroundColor: '#d3e4fe',
  },
  tabActive: {
    backgroundColor: '#003ec7',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#434656',
  },
  tabTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
});
