import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { HoldingCardData, AssetType } from '../types/dashboard';

// ────────────────────────────────────────────
// 상수
// ────────────────────────────────────────────

const ASSET_TYPE_BADGE: Record<AssetType, { label: string; bg: string; text: string }> = {
  korean_stock: { label: '한국주식', bg: '#d6e3fb', text: '#586579' },
  us_stock: { label: '미국주식', bg: '#dde1ff', text: '#0038b6' },
  crypto: { label: '코인', bg: '#e5eeff', text: '#434656' },
};

// ────────────────────────────────────────────
// 포맷 유틸
// ────────────────────────────────────────────

function formatKrw(value: number): string {
  if (Math.abs(value) >= 100_000_000) return `${(value / 100_000_000).toFixed(2)}억원`;
  if (Math.abs(value) >= 10_000) return `${Math.round(value / 10_000).toLocaleString('ko-KR')}만원`;
  return `${Math.round(value).toLocaleString('ko-KR')}원`;
}

function formatQuantity(quantity: number): string {
  if (quantity % 1 === 0) return quantity.toLocaleString('ko-KR');
  return quantity.toFixed(4);
}

/**
 * 원 통화 표시 (KRW이면 ₩, USD이면 $, 코인이면 코인티커 없이 숫자)
 */
function formatOrigPrice(value: number, currency: string): string {
  if (currency === 'KRW') return `₩${Math.round(value).toLocaleString('ko-KR')}`;
  if (currency === 'USD') return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  // 코인: 소수점 8자리까지
  return value.toFixed(6).replace(/\.?0+$/, '');
}

// ────────────────────────────────────────────
// 컴포넌트
// ────────────────────────────────────────────

interface HoldingCardProps {
  data: HoldingCardData;
}

export const HoldingCard = memo(function HoldingCard({ data }: HoldingCardProps) {
  const badge = ASSET_TYPE_BADGE[data.asset_type];
  const isKrw = data.asset_type === 'korean_stock';
  const isProfitable = data.profit_rate !== null && data.profit_rate >= 0;
  const profitColor = data.profit_rate === null
    ? '#434656'
    : isProfitable
    ? '#005b21'
    : '#ba1a1a';

  return (
    <View style={styles.card}>
      {/* 상단: 종목 정보 + 평가금액 */}
      <View style={styles.topRow}>
        <View style={styles.nameSection}>
          {/* 종목 심볼 아바타 */}
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {data.ticker.slice(0, 2).toUpperCase()}
            </Text>
          </View>
          <View>
            <Text style={styles.name} numberOfLines={1}>
              {data.name}
            </Text>
            <View style={styles.badgeRow}>
              <Text style={styles.ticker}>{data.ticker}</Text>
              <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                <Text style={[styles.badgeText, { color: badge.text }]}>
                  {badge.label}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.valueSection}>
          {data.evaluated_amount !== null ? (
            <Text style={styles.evaluatedAmount}>
              {formatKrw(data.evaluated_amount)}
            </Text>
          ) : (
            <Text style={styles.noData}>—</Text>
          )}
          {data.profit_rate !== null ? (
            <Text style={[styles.profitRate, { color: profitColor }]}>
              {isProfitable ? '+' : ''}
              {data.profit_rate.toFixed(2)}%
            </Text>
          ) : null}
          {data.profit_amount !== null ? (
            <Text style={[styles.profitAmount, { color: profitColor }]}>
              {isProfitable ? '+' : ''}
              {formatKrw(data.profit_amount)}
            </Text>
          ) : null}
        </View>
      </View>

      {/* 상세 정보 (배경색 구분) */}
      <View style={styles.detailSection}>
        {/* 평균 매수가 */}
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>평균매수가</Text>
          <Text style={styles.detailValue}>
            {formatOrigPrice(data.avg_buy_price, data.currency)}
          </Text>
          {!isKrw && (
            <Text style={styles.detailSubValue}>
              ≈ {formatKrw(data.avg_buy_price_krw)}
            </Text>
          )}
        </View>

        {/* 보유수량 */}
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>보유수량</Text>
          <Text style={styles.detailValue}>{formatQuantity(data.quantity)}</Text>
        </View>

        {/* 현재가 */}
        <View style={[styles.detailItem, styles.detailItemRight]}>
          <Text style={styles.detailLabel}>현재가</Text>
          {data.current_price !== null && data.current_price_orig !== null ? (
            <>
              <Text style={[styles.detailValue, styles.currentPriceText]}>
                {formatOrigPrice(data.current_price_orig, data.currency)}
              </Text>
              {!isKrw && (
                <Text style={styles.detailSubValue}>
                  ≈ {formatKrw(data.current_price)}
                </Text>
              )}
            </>
          ) : (
            <Text style={styles.noData}>조회 중</Text>
          )}
        </View>
      </View>

      {/* 캐시 데이터 경고 */}
      {data.is_price_cached && data.price_fetched_at && (
        <Text style={styles.cachedNote}>
          * 캐시 데이터 기준 (
          {new Date(data.price_fetched_at).toLocaleTimeString('ko-KR', {
            hour: '2-digit',
            minute: '2-digit',
          })}
          )
        </Text>
      )}
    </View>
  );
});

// ────────────────────────────────────────────
// 스타일
// ────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#0b1c30',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 24,
    elevation: 2,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  nameSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#dce9ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#003ec7',
  },
  name: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0b1c30',
    maxWidth: 120,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  ticker: {
    fontSize: 11,
    color: '#434656',
    fontWeight: '500',
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  valueSection: {
    alignItems: 'flex-end',
  },
  evaluatedAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0b1c30',
  },
  profitRate: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  profitAmount: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  noData: {
    fontSize: 13,
    color: '#737688',
  },
  detailSection: {
    flexDirection: 'row',
    backgroundColor: '#eff4ff',
    borderRadius: 8,
    padding: 12,
  },
  detailItem: {
    flex: 1,
  },
  detailItemRight: {
    alignItems: 'flex-end',
  },
  detailLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#434656',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  detailValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0b1c30',
  },
  currentPriceText: {
    color: '#003ec7',
  },
  detailSubValue: {
    fontSize: 10,
    color: '#434656',
    marginTop: 1,
  },
  cachedNote: {
    fontSize: 10,
    color: '#737688',
    marginTop: 8,
  },
});
