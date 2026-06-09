/**
 * MemoCard.tsx — 리스트형 메모 항목 컴포넌트
 *
 * 본문 미리보기 + 작성 일시 + 연결 엔티티 칩을 표시한다.
 */

import React, { useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MemoItem, EntityType } from '../types/memo';
import { EntityChip } from './EntityChip';

interface MemoCardProps {
  memo: MemoItem;
  onPress: (memo: MemoItem) => void;
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${month}월 ${day}일 ${hours}:${minutes}`;
}

// 메모 아이템에서 칩 목록 생성 (최대 4개)
function buildChips(memo: MemoItem): Array<{ entityType: EntityType; label: string; key: string }> {
  const chips: Array<{ entityType: EntityType; label: string; key: string }> = [];

  for (const s of memo.stocks) {
    chips.push({ entityType: 'stock', label: s.name, key: `stock-${s.stock_id}` });
  }
  for (const te of memo.trade_events) {
    const label = te.ticker ? `${te.event_type === 'buy' ? '매수' : '매도'} ${te.ticker}` : te.event_type === 'buy' ? '매수' : '매도';
    chips.push({ entityType: 'trade_event', label, key: `te-${te.event_id}` });
  }
  for (const n of memo.news) {
    chips.push({ entityType: 'news', label: '뉴스', key: `news-${n.news_id}` });
  }
  for (const sec of memo.sectors) {
    // [019] L2~L4 섹터는 레벨 배지를 접두어로 표시
    const label = sec.level > 1 ? `L${sec.level} ${sec.name}` : sec.name;
    chips.push({ entityType: 'sector', label, key: `sec-${sec.sector_id}` });
  }
  // [025] 카테고리 칩 추가
  for (const cat of memo.categories) {
    chips.push({ entityType: 'category', label: cat.name, key: `cat-${cat.category_id}` });
  }

  if (chips.length === 0) {
    chips.push({ entityType: 'none', label: '일반', key: 'none' });
  }

  return chips.slice(0, 4);
}

export const MemoCard = React.memo(function MemoCard({ memo, onPress }: MemoCardProps) {
  const chips = useMemo(() => buildChips(memo), [memo]);
  const handlePress = useCallback(() => onPress(memo), [memo, onPress]);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={handlePress}
      activeOpacity={0.85}
    >
      {/* 본문 미리보기 */}
      <Text style={styles.body} numberOfLines={2}>
        {memo.body}
      </Text>

      {/* 하단 행: 칩 + 날짜 */}
      <View style={styles.footer}>
        <View style={styles.chips}>
          {chips.map((chip) => (
            <EntityChip
              key={chip.key}
              entityType={chip.entityType}
              label={chip.label}
            />
          ))}
        </View>
        <Text style={styles.date}>{formatDate(memo.created_at)}</Text>
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    gap: 10,
    shadowColor: '#0b1c30',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  body: {
    fontSize: 14,
    color: '#0b1c30',
    fontWeight: '500',
    lineHeight: 20,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    flex: 1,
  },
  date: {
    fontSize: 11,
    color: '#737688',
    flexShrink: 0,
  },
});
