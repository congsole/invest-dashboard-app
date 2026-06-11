/**
 * [028] 히스토리 그래프 개편 — get_history_markers 시그니처 변경 통합 테스트
 *
 * 이슈 028 BE 변경:
 *   - get_history_markers(p_from date, p_to date) → get_history_markers() (파라미터 없음)
 *   - event_type = 'dividend' 필터만 적용 (withdraw 제거)
 *   - 전체 기간 반환 (날짜 범위 조건 제거)
 *
 * 테스트 범위:
 *   1. 파라미터 없는 호출 성공
 *   2. 배당 이벤트만 반환 (withdraw 미포함)
 *   3. 전체 기간 반환 (과거 배당 포함)
 *   4. USD 배당 KRW 환산 (fx_rate_at_event 우선)
 *   5. 미인증 호출 차단
 *   6. 사용자 격리 (RLS)
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });

import { createClient, SupabaseClient } from '@supabase/supabase-js';

jest.setTimeout(30000);

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

const RUN_ID = Date.now();

let userClient: SupabaseClient;
let user2Client: SupabaseClient;
let adminClient: SupabaseClient;

let testUserId: string;
let testUser2Id: string;

const TEST_EMAIL_1 = `hm-test1-${RUN_ID}@example.com`;
const TEST_EMAIL_2 = `hm-test2-${RUN_ID}@example.com`;
const TEST_PASSWORD = 'TestPassword123!';

// ────────────────────────────────────────────
// 전역 Setup / Teardown
// ────────────────────────────────────────────

beforeAll(async () => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_KEY) {
    throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_KEY 환경변수가 필요합니다.');
  }

  adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // 테스트 유저 1 생성
  const { data: u1, error: e1 } = await adminClient.auth.admin.createUser({
    email: TEST_EMAIL_1,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (e1) throw new Error(`테스트 유저1 생성 실패: ${e1.message}`);
  testUserId = u1.user.id;

  // 테스트 유저 2 생성 (RLS 격리 검증용)
  const { data: u2, error: e2 } = await adminClient.auth.admin.createUser({
    email: TEST_EMAIL_2,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (e2) throw new Error(`테스트 유저2 생성 실패: ${e2.message}`);
  testUser2Id = u2.user.id;

  // 유저 1 로그인
  userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { error: signIn1 } = await userClient.auth.signInWithPassword({
    email: TEST_EMAIL_1,
    password: TEST_PASSWORD,
  });
  if (signIn1) throw new Error(`유저1 로그인 실패: ${signIn1.message}`);

  // 유저 2 로그인
  user2Client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { error: signIn2 } = await user2Client.auth.signInWithPassword({
    email: TEST_EMAIL_2,
    password: TEST_PASSWORD,
  });
  if (signIn2) throw new Error(`유저2 로그인 실패: ${signIn2.message}`);
});

afterAll(async () => {
  // 테스트 데이터 일괄 정리
  await adminClient.from('account_events').delete().eq('user_id', testUserId);
  await adminClient.from('account_events').delete().eq('user_id', testUser2Id);

  // 테스트 유저 삭제
  await adminClient.auth.admin.deleteUser(testUserId);
  await adminClient.auth.admin.deleteUser(testUser2Id);

  await userClient.auth.signOut();
  await user2Client.auth.signOut();
});

// ════════════════════════════════════════════
// 1. 파라미터 없는 호출 성공
// ════════════════════════════════════════════

describe('[028] get_history_markers — 파라미터 없는 시그니처', () => {
  const createdIds: string[] = [];

  afterEach(async () => {
    if (createdIds.length > 0) {
      await adminClient.from('account_events').delete().in('id', createdIds);
      createdIds.length = 0;
    }
  });

  it('파라미터 없이 호출 시 성공 (에러 없음, 배열 반환)', async () => {
    const { data, error } = await userClient.rpc('get_history_markers');

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  // ════════════════════════════════════════════
  // 2. 배당 이벤트만 반환
  // ════════════════════════════════════════════

  it('배당 이벤트(KRW)가 반환되고 event_date/event_type/amount_krw 구조를 가짐', async () => {
    const { data: div, error: e1 } = await userClient
      .from('account_events')
      .insert({
        event_type: 'dividend',
        event_date: '2026-04-10',
        ticker: `DIV028KRW${RUN_ID}`,
        name: 'KRW Dividend',
        currency: 'KRW',
        amount: 80000,
        tax: 8000,
        fee: 0,
        source: 'manual',
        user_id: testUserId,
      })
      .select()
      .single();

    expect(e1).toBeNull();
    createdIds.push(div!.id);

    const { data, error } = await userClient.rpc('get_history_markers');

    expect(error).toBeNull();

    const marker = (data as any[]).find(
      (r: any) => r.event_date === '2026-04-10' && r.event_type === 'dividend'
    );
    expect(marker).toBeDefined();
    expect(marker).toHaveProperty('event_date');
    expect(marker).toHaveProperty('event_type');
    expect(marker).toHaveProperty('amount_krw');
    expect(marker.event_type).toBe('dividend');
    // KRW는 그대로 반환
    expect(Number(marker.amount_krw)).toBeCloseTo(80000, 0);
  });

  it('withdraw 이벤트가 있어도 반환되지 않음 (이슈 028 핵심 변경)', async () => {
    const { data: wdraw, error: e1 } = await userClient
      .from('account_events')
      .insert({
        event_type: 'withdraw',
        event_date: '2026-04-15',
        currency: 'KRW',
        amount: 300000,
        fx_rate_at_event: 1300,
        source: 'manual',
        user_id: testUserId,
      })
      .select()
      .single();

    expect(e1).toBeNull();
    createdIds.push(wdraw!.id);

    const { data, error } = await userClient.rpc('get_history_markers');

    expect(error).toBeNull();
    // withdraw 마커는 절대 반환되면 안 됨
    const wdrawMarker = (data as any[]).find(
      (r: any) => r.event_type === 'withdraw'
    );
    expect(wdrawMarker).toBeUndefined();
  });

  it('배당과 출금이 함께 있을 때 배당만 반환', async () => {
    // 배당 삽입
    const { data: div, error: eDev } = await userClient
      .from('account_events')
      .insert({
        event_type: 'dividend',
        event_date: '2026-05-01',
        ticker: `MIX028DIV${RUN_ID}`,
        name: 'Mix Test Dividend',
        currency: 'KRW',
        amount: 60000,
        tax: 6000,
        fee: 0,
        source: 'manual',
        user_id: testUserId,
      })
      .select()
      .single();
    expect(eDev).toBeNull();
    createdIds.push(div!.id);

    // 출금 삽입
    const { data: wdraw, error: eWdraw } = await userClient
      .from('account_events')
      .insert({
        event_type: 'withdraw',
        event_date: '2026-05-05',
        currency: 'KRW',
        amount: 100000,
        fx_rate_at_event: 1300,
        source: 'manual',
        user_id: testUserId,
      })
      .select()
      .single();
    expect(eWdraw).toBeNull();
    createdIds.push(wdraw!.id);

    const { data, error } = await userClient.rpc('get_history_markers');

    expect(error).toBeNull();

    // 배당 마커는 있어야 함
    const divMarker = (data as any[]).find(
      (r: any) => r.event_date === '2026-05-01' && r.event_type === 'dividend'
    );
    expect(divMarker).toBeDefined();

    // 출금 마커는 없어야 함
    const wdrawMarker = (data as any[]).find(
      (r: any) => r.event_type === 'withdraw'
    );
    expect(wdrawMarker).toBeUndefined();
  });

  // ════════════════════════════════════════════
  // 3. 전체 기간 반환
  // ════════════════════════════════════════════

  it('전체 기간 조회 — 과거(2020년) 배당도 반환됨', async () => {
    // 이슈 028: p_from/p_to 제거, 전체 기간 반환
    const { data: oldDiv, error: e1 } = await userClient
      .from('account_events')
      .insert({
        event_type: 'dividend',
        event_date: '2020-03-15',
        ticker: `OLDIV028${RUN_ID}`,
        name: 'Old Period Dividend',
        currency: 'KRW',
        amount: 12000,
        tax: 1200,
        fee: 0,
        source: 'manual',
        user_id: testUserId,
      })
      .select()
      .single();

    expect(e1).toBeNull();
    createdIds.push(oldDiv!.id);

    const { data, error } = await userClient.rpc('get_history_markers');

    expect(error).toBeNull();
    // 파라미터 없음 → 날짜 필터 없음 → 2020년도 반환
    const oldMarker = (data as any[]).find(
      (r: any) => r.event_date === '2020-03-15'
    );
    expect(oldMarker).toBeDefined();
    expect(oldMarker.event_type).toBe('dividend');
  });

  // ════════════════════════════════════════════
  // 4. USD 배당 KRW 환산
  // ════════════════════════════════════════════

  it('USD 배당 — fx_rate_at_event로 KRW 환산', async () => {
    // USD 배당 삽입 (fx_rate_at_event = 1400)
    const { data: usdDiv, error: e1 } = await userClient
      .from('account_events')
      .insert({
        event_type: 'dividend',
        event_date: '2026-06-01',
        ticker: `USD028DIV${RUN_ID}`,
        name: 'USD Dividend FX Test',
        currency: 'USD',
        amount: 100,           // USD 100
        fx_rate_at_event: 1400, // 환산: 100 * 1400 = 140,000 KRW
        tax: 15,
        fee: 0,
        source: 'manual',
        user_id: testUserId,
      })
      .select()
      .single();

    expect(e1).toBeNull();
    createdIds.push(usdDiv!.id);

    const { data, error } = await userClient.rpc('get_history_markers');

    expect(error).toBeNull();
    const marker = (data as any[]).find(
      (r: any) => r.event_date === '2026-06-01' && r.event_type === 'dividend'
    );
    expect(marker).toBeDefined();
    // fx_rate_at_event 우선 적용: 100 USD * 1400 = 140,000 KRW
    expect(Number(marker.amount_krw)).toBeCloseTo(140000, 0);
  });

  it('USD 배당 — fx_rate_at_event 없으면 fallback 1300 적용', async () => {
    // fx_rate_at_event 없이 삽입
    const { data: usdDivFb, error: e1 } = await userClient
      .from('account_events')
      .insert({
        event_type: 'dividend',
        event_date: '2026-06-05',
        ticker: `USDFB028${RUN_ID}`,
        name: 'USD Dividend Fallback',
        currency: 'USD',
        amount: 50,            // USD 50
        // fx_rate_at_event: null → fx_rates 조회 후 fallback 1300
        tax: 7.5,
        fee: 0,
        source: 'manual',
        user_id: testUserId,
      })
      .select()
      .single();

    expect(e1).toBeNull();
    createdIds.push(usdDivFb!.id);

    const { data, error } = await userClient.rpc('get_history_markers');

    expect(error).toBeNull();
    const marker = (data as any[]).find(
      (r: any) => r.event_date === '2026-06-05' && r.event_type === 'dividend'
    );
    expect(marker).toBeDefined();
    // fx_rates에 해당 날짜 없으면 fallback 1300 적용: 50 * 1300 = 65,000
    expect(Number(marker.amount_krw)).toBeCloseTo(65000, 0);
  });

  // ════════════════════════════════════════════
  // 5. 미인증 호출 차단
  // ════════════════════════════════════════════

  it('미인증(anon) 상태에서 호출 시 에러 반환', async () => {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });

    const { error } = await anonClient.rpc('get_history_markers');

    expect(error).not.toBeNull();
  });

  // ════════════════════════════════════════════
  // 6. 사용자 격리 (RLS)
  // ════════════════════════════════════════════

  it('유저1 배당 마커를 유저2가 조회하면 포함되지 않음', async () => {
    // 유저1에 배당 삽입
    const { data: div, error: e1 } = await userClient
      .from('account_events')
      .insert({
        event_type: 'dividend',
        event_date: '2026-07-01',
        ticker: `RLS028DIV${RUN_ID}`,
        name: 'RLS Test Dividend',
        currency: 'KRW',
        amount: 20000,
        tax: 2000,
        fee: 0,
        source: 'manual',
        user_id: testUserId,
      })
      .select()
      .single();

    expect(e1).toBeNull();
    createdIds.push(div!.id);

    // 유저2로 get_history_markers 호출
    const { data, error } = await user2Client.rpc('get_history_markers');

    expect(error).toBeNull();
    // 유저2 결과에 유저1의 마커가 포함되면 안 됨
    const user1Marker = (data as any[]).find(
      (r: any) => r.event_date === '2026-07-01'
    );
    expect(user1Marker).toBeUndefined();
  });
});
