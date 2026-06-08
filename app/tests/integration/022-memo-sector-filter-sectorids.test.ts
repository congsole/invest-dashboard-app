/**
 * [022] 메모 섹터 필터 — RPC 계층 탐색 규칙 수정 및 sectorIds 동작 변경
 *
 * 테스트 범위:
 *   1. L1 섹터 id만 전달 시 L1에 직접 연결된 메모(memo_sectors)가 반환된다
 *   2. L1 섹터 id만 전달 시 하위 L2 섹터에 직접 연결된 메모도 반환된다
 *   3. L1 섹터 id만 전달 시 하위 L3/L4 섹터에 직접 연결된 메모도 반환된다
 *   4. L1 섹터 id만 전달 시 하위 L4 섹터를 가진 종목에 연결된 메모도 반환된다
 *   5. 무관한 섹터의 메모는 L1 필터에서 제외된다
 *   6. L1 + L2 id 동시 전달 시 각각의 메모 합집합이 반환된다 (중복 없음)
 *   7. p_sector_ids=null 시 섹터 필터 없음 (전체 반환)
 *
 * 필요 환경변수 (app/.env.test):
 *   SUPABASE_URL          — Supabase 프로젝트 URL
 *   SUPABASE_ANON_KEY     — anon/publishable key
 *   SUPABASE_SERVICE_KEY  — service_role key (RLS 우회, 데이터 정리 + 유저 생성)
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

let adminClient: SupabaseClient;
let userClient: SupabaseClient;
let testUserId: string;

const TEST_EMAIL = `022-sector-filter-${RUN_ID}@example.com`;
const TEST_PASSWORD = 'TestPassword123!';

// 생성된 리소스 추적
const createdMemoIds: string[] = [];
const createdStockIds: string[] = [];

// 섹터 id (시드 데이터에서 조회)
let l1SectorId: number;      // IT L1
let l2SectorId: number;      // IT 하위 L2 (SEMICON_EQUIP 등)
let l3SectorId: number;      // L2 하위 L3
let l4SectorId: number;      // L3 하위 L4 (SEMI_MFG 등)
let otherL1SectorId: number; // IT 와 무관한 다른 L1 섹터

// 테스트 메모 id
let memoDirectL1: string;     // L1 섹터에 직접 연결 (memo_sectors)
let memoDirectL2: string;     // L2 섹터에 직접 연결
let memoDirectL3: string;     // L3 섹터에 직접 연결
let memoDirectL4: string;     // L4 섹터에 직접 연결
let memoViaStockL4: string;   // L4 섹터를 가진 종목에 연결 (memo_stocks 경로)
let memoOtherL1: string;      // 다른 L1 섹터에 직접 연결 — IT 필터에서 제외되어야 함
let memoNoLinks: string;      // 섹터/종목 연결 없는 메모

// L4 섹터를 가진 종목
let stockWithL4Sector: string;

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

  // 테스트 유저 생성
  const { data: u, error: e } = await adminClient.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (e) throw new Error(`테스트 유저 생성 실패: ${e.message}`);
  testUserId = u.user.id;

  userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { error: signInErr } = await userClient.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (signInErr) throw new Error(`유저 로그인 실패: ${signInErr.message}`);

  // ── 섹터 id 조회 ──

  // L1: IT (id=1, 시드 데이터 코드 확정)
  l1SectorId = 1;

  // L2: SEMICON_EQUIP (IT 하위)
  const { data: l2Data } = await adminClient
    .from('sectors')
    .select('id')
    .eq('code', 'SEMICON_EQUIP')
    .maybeSingle();
  if (!l2Data) throw new Error('SEMICON_EQUIP L2 섹터를 찾을 수 없습니다');
  l2SectorId = l2Data.id;

  // L3: SEMICON_EQUIP 하위의 임의 L3
  const { data: l3Data } = await adminClient
    .from('sectors')
    .select('id')
    .eq('parent_id', l2SectorId)
    .eq('level', 3)
    .limit(1)
    .maybeSingle();
  if (!l3Data) throw new Error(`SEMICON_EQUIP(id=${l2SectorId}) 하위 L3 섹터를 찾을 수 없습니다`);
  l3SectorId = l3Data.id;

  // L4: SEMI_MFG 또는 IT 하위 임의 L4
  const { data: l4Data } = await adminClient
    .from('sectors')
    .select('id')
    .eq('code', 'SEMI_MFG')
    .maybeSingle();
  if (!l4Data) {
    const { data: anyL4 } = await adminClient
      .from('sectors')
      .select('id')
      .eq('level', 4)
      .limit(1)
      .maybeSingle();
    if (!anyL4) throw new Error('L4 섹터를 찾을 수 없습니다');
    l4SectorId = anyL4.id;
  } else {
    l4SectorId = l4Data.id;
  }

  // 다른 L1 (IT가 아닌 것)
  const { data: otherL1 } = await adminClient
    .from('sectors')
    .select('id')
    .eq('level', 1)
    .neq('id', l1SectorId)
    .limit(1)
    .maybeSingle();
  if (!otherL1) throw new Error('다른 L1 섹터를 찾을 수 없습니다');
  otherL1SectorId = otherL1.id;

  // ── 테스트 종목 생성 ──

  const { data: stockL4, error: stockErr } = await adminClient
    .from('stocks')
    .insert({
      ticker: `022_L4_${RUN_ID}`,
      name: '022 L4섹터종목',
      market: 'US',
      currency: 'USD',
      sector_id: l4SectorId,
      is_active: true,
    })
    .select('id')
    .single();
  if (stockErr) throw new Error(`L4 섹터 종목 생성 실패: ${stockErr.message}`);
  stockWithL4Sector = stockL4.id;
  createdStockIds.push(stockWithL4Sector);

  // ── 테스트 메모 생성 헬퍼 ──

  async function createMemoRaw(body: string): Promise<string> {
    const { data, error } = await adminClient
      .from('memos')
      .insert({ user_id: testUserId, body })
      .select('id')
      .single();
    if (error) throw new Error(`메모 생성 실패: ${error.message}`);
    createdMemoIds.push(data.id);
    return data.id;
  }

  // L1 섹터에 직접 연결
  memoDirectL1 = await createMemoRaw('022 L1 직접연결 메모');
  await adminClient.from('memo_sectors').insert({ memo_id: memoDirectL1, sector_id: l1SectorId });

  // L2 섹터에 직접 연결
  memoDirectL2 = await createMemoRaw('022 L2 직접연결 메모');
  await adminClient.from('memo_sectors').insert({ memo_id: memoDirectL2, sector_id: l2SectorId });

  // L3 섹터에 직접 연결
  memoDirectL3 = await createMemoRaw('022 L3 직접연결 메모');
  await adminClient.from('memo_sectors').insert({ memo_id: memoDirectL3, sector_id: l3SectorId });

  // L4 섹터에 직접 연결
  memoDirectL4 = await createMemoRaw('022 L4 직접연결 메모');
  await adminClient.from('memo_sectors').insert({ memo_id: memoDirectL4, sector_id: l4SectorId });

  // L4 섹터 종목에 memo_stocks 경유 연결
  memoViaStockL4 = await createMemoRaw('022 L4종목 종목경로 메모');
  await adminClient.from('memo_stocks').insert({ memo_id: memoViaStockL4, stock_id: stockWithL4Sector });

  // 다른 L1 섹터에 직접 연결 (IT 필터 시 제외되어야 함)
  memoOtherL1 = await createMemoRaw('022 다른L1 직접연결 메모');
  await adminClient.from('memo_sectors').insert({ memo_id: memoOtherL1, sector_id: otherL1SectorId });

  // 섹터/종목 연결 없는 메모
  memoNoLinks = await createMemoRaw('022 연결없는 메모');
});

afterAll(async () => {
  // memo FK cascade로 memo_stocks, memo_sectors 자동 정리
  if (createdMemoIds.length > 0) {
    await adminClient.from('memos').delete().in('id', createdMemoIds);
  }
  if (createdStockIds.length > 0) {
    await adminClient.from('stocks').delete().in('id', createdStockIds);
  }
  if (testUserId) {
    await adminClient.auth.admin.deleteUser(testUserId);
  }
  await userClient.auth.signOut();
});

// ════════════════════════════════════════════
// 1. L1 id 전달 시 L1 자신에 직접 연결된 메모 반환 (이슈 022 핵심)
// ════════════════════════════════════════════

describe('[022-1] L1 id만 전달 시 L1 자신에 직접 연결된 메모 반환', () => {
  it('p_sector_ids=[L1_id] → L1 memo_sectors 연결 메모가 반환된다', async () => {
    const { data, error } = await userClient.rpc('list_memos', {
      p_sector_ids: [l1SectorId],
    });

    expect(error).toBeNull();
    expect(data).not.toBeNull();

    const ids = (data.memos as Array<{ id: string }>).map((m) => m.id);
    expect(ids).toContain(memoDirectL1);
  });

  it('p_sector_ids=[L1_id] 응답에 memoDirectL1의 sectors[].level이 1이다', async () => {
    const { data, error } = await userClient.rpc('list_memos', {
      p_sector_ids: [l1SectorId],
    });

    expect(error).toBeNull();
    const memo = (data.memos as Array<any>).find((m) => m.id === memoDirectL1);
    expect(memo).toBeDefined();

    const sector = memo.sectors.find((s: any) => s.sector_id === l1SectorId);
    expect(sector).toBeDefined();
    expect(sector.level).toBe(1);
  });
});

// ════════════════════════════════════════════
// 2. L1 id 전달 시 하위 L2에 직접 연결된 메모 반환
// ════════════════════════════════════════════

describe('[022-2] L1 id만 전달 시 하위 L2 섹터에 직접 연결된 메모 반환', () => {
  it('p_sector_ids=[L1_id] → L2 memo_sectors 연결 메모가 반환된다', async () => {
    const { data, error } = await userClient.rpc('list_memos', {
      p_sector_ids: [l1SectorId],
    });

    expect(error).toBeNull();
    const ids = (data.memos as Array<{ id: string }>).map((m) => m.id);
    expect(ids).toContain(memoDirectL2);
  });
});

// ════════════════════════════════════════════
// 3. L1 id 전달 시 하위 L3/L4에 직접 연결된 메모 반환
// ════════════════════════════════════════════

describe('[022-3] L1 id만 전달 시 하위 L3/L4 섹터에 직접 연결된 메모 반환', () => {
  it('p_sector_ids=[L1_id] → L3 memo_sectors 연결 메모가 반환된다', async () => {
    const { data, error } = await userClient.rpc('list_memos', {
      p_sector_ids: [l1SectorId],
    });

    expect(error).toBeNull();
    const ids = (data.memos as Array<{ id: string }>).map((m) => m.id);
    expect(ids).toContain(memoDirectL3);
  });

  it('p_sector_ids=[L1_id] → L4 memo_sectors 연결 메모가 반환된다', async () => {
    const { data, error } = await userClient.rpc('list_memos', {
      p_sector_ids: [l1SectorId],
    });

    expect(error).toBeNull();
    const ids = (data.memos as Array<{ id: string }>).map((m) => m.id);
    expect(ids).toContain(memoDirectL4);
  });
});

// ════════════════════════════════════════════
// 4. L1 id 전달 시 하위 L4 종목 경유 메모 반환 (종목 경로)
// ════════════════════════════════════════════

describe('[022-4] L1 id만 전달 시 하위 L4 섹터 종목에 연결된 메모 반환 (종목 경로)', () => {
  it('p_sector_ids=[L1_id] → L4 종목 memo_stocks 연결 메모가 반환된다', async () => {
    const { data, error } = await userClient.rpc('list_memos', {
      p_sector_ids: [l1SectorId],
    });

    expect(error).toBeNull();
    const ids = (data.memos as Array<{ id: string }>).map((m) => m.id);
    expect(ids).toContain(memoViaStockL4);
  });
});

// ════════════════════════════════════════════
// 5. 무관한 섹터의 메모 제외
// ════════════════════════════════════════════

describe('[022-5] 무관한 섹터의 메모는 L1 필터에서 제외된다', () => {
  it('p_sector_ids=[L1_id] → 다른 L1 섹터 직접 연결 메모는 제외된다', async () => {
    const { data, error } = await userClient.rpc('list_memos', {
      p_sector_ids: [l1SectorId],
    });

    expect(error).toBeNull();
    const ids = (data.memos as Array<{ id: string }>).map((m) => m.id);
    expect(ids).not.toContain(memoOtherL1);
  });

  it('p_sector_ids=[L1_id] → 섹터 연결 없는 메모는 제외된다', async () => {
    const { data, error } = await userClient.rpc('list_memos', {
      p_sector_ids: [l1SectorId],
    });

    expect(error).toBeNull();
    const ids = (data.memos as Array<{ id: string }>).map((m) => m.id);
    expect(ids).not.toContain(memoNoLinks);
  });

  it('p_sector_ids=[otherL1_id] → IT 계열 메모는 모두 제외된다', async () => {
    const { data, error } = await userClient.rpc('list_memos', {
      p_sector_ids: [otherL1SectorId],
    });

    expect(error).toBeNull();
    const ids = (data.memos as Array<{ id: string }>).map((m) => m.id);

    expect(ids).not.toContain(memoDirectL1);
    expect(ids).not.toContain(memoDirectL2);
    expect(ids).not.toContain(memoDirectL3);
    expect(ids).not.toContain(memoDirectL4);
    expect(ids).not.toContain(memoViaStockL4);

    // 다른 L1 직접 연결 메모는 포함
    expect(ids).toContain(memoOtherL1);
  });
});

// ════════════════════════════════════════════
// 6. L1 + L2 id 동시 전달 시 합집합 반환 (중복 없음)
// ════════════════════════════════════════════

describe('[022-6] L1 + L2 id 동시 전달 시 합집합 반환 (중복 없음)', () => {
  it('p_sector_ids=[L1_id, L2_id] → L1과 L2 각각의 메모 합집합이 반환된다', async () => {
    const { data, error } = await userClient.rpc('list_memos', {
      p_sector_ids: [l1SectorId, l2SectorId],
    });

    expect(error).toBeNull();
    const ids = (data.memos as Array<{ id: string }>).map((m) => m.id);

    // L1 직접 연결 포함
    expect(ids).toContain(memoDirectL1);
    // L2 직접 연결 포함
    expect(ids).toContain(memoDirectL2);
    // L4 직접 연결 포함 (L1 하위이자 L2 하위)
    expect(ids).toContain(memoDirectL4);
    // L4 종목 경로 포함
    expect(ids).toContain(memoViaStockL4);
  });

  it('p_sector_ids=[L1_id, L2_id] — L1에 속한 메모는 중복 없이 1회만 나타난다', async () => {
    const { data, error } = await userClient.rpc('list_memos', {
      p_sector_ids: [l1SectorId, l2SectorId],
    });

    expect(error).toBeNull();
    const ids = (data.memos as Array<{ id: string }>).map((m) => m.id);

    // memoDirectL2는 L2에도 속하고 L1 하위이기도 하므로 정확히 1번만 나와야 함
    const occurrences = ids.filter((id) => id === memoDirectL2).length;
    expect(occurrences).toBe(1);
  });
});

// ════════════════════════════════════════════
// 7. p_sector_ids=null 시 섹터 필터 없음 (전체 반환)
// ════════════════════════════════════════════

describe('[022-7] p_sector_ids=null 시 섹터 필터 없음 (전체 반환)', () => {
  it('p_sector_ids=null → 이 유저의 모든 메모가 포함된다 (memoNoLinks 포함)', async () => {
    const { data, error } = await userClient.rpc('list_memos', {
      p_sector_ids: null,
      p_limit: 100,
    });

    expect(error).toBeNull();
    const ids = (data.memos as Array<{ id: string }>).map((m) => m.id);

    // 섹터 연결 없는 메모도 포함
    expect(ids).toContain(memoNoLinks);
    // 모든 테스트 메모 포함
    expect(ids).toContain(memoDirectL1);
    expect(ids).toContain(memoDirectL2);
    expect(ids).toContain(memoOtherL1);
  });

  it('p_sector_ids=null과 p_sector_ids=[] 동작이 동일하다 (전체 반환)', async () => {
    const { data: withNull } = await userClient.rpc('list_memos', {
      p_sector_ids: null,
    });
    const { data: withEmpty } = await userClient.rpc('list_memos', {
      p_sector_ids: [],
    });

    expect(withNull.total_count).toBe(withEmpty.total_count);
  });
});
