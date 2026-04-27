import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { KpiCardData } from '../types/dashboard';

// ────────────────────────────────────────────
// 포맷 유틸
// ────────────────────────────────────────────

function formatKrw(value: number): string {
  if (Math.abs(value) >= 100_000_000) {
    return `${(value / 100_000_000).toFixed(2)}억원`;
  }
  if (Math.abs(value) >= 10_000) {
    return `${Math.round(value / 10_000).toLocaleString('ko-KR')}만원`;
  }
  return `${Math.round(value).toLocaleString('ko-KR')}원`;
}

function formatKrwShort(value: number): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= 100_000_000) return `${sign}${(abs / 100_000_000).toFixed(2)}억`;
  if (abs >= 10_000) return `${sign}${(abs / 10_000).toFixed(0)}만`;
  return `${sign}${abs.toLocaleString('ko-KR')}`;
}

function formatUsd(value: number): string {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

// ────────────────────────────────────────────
// 1차 행 — 큰 KPI 카드
// ────────────────────────────────────────────

interface PrimaryKpiCardProps {
  label: string;
  value: string;
  subLabel?: string;
  valueColor?: string;
}

const PrimaryKpiCard = memo(function PrimaryKpiCard({
  label,
  value,
  subLabel,
  valueColor,
}: PrimaryKpiCardProps) {
  return (
    <View style={primaryStyles.card}>
      <Text style={primaryStyles.label}>{label}</Text>
      <Text style={[primaryStyles.value, valueColor ? { color: valueColor } : null]}>
        {value}
      </Text>
      {subLabel ? <Text style={primaryStyles.subLabel}>{subLabel}</Text> : null}
    </View>
  );
});

// ────────────────────────────────────────────
// 2차 행 — 작은 KPI 카드
// ────────────────────────────────────────────

interface SecondaryKpiCardProps {
  label: string;
  value: string;
  subLabel?: string;
}

const SecondaryKpiCard = memo(function SecondaryKpiCard({
  label,
  value,
  subLabel,
}: SecondaryKpiCardProps) {
  return (
    <View style={secondaryStyles.card}>
      <Text style={secondaryStyles.label}>{label}</Text>
      <Text style={secondaryStyles.value}>{value}</Text>
      {subLabel ? <Text style={secondaryStyles.subLabel}>{subLabel}</Text> : null}
    </View>
  );
});

// ────────────────────────────────────────────
// 메인 KPI 카드 섹션
// ────────────────────────────────────────────

interface KpiCardSectionProps {
  data: KpiCardData;
}

export const KpiCardSection = memo(function KpiCardSection({ data }: KpiCardSectionProps) {
  const {
    totalValueKrw,
    principalKrw,
    netProfitKrw,
    returnRatePct,
    cashKrw,
    cashUsd,
    cashTotalKrw,
    cumulativeDividendKrw,
    cumulativeFeeKrw,
    cumulativeTaxKrw,
  } = data;

  const isProfit = netProfitKrw >= 0;
  const profitColor = isProfit ? '#005b21' : '#ba1a1a';
  const profitPrefix = isProfit ? '+' : '';

  // 예수금 서브 라벨: "₩XXX + $YYY ≈ ₩ZZZ"
  const cashSubLabel =
    cashUsd > 0
      ? `₩${Math.round(cashKrw).toLocaleString('ko-KR')} + ${formatUsd(cashUsd)} ≈ ${formatKrw(cashTotalKrw)}`
      : undefined;

  // 순수익 서브 라벨
  const profitSubLabel = `${profitPrefix}${returnRatePct.toFixed(2)}%`;

  return (
    <View style={styles.container}>
      {/* 1차 행 — 큰 카드 3개 */}
      <View style={styles.primaryRow}>
        <PrimaryKpiCard
          label="총 평가액"
          value={formatKrw(totalValueKrw)}
        />
        <PrimaryKpiCard
          label="원금"
          value={formatKrw(principalKrw)}
        />
        <PrimaryKpiCard
          label="순수익"
          value={`${profitPrefix}${formatKrwShort(netProfitKrw)}`}
          subLabel={profitSubLabel}
          valueColor={profitColor}
        />
      </View>

      {/* 2차 행 — 작은 카드 4개 */}
      <View style={styles.secondaryRow}>
        <SecondaryKpiCard
          label="예수금"
          value={formatKrw(cashTotalKrw)}
          subLabel={cashSubLabel}
        />
        <SecondaryKpiCard
          label="누적 배당금"
          value={formatKrw(cumulativeDividendKrw)}
        />
        <SecondaryKpiCard
          label="누적 수수료"
          value={formatKrw(cumulativeFeeKrw)}
        />
        <SecondaryKpiCard
          label="누적 세금"
          value={formatKrw(cumulativeTaxKrw)}
        />
      </View>
    </View>
  );
});

// ────────────────────────────────────────────
// 스타일
// ────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  primaryRow: {
    flexDirection: 'row',
    gap: 8,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: 6,
  },
});

const primaryStyles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    shadowColor: '#0b1c30',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 24,
    elevation: 2,
    minHeight: 90,
  },
  label: {
    fontSize: 9,
    fontWeight: '700',
    color: '#434656',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  value: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0b1c30',
    letterSpacing: -0.3,
  },
  subLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#737688',
    marginTop: 4,
  },
});

const secondaryStyles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: '#eff4ff',
    borderRadius: 10,
    padding: 10,
    minHeight: 68,
  },
  label: {
    fontSize: 8,
    fontWeight: '700',
    color: '#434656',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 5,
  },
  value: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0b1c30',
    letterSpacing: -0.2,
  },
  subLabel: {
    fontSize: 8,
    color: '#737688',
    marginTop: 3,
    lineHeight: 11,
  },
});
