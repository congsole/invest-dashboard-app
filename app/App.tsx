import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { supabase } from './utils/supabase';

export default function App() {
  const [status, setStatus] = useState<'testing' | 'ok' | 'error'>('testing');

  useEffect(() => {
    supabase.from('_test_connection').select('*').limit(1).then(({ error }) => {
      // 테이블 없음 오류(42P01)는 연결 성공으로 간주
      if (!error || error.code === '42P01' || error.code === 'PGRST205') {
        setStatus('ok');
      } else {
        console.error('!!Supabase error:', error);
        setStatus('error');
      }
    });
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Supabase 연결 상태ㅎㅎ</Text>
      <Text style={[styles.status, styles[status]]}>
        {status === 'testing' ? '테스트 중...' : status === 'ok' ? '연결 성공 ✓' : '연결 실패 ✗'}
      </Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 16,
    marginBottom: 8,
    color: '#333',
  },
  status: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  testing: { color: '#999' },
  ok: { color: '#22c55e' },
  error: { color: '#ef4444' },
});
