/**
 * CalendarView.tsx — 달력형 메모 뷰 컴포넌트
 *
 * - created_at 기준으로 날짜 칸에 메모 배치
 * - 각 칸: 그날 존재하는 연결 타입 점 표시 (최대 4개)
 * - 날짜 탭 → 해당 날의 메모 목록으로 진입 (onDayPress 콜백)
 */

import React, { useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { DayMemoSummary, ENTITY_COLORS, EntityType } from '../types/memo';

interface CalendarViewProps {
  year: number;
  month: number; // 1-based
  calendarSummary: Map<string, DayMemoSummary>;
  onDayPress: (date: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function getFirstWeekday(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay();
}

function padZero(n: number): string {
  return n.toString().padStart(2, '0');
}

export const CalendarView = React.memo(function CalendarView({
  year,
  month,
  calendarSummary,
  onDayPress,
  onPrevMonth,
  onNextMonth,
}: CalendarViewProps) {
  // 달력 칸 배열 생성 (null = 빈 칸)
  const cells = useMemo(() => {
    const days = getDaysInMonth(year, month);
    const firstDay = getFirstWeekday(year, month);
    const arr: Array<number | null> = [];
    for (let i = 0; i < firstDay; i++) arr.push(null);
    for (let d = 1; d <= days; d++) arr.push(d);
    // 6행 채우기
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [year, month]);

  const today = new Date();
  const isCurrentMonth =
    today.getFullYear() === year && today.getMonth() + 1 === month;
  const todayDate = isCurrentMonth ? today.getDate() : -1;

  const handleDayPress = useCallback(
    (day: number) => {
      const dateStr = `${year}-${padZero(month)}-${padZero(day)}`;
      onDayPress(dateStr);
    },
    [year, month, onDayPress],
  );

  return (
    <View style={styles.container}>
      {/* 월 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.navBtn} onPress={onPrevMonth} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.navIcon}>{'<'}</Text>
        </TouchableOpacity>
        <Text style={styles.monthLabel}>
          {year}년 {month}월
        </Text>
        <TouchableOpacity style={styles.navBtn} onPress={onNextMonth} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.navIcon}>{'>'}</Text>
        </TouchableOpacity>
      </View>

      {/* 요일 헤더 */}
      <View style={styles.weekdayRow}>
        {WEEKDAYS.map((wd, idx) => (
          <Text
            key={wd}
            style={[
              styles.weekdayText,
              idx === 0 && styles.sunday,
              idx === 6 && styles.saturday,
            ]}
          >
            {wd}
          </Text>
        ))}
      </View>

      {/* 날짜 칸 */}
      <View style={styles.grid}>
        {cells.map((day, idx) => {
          if (day === null) {
            return <View key={`empty-${idx}`} style={styles.cell} />;
          }

          const dateStr = `${year}-${padZero(month)}-${padZero(day)}`;
          const summary = calendarSummary.get(dateStr);
          const isToday = day === todayDate;
          const weekdayIdx = idx % 7;

          return (
            <DayCell
              key={dateStr}
              day={day}
              isToday={isToday}
              isSunday={weekdayIdx === 0}
              isSaturday={weekdayIdx === 6}
              entityTypes={summary?.entityTypes ?? []}
              hasMemo={(summary?.memoIds.length ?? 0) > 0}
              onPress={handleDayPress}
            />
          );
        })}
      </View>
    </View>
  );
});

// ── 개별 날짜 칸 ──

interface DayCellProps {
  day: number;
  isToday: boolean;
  isSunday: boolean;
  isSaturday: boolean;
  entityTypes: EntityType[];
  hasMemo: boolean;
  onPress: (day: number) => void;
}

const DayCell = React.memo(function DayCell({
  day,
  isToday,
  isSunday,
  isSaturday,
  entityTypes,
  hasMemo,
  onPress,
}: DayCellProps) {
  const handlePress = useCallback(() => onPress(day), [day, onPress]);

  return (
    <TouchableOpacity
      style={styles.cell}
      onPress={handlePress}
      activeOpacity={hasMemo ? 0.7 : 1}
    >
      <View style={[styles.dayContainer, isToday && styles.todayContainer]}>
        <Text
          style={[
            styles.dayText,
            isToday && styles.todayText,
            isSunday && !isToday && styles.sundayText,
            isSaturday && !isToday && styles.saturdayText,
          ]}
        >
          {day}
        </Text>
      </View>

      {/* 엔티티 타입 점 */}
      {entityTypes.length > 0 && (
        <View style={styles.dotsRow}>
          {entityTypes.slice(0, 4).map((et, dotIdx) => (
            <View
              key={`${et}-${dotIdx}`}
              style={[styles.dot, { backgroundColor: ENTITY_COLORS[et] }]}
            />
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#0b1c30',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  navBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navIcon: {
    fontSize: 18,
    color: '#434656',
    fontWeight: '700',
  },
  monthLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0b1c30',
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  weekdayText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    color: '#737688',
    paddingVertical: 4,
  },
  sunday: {
    color: '#ba1a1a',
  },
  saturday: {
    color: '#003ec7',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: `${100 / 7}%`,
    alignItems: 'center',
    paddingVertical: 4,
    minHeight: 48,
  },
  dayContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayContainer: {
    backgroundColor: '#003ec7',
  },
  dayText: {
    fontSize: 13,
    color: '#0b1c30',
    fontWeight: '500',
  },
  todayText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  sundayText: {
    color: '#ba1a1a',
  },
  saturdayText: {
    color: '#003ec7',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 2,
    marginTop: 2,
    flexWrap: 'wrap',
    justifyContent: 'center',
    maxWidth: 32,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
});
