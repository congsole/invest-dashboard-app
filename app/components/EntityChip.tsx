/**
 * EntityChip.tsx — 연결 엔티티 칩 컴포넌트
 *
 * 타입별 색상:
 *   종목(stock)       → #3B82F6
 *   매매이벤트         → #22C55E
 *   뉴스               → #8B5CF6
 *   섹터               → #14B8A6
 *   연결 없음          → #9CA3AF
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { EntityType, ENTITY_COLORS } from '../types/memo';

interface EntityChipProps {
  entityType: EntityType;
  label: string;
}

const ENTITY_LABELS: Record<EntityType, string> = {
  stock: '종목',
  trade_event: '매매',
  news: '뉴스',
  sector: '섹터',
  category: '카테고리',
  none: '일반',
};

export const EntityChip = React.memo(function EntityChip({
  entityType,
  label,
}: EntityChipProps) {
  const bgColor = ENTITY_COLORS[entityType];

  return (
    <View style={[styles.chip, { backgroundColor: bgColor + '22' }]}>
      <View style={[styles.dot, { backgroundColor: bgColor }]} />
      <Text style={[styles.label, { color: bgColor }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 9999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
    maxWidth: 120,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    flexShrink: 1,
  },
});
