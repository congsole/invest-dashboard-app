/**
 * [019] 메모 섹터 필터 RPC 로직 확장 — 통합 테스트
 *
 * 테스트 범위:
 *   1. list_memos 섹터 필터 — 종목 경로 (stocks.sector_id 경유)
 *   2. list_memos 섹터 필터 — 직접 연결 경로 (memo_sectors 직접 연결)
 *   3. list_memos 섹터 필터 — 두 경로 OR 합산 (UNION)
 *   4. 계층 탐색: L1 지정 시 L2/L3/L4 하위까지 탐색
 *   5. list_memos 응답 sectors 배열에 level, name_en 포함 확인
 *   6. create_memo_with_links — L1~L4 어느 레벨이든 섹터 연결 가능
 *   7. create_memo_with_links 응답 sectors 배열에 level, name_en 포함 확인
 *   8. update_memo_with_links — L1~L4 어느 레벨이든 섹터 연결 가능
 *   9. update_memo_with_links 응답 sectors 배열에 level, name_en 포함 확인
 *  10. 카운트 쿼리와 목록 쿼리 필터 일치 (total_count 정확성)
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

const TEST_EMAIL = `019-sector-filter-${RUN_ID}@example.com`;
const TEST_PASSWORD = 'TestPassword123!';

// 테스트 중 생성된 리소스 추적
const createdMemoIds: string[] = [];
const createdStockIds: string[] = [];

// 섹터 id (시드 데이터에서 조회)
let l1SectorId: number;    // IT L1 (id=1)
let l2SectorId: number;    // SEMICON_EQUIP 등 IT 하위 L2
let l3SectorId: number;    // L3 섹터 (L2 하위)
let l4SectorId: number;    // SEMI_MFG 등 L4 섹터
let otherL1SectorId: number; // 다른 L1 섹터 (예: 금융 id=2)

// 테스트 데이터 id
let stockWithL4Sector: string;    // L4 섹터를 가진 종목
let stockWithL2Sector: string;    // L2 섹터를 가진 종목
let stockWithOtherSector: string; // 다른 L1 섹터를 가진 종목

let memoViaStockL4: string;      // 종목 경로 — L4 섹터 종목에 연결된 메모
let memoViaStockL2: string;      // 종목 경로 — L2 섹터 종목에 연결된 메모
let memoDirectL4: string;        // 직접 연결 경로 — L4 섹터에 직접 연결된 메모
let memoDirectL1: string;        // 직접 연결 경로 — L1 섹터에 직접 연결된 메모
let memoBothPaths: string;       // 두 경로 모두 해당 (종목+직접 섹터 연결)
let memoOtherSector: string;     // 다른 섹터 종목 연결 메모 (필터 대상 외)
let memoNoLinks: string;         // 섹터 연결 없는 메모

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

  // 섹터 id 조회 (시드 데이터)
  l1SectorId = 1; // IT L1 (id=1, 코드 확정)

  // L2 섹터: SEMICON_EQUIP (IT 하위)
  const { data: l2Data } = await adminClient
    .from('sectors')
    .select('id')
    .eq('code', 'SEMICON_EQUIP')
    .maybeSingle();
  if (!l2Data) throw new Error('SEMICON_EQUIP L2 섹터를 찾을 수 없습니다');
  l2SectorId = l2Data.id;

  // L3 섹터: SEMICON_EQUIP 하위의 아무 L3
  const { data: l3Data } = await adminClient
    .from('sectors')
    .select('id')
    .eq('parent_id', l2SectorId)
    .eq('level', 3)
    .limit(1)
    .maybeSingle();
  if (!l3Data) throw new Error(`SEMICON_EQUIP(id=${l2SectorId}) 하위 L3 섹터를 찾을 수 없습니다`);
  l3SectorId = l3Data.id;

  // L4 섹터: SEMI_MFG (IT 하위)
  const { data: l4Data } = await adminClient
    .from('sectors')
    .select('id')
    .eq('code', 'SEMI_MFG')
    .maybeSingle();
  if (!l4Data) {
    // SEMI_MFG가 없으면 IT 하위 임의 L4
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

  // 다른 L1 섹터 (IT가 아닌 것, id=2 금융 등)
  const { data: otherL1 } = await adminClient
    .from('sectors')
    .select('id')
    .eq('level', 1)
    .neq('id', l1SectorId)
    .limit(1)
    .maybeSingle();
  if (!otherL1) throw new Error('다른 L1 섹터를 찾을 수 없습니다');
  otherL1SectorId = otherL1.id;

  // 테스트 종목 생성
  const { data: stockL4, error: stockL4Err } = await adminClient
    .from('stocks')
    .insert({
      ticker: `019_L4_${RUN_ID}`,
      name: '019 L4섹터종목',
      market: 'US',
      currency: 'USD',
      sector_id: l4SectorId,
      is_active: true,
    })
    .select('id')
    .single();
  if (stockL4Err) throw new Error(`L4 섹터 종목 생성 실패: ${stockL4Err.message}`);
  stockWithL4Sector = stockL4.id;
  createdStockIds.push(stockWithL4Sector);

  const { data: stockL2, error: stockL2Err } = await adminClient
    .from('stocks')
    .insert({
      ticker: `019_L2_${RUN_ID}`,
      name: '019 L2섹터종목',
      market: 'US',
      currency: 'USD',
      sector_id: l2SectorId,
      is_active: true,
    })
    .select('id')
    .single();
  if (stockL2Err) throw new Error(`L2 섹터 종목 생성 실패: ${stockL2Err.message}`);
  stockWithL2Sector = stockL2.id;
  createdStockIds.push(stockWithL2Sector);

  const { data: stockOther, error: stockOtherErr } = await adminClient
    .from('stocks')
    .insert({
      ticker: `019_OTHER_${RUN_ID}`,
      name: '019 다른섹터종목',
      market: 'KR',
      currency: 'KRW',
      sector_id: otherL1SectorId,
      is_active: true,
    })
    .select('id')
    .single();
  if (stockOtherErr) throw new Error(`다른 섹터 종목 생성 실패: ${stockOtherErr.message}`);
  stockWithOtherSector = stockOther.id;
  createdStockIds.push(stockWithOtherSector);

  // 메모 생성 헬퍼
  async function createMemo(body: string): Promise<string> {
    const { data, error } = await adminClient
      .from('memos')
      .insert({ user_id: testUserId, body })
      .select('id')
      .single();
    if (error) throw new Error(`메모 생성 실패: ${error.message}`);
    createdMemoIds.push(data.id);
    return data.id;
  }

  // 종목 경로 — L4 섹터 종목에 연결된 메모 (memo_stocks 경유)
  memoViaStockL4 = await createMemo('019 종목경로 L4섹터종목 연결 메모');
  await adminClient.from('memo_stocks').insert({ memo_id: memoViaStockL4, stock_id: stockWithL4Sector });

  // 종목 경로 — L2 섹터 종목에 연결된 메모
  memoViaStockL2 = await createMemo('019 종목경로 L2섹터종목 연결 메모');
  await adminClient.from('memo_stocks').insert({ memo_id: memoViaStockL2, stock_id: stockWithL2Sector });

  // 직접 연결 경로 — L4 섹터에 직접 연결된 메모 (memo_sectors 경유)
  memoDirectL4 = await createMemo('019 직접연결 L4섹터 메모');
  await adminClient.from('memo_sectors').insert({ memo_id: memoDirectL4, sector_id: l4SectorId });

  // 직접 연결 경로 — L1 섹터에 직접 연결된 메모
  memoDirectL1 = await createMemo('019 직접연결 L1섹터 메모');
  await adminClient.from('memo_sectors').insert({ memo_id: memoDirectL1, sector_id: l1SectorId });

  // 두 경로 모두 — 종목(L4) + 직접 섹터(L4) 동시 연결
  memoBothPaths = await createMemo('019 양쪽경로 메모');
  await adminClient.from('memo_stocks').insert({ memo_id: memoBothPaths, stock_id: stockWithL4Sector });
  await adminClient.from('memo_sectors').insert({ memo_id: memoBothPaths, sector_id: l4SectorId });

  // 다른 섹터 종목 연결 메모 (IT 필터에 포함되지 않아야 함)
  memoOtherSector = await createMemo('019 다른섹터종목 연결 메모');
  await adminClient.from('memo_stocks').insert({ memo_id: memoOtherSector, stock_id: stockWithOtherSector });

  // 섹터 연결 없는 메모
  memoNoLinks = await createMemo('019 섹터연결없는 메모');
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
// 1. list_memos 섹터 필터 — 종목 경로
// ════════════════════════════════════════════

describe('[019-1] list_memos 섹터 필터 — 종목 경로 (stocks.sector_id 경유)', () => {
  it('L1 섹터 필터 시 L4 섹터를 가진 종목에 연결된 메모가 포함된다 (계층 탐색)', async () => {
    const { data, error } = await userClient.rpc('list_memos', {
      p_sector_ids: [l1SectorId],
    });

    expect(error).toBeNull();
    expect(data).not.toBeNull();

    const ids = (data.memos as Array<{ id: string }>).map((m) => m.id);
    expect(ids).toContain(memoViaStockL4);
  });

  it('L1 섹터 필터 시 L2 섹터를 가진 종목에 연결된 메모가 포함된다', async () => {
    const { data, error } = await userClient.rpc('list_memos', {
      p_sector_ids: [l1SectorId],
    });

    expect(error).toBeNull();
    const ids = (data.memos as Array<{ id: string }>).map((m) => m.id);
    expect(ids).toContain(memoViaStockL2);
  });

  it('L2 섹터 필터 시 해당 L2에 속하는 종목 메모가 포함된다', async () => {
    const { data, error } = await userClient.rpc('list_memos', {
      p_sector_ids: [l2SectorId],
    });

    expect(error).toBeNull();
    const ids = (data.memos as Array<{ id: string }>).map((m) => m.id);
    expect(ids).toContain(memoViaStockL2);
  });

  it('L4 섹터 필터 시 해당 L4에 속하는 종목 메모가 포함된다', async () => {
    const { data, error } = await userClient.rpc('list_memos', {
      p_sector_ids: [l4SectorId],
    });

    expect(error).toBeNull();
    const ids = (data.memos as Array<{ id: string }>).map((m) => m.id);
    expect(ids).toContain(memoViaStockL4);
  });

  it('다른 L1 섹터 필터 시 IT 종목에 연결된 메모는 포함되지 않는다', async () => {
    const { data, error } = await userClient.rpc('list_memos', {
      p_sector_ids: [otherL1SectorId],
    });

    expect(error).toBeNull();
    const ids = (data.memos as Array<{ id: string }>).map((m) => m.id);

    // IT 종목 연결 메모는 제외
    expect(ids).not.toContain(memoViaStockL4);
    expect(ids).not.toContain(memoViaStockL2);

    // 다른 섹터 종목 연결 메모는 포함
    expect(ids).toContain(memoOtherSector);
  });
});

// ════════════════════════════════════════════
// 2. list_memos 섹터 필터 — 직접 연결 경로
// ════════════════════════════════════════════

describe('[019-2] list_memos 섹터 필터 — 직접 연결 경로 (memo_sectors 경유)', () => {
  it('L1 섹터 필터 시 해당 L1에 직접 연결된 메모가 포함된다', async () => {
    const { data, error } = await userClient.rpc('list_memos', {
      p_sector_ids: [l1SectorId],
    });

    expect(error).toBeNull();
    const ids = (data.memos as Array<{ id: string }>).map((m) => m.id);
    expect(ids).toContain(memoDirectL1);
  });

  it('L1 섹터 필터 시 하위 L4에 직접 연결된 메모도 포함된다 (하위 탐색)', async () => {
    const { data, error } = await userClient.rpc('list_memos', {
      p_sector_ids: [l1SectorId],
    });

    expect(error).toBeNull();
    const ids = (data.memos as Array<{ id: string }>).map((m) => m.id);
    expect(ids).toContain(memoDirectL4);
  });

  it('L4 섹터 필터 시 해당 L4에 직접 연결된 메모가 포함된다', async () => {
    const { data, error } = await userClient.rpc('list_memos', {
      p_sector_ids: [l4SectorId],
    });

    expect(error).toBeNull();
    const ids = (data.memos as Array<{ id: string }>).map((m) => m.id);
    expect(ids).toContain(memoDirectL4);
  });

  it('다른 L1 섹터 필터 시 IT 직접 연결 메모는 포함되지 않는다', async () => {
    const { data, error } = await userClient.rpc('list_memos', {
      p_sector_ids: [otherL1SectorId],
    });

    expect(error).toBeNull();
    const ids = (data.memos as Array<{ id: string }>).map((m) => m.id);
    expect(ids).not.toContain(memoDirectL1);
    expect(ids).not.toContain(memoDirectL4);
  });
});

// ════════════════════════════════════════════
// 3. list_memos 섹터 필터 — 두 경로 OR 합산 (UNION)
// ════════════════════════════════════════════

describe('[019-3] list_memos 섹터 필터 — 두 경로 OR 합산', () => {
  it('L1 섹터 필터 시 종목 경로와 직접 연결 경로 메모가 모두 포함된다', async () => {
    const { data, error } = await userClient.rpc('list_memos', {
      p_sector_ids: [l1SectorId],
    });

    expect(error).toBeNull();
    const ids = (data.memos as Array<{ id: string }>).map((m) => m.id);

    // 종목 경로
    expect(ids).toContain(memoViaStockL4);
    expect(ids).toContain(memoViaStockL2);

    // 직접 연결 경로
    expect(ids).toContain(memoDirectL1);
    expect(ids).toContain(memoDirectL4);

    // 두 경로 모두 해당하는 메모 (중복 없이 포함)
    expect(ids).toContain(memoBothPaths);
  });

  it('두 경로 모두 해당하는 메모는 중복 없이 1회만 포함된다', async () => {
    const { data, error } = await userClient.rpc('list_memos', {
      p_sector_ids: [l1SectorId],
    });

    expect(error).toBeNull();
    const ids = (data.memos as Array<{ id: string }>).map((m) => m.id);

    // memoBothPaths가 정확히 1번만 나타나야 함
    const occurrences = ids.filter((id) => id === memoBothPaths).length;
    expect(occurrences).toBe(1);
  });

  it('섹터 연결 없는 메모는 어느 섹터 필터에도 포함되지 않는다', async () => {
    const { data, error } = await userClient.rpc('list_memos', {
      p_sector_ids: [l1SectorId],
    });

    expect(error).toBeNull();
    const ids = (data.memos as Array<{ id: string }>).map((m) => m.id);
    expect(ids).not.toContain(memoNoLinks);
  });

  it('복수 섹터 필터 [l1, otherL1] — OR 동작으로 각 섹터 메모 합집합 반환', async () => {
    const { data, error } = await userClient.rpc('list_memos', {
      p_sector_ids: [l1SectorId, otherL1SectorId],
    });

    expect(error).toBeNull();
    const ids = (data.memos as Array<{ id: string }>).map((m) => m.id);

    expect(ids).toContain(memoViaStockL4);
    expect(ids).toContain(memoDirectL1);
    expect(ids).toContain(memoOtherSector);
    expect(ids).not.toContain(memoNoLinks);
  });
});

// ════════════════════════════════════════════
// 4. 계층 탐색: L1→L2→L3→L4
// ════════════════════════════════════════════

describe('[019-4] 계층 탐색 — L1 지정 시 L2/L3/L4 하위까지 탐색', () => {
  it('L1 지정 시 L2 섹터 하위 종목 연결 메모가 포함된다', async () => {
    const { data, error } = await userClient.rpc('list_memos', {
      p_sector_ids: [l1SectorId],
    });

    expect(error).toBeNull();
    const ids = (data.memos as Array<{ id: string }>).map((m) => m.id);
    expect(ids).toContain(memoViaStockL2);
  });

  it('L1 지정 시 L4 섹터 하위 종목 연결 메모가 포함된다', async () => {
    const { data, error } = await userClient.rpc('list_memos', {
      p_sector_ids: [l1SectorId],
    });

    expect(error).toBeNull();
    const ids = (data.memos as Array<{ id: string }>).map((m) => m.id);
    expect(ids).toContain(memoViaStockL4);
  });

  it('L2 지정 시 L4 섹터 하위 종목 연결 메모가 포함된다 (L2→L3→L4 탐색)', async () => {
    const { data, error } = await userClient.rpc('list_memos', {
      p_sector_ids: [l2SectorId],
    });

    expect(error).toBeNull();
    const ids = (data.memos as Array<{ id: string }>).map((m) => m.id);
    // L4 종목이 L2 하위이면 포함되어야 함 (L2→L3→L4 계층 탐색)
    // SEMI_MFG가 SEMICON_EQUIP의 하위 계층이라면 포함
    expect(ids).toContain(memoViaStockL4);
  });

  it('L1 지정 시 L1에 직접 연결된 memo_sectors 메모도 포함된다 (직접 연결 계층 탐색)', async () => {
    const { data, error } = await userClient.rpc('list_memos', {
      p_sector_ids: [l1SectorId],
    });

    expect(error).toBeNull();
    const ids = (data.memos as Array<{ id: string }>).map((m) => m.id);
    expect(ids).toContain(memoDirectL1);
    expect(ids).toContain(memoDirectL4);
  });
});

// ════════════════════════════════════════════
// 5. list_memos 응답 sectors 배열 필드 검증
// ════════════════════════════════════════════

describe('[019-5] list_memos 응답 sectors 배열에 level, name_en 포함', () => {
  it('직접 섹터 연결된 메모 조회 시 sectors 배열에 sector_id, code, name, name_en, level이 포함된다', async () => {
    // memoDirectL4: L4 섹터에 직접 연결된 메모
    const { data, error } = await userClient.rpc('list_memos', {
      p_sector_ids: [l4SectorId],
    });

    expect(error).toBeNull();
    const memo = (data.memos as Array<any>).find((m) => m.id === memoDirectL4);
    expect(memo).toBeDefined();
    expect(Array.isArray(memo.sectors)).toBe(true);
    expect(memo.sectors.length).toBeGreaterThan(0);

    const sector = memo.sectors[0];
    expect(sector).toHaveProperty('sector_id');
    expect(sector).toHaveProperty('code');
    expect(sector).toHaveProperty('name');
    expect(sector).toHaveProperty('name_en');
    expect(sector).toHaveProperty('level');
    expect(typeof sector.level).toBe('number');
    expect([1, 2, 3, 4]).toContain(sector.level);
  });

  it('직접 L1 섹터 연결 메모의 sectors[].level이 1이다', async () => {
    const { data, error } = await userClient.rpc('list_memos', {
      p_sector_ids: [l1SectorId],
    });

    expect(error).toBeNull();
    const memo = (data.memos as Array<any>).find((m) => m.id === memoDirectL1);
    expect(memo).toBeDefined();
    expect(memo.sectors.length).toBeGreaterThan(0);

    const l1Sector = memo.sectors.find((s: any) => s.sector_id === l1SectorId);
    expect(l1Sector).toBeDefined();
    expect(l1Sector.level).toBe(1);
  });

  it('직접 L4 섹터 연결 메모의 sectors[].level이 4이다', async () => {
    const { data, error } = await userClient.rpc('list_memos', {
      p_sector_ids: [l4SectorId],
    });

    expect(error).toBeNull();
    const memo = (data.memos as Array<any>).find((m) => m.id === memoDirectL4);
    expect(memo).toBeDefined();

    const l4Sector = memo.sectors.find((s: any) => s.sector_id === l4SectorId);
    expect(l4Sector).toBeDefined();
    expect(l4Sector.level).toBe(4);
  });

  it('sectors[].name_en이 null이 아닌 문자열이다', async () => {
    const { data, error } = await userClient.rpc('list_memos', {
      p_sector_ids: [l4SectorId],
    });

    expect(error).toBeNull();
    const memo = (data.memos as Array<any>).find((m) => m.id === memoDirectL4);
    expect(memo).toBeDefined();

    const sector = memo.sectors[0];
    expect(sector.name_en).not.toBeNull();
    expect(typeof sector.name_en).toBe('string');
    expect(sector.name_en.length).toBeGreaterThan(0);
  });

  it('섹터 연결 없는 메모의 sectors는 빈 배열이다', async () => {
    // 섹터 없는 메모를 직접 조회 (전체 목록)
    const { data, error } = await userClient.rpc('list_memos', {});

    expect(error).toBeNull();
    const memo = (data.memos as Array<any>).find((m) => m.id === memoNoLinks);
    if (memo) {
      expect(Array.isArray(memo.sectors)).toBe(true);
      expect(memo.sectors.length).toBe(0);
    }
  });
});

// ════════════════════════════════════════════
// 6 & 7. create_memo_with_links — L1~L4 섹터 연결 및 응답 필드 검증
// ════════════════════════════════════════════

describe('[019-6-7] create_memo_with_links — 섹터 연결 및 응답 sectors 필드', () => {
  it('L1 섹터로 메모 생성 시 응답 sectors 배열에 level=1, name_en이 포함된다', async () => {
    const { data, error } = await userClient.rpc('create_memo_with_links', {
      p_body: `019 create L1섹터 메모 ${RUN_ID}`,
      p_stocks: [],
      p_trade_event_ids: [],
      p_news_ids: [],
      p_sector_ids: [l1SectorId],
    });

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    createdMemoIds.push(data.id);

    expect(Array.isArray(data.sectors)).toBe(true);
    expect(data.sectors.length).toBe(1);

    const sector = data.sectors[0];
    expect(sector).toHaveProperty('sector_id');
    expect(sector).toHaveProperty('code');
    expect(sector).toHaveProperty('name');
    expect(sector).toHaveProperty('name_en');
    expect(sector).toHaveProperty('level');
    expect(sector.level).toBe(1);
    expect(sector.sector_id).toBe(l1SectorId);
  });

  it('L2 섹터로 메모 생성 시 응답 sectors[].level이 2이다', async () => {
    const { data, error } = await userClient.rpc('create_memo_with_links', {
      p_body: `019 create L2섹터 메모 ${RUN_ID}`,
      p_stocks: [],
      p_trade_event_ids: [],
      p_news_ids: [],
      p_sector_ids: [l2SectorId],
    });

    expect(error).toBeNull();
    createdMemoIds.push(data.id);

    const sector = data.sectors[0];
    expect(sector.level).toBe(2);
    expect(sector.sector_id).toBe(l2SectorId);
  });

  it('L3 섹터로 메모 생성 시 응답 sectors[].level이 3이다', async () => {
    const { data, error } = await userClient.rpc('create_memo_with_links', {
      p_body: `019 create L3섹터 메모 ${RUN_ID}`,
      p_stocks: [],
      p_trade_event_ids: [],
      p_news_ids: [],
      p_sector_ids: [l3SectorId],
    });

    expect(error).toBeNull();
    createdMemoIds.push(data.id);

    const sector = data.sectors[0];
    expect(sector.level).toBe(3);
    expect(sector.sector_id).toBe(l3SectorId);
  });

  it('L4 섹터로 메모 생성 시 응답 sectors[].level이 4이다', async () => {
    const { data, error } = await userClient.rpc('create_memo_with_links', {
      p_body: `019 create L4섹터 메모 ${RUN_ID}`,
      p_stocks: [],
      p_trade_event_ids: [],
      p_news_ids: [],
      p_sector_ids: [l4SectorId],
    });

    expect(error).toBeNull();
    createdMemoIds.push(data.id);

    const sector = data.sectors[0];
    expect(sector.level).toBe(4);
    expect(sector.sector_id).toBe(l4SectorId);
  });

  it('복수 레벨 섹터 동시 연결 (L1 + L4) 시 응답에 모두 포함된다', async () => {
    const { data, error } = await userClient.rpc('create_memo_with_links', {
      p_body: `019 create L1+L4섹터 메모 ${RUN_ID}`,
      p_stocks: [],
      p_trade_event_ids: [],
      p_news_ids: [],
      p_sector_ids: [l1SectorId, l4SectorId],
    });

    expect(error).toBeNull();
    createdMemoIds.push(data.id);

    expect(data.sectors.length).toBe(2);
    const levels = data.sectors.map((s: any) => s.level).sort();
    expect(levels).toContain(1);
    expect(levels).toContain(4);
  });

  it('존재하지 않는 sector_id로 메모 생성 시 에러가 반환된다', async () => {
    const { error } = await userClient.rpc('create_memo_with_links', {
      p_body: '019 잘못된 섹터 메모',
      p_stocks: [],
      p_trade_event_ids: [],
      p_news_ids: [],
      p_sector_ids: [999999],
    });

    expect(error).not.toBeNull();
  });

  it('sectors 없이 메모 생성 시 응답 sectors가 빈 배열이다', async () => {
    const { data, error } = await userClient.rpc('create_memo_with_links', {
      p_body: `019 섹터없는 메모 ${RUN_ID}`,
      p_stocks: [],
      p_trade_event_ids: [],
      p_news_ids: [],
      p_sector_ids: [],
    });

    expect(error).toBeNull();
    createdMemoIds.push(data.id);

    expect(Array.isArray(data.sectors)).toBe(true);
    expect(data.sectors.length).toBe(0);
  });

  it('미인증 사용자는 create_memo_with_links RPC 호출 불가', async () => {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });

    const { error } = await anonClient.rpc('create_memo_with_links', {
      p_body: '미인증 테스트',
      p_stocks: [],
      p_trade_event_ids: [],
      p_news_ids: [],
      p_sector_ids: [],
    });

    expect(error).not.toBeNull();
  });
});

// ════════════════════════════════════════════
// 8 & 9. update_memo_with_links — L1~L4 섹터 연결 및 응답 필드 검증
// ════════════════════════════════════════════

describe('[019-8-9] update_memo_with_links — 섹터 연결 및 응답 sectors 필드', () => {
  let memoForUpdate: string;

  beforeAll(async () => {
    // 업데이트 테스트용 메모 생성
    const { data, error } = await userClient.rpc('create_memo_with_links', {
      p_body: `019 업데이트 테스트 메모 ${RUN_ID}`,
      p_stocks: [],
      p_trade_event_ids: [],
      p_news_ids: [],
      p_sector_ids: [],
    });
    if (error) throw new Error(`업데이트 테스트 메모 생성 실패: ${error.message}`);
    memoForUpdate = data.id;
    createdMemoIds.push(memoForUpdate);
  });

  it('L1 섹터로 업데이트 시 응답 sectors[].level이 1이다', async () => {
    const { data, error } = await userClient.rpc('update_memo_with_links', {
      p_memo_id: memoForUpdate,
      p_sector_ids: [l1SectorId],
    });

    expect(error).toBeNull();
    expect(Array.isArray(data.sectors)).toBe(true);
    expect(data.sectors.length).toBe(1);

    const sector = data.sectors[0];
    expect(sector.level).toBe(1);
    expect(sector).toHaveProperty('name_en');
  });

  it('L4 섹터로 업데이트 시 응답 sectors[].level이 4이고 name_en이 포함된다', async () => {
    const { data, error } = await userClient.rpc('update_memo_with_links', {
      p_memo_id: memoForUpdate,
      p_sector_ids: [l4SectorId],
    });

    expect(error).toBeNull();
    expect(data.sectors.length).toBe(1);

    const sector = data.sectors[0];
    expect(sector.level).toBe(4);
    expect(sector).toHaveProperty('name_en');
    expect(typeof sector.name_en).toBe('string');
  });

  it('섹터를 빈 배열로 업데이트 시 응답 sectors가 빈 배열이다', async () => {
    const { data, error } = await userClient.rpc('update_memo_with_links', {
      p_memo_id: memoForUpdate,
      p_sector_ids: [],
    });

    expect(error).toBeNull();
    expect(Array.isArray(data.sectors)).toBe(true);
    expect(data.sectors.length).toBe(0);
  });

  it('p_sector_ids=null 전달 시 섹터 연결이 변경되지 않는다 (null = 변경 안 함)', async () => {
    // 먼저 L2 섹터 설정
    await userClient.rpc('update_memo_with_links', {
      p_memo_id: memoForUpdate,
      p_sector_ids: [l2SectorId],
    });

    // null로 업데이트 시 변경 없어야 함
    const { data, error } = await userClient.rpc('update_memo_with_links', {
      p_memo_id: memoForUpdate,
      p_sector_ids: null,
    });

    expect(error).toBeNull();
    // sectors는 이전 상태 유지 (l2SectorId 연결)
    const sectorIds = data.sectors.map((s: any) => s.sector_id);
    expect(sectorIds).toContain(l2SectorId);
  });

  it('존재하지 않는 sector_id로 업데이트 시 에러가 반환된다', async () => {
    const { error } = await userClient.rpc('update_memo_with_links', {
      p_memo_id: memoForUpdate,
      p_sector_ids: [999999],
    });

    expect(error).not.toBeNull();
  });

  it('다른 유저의 메모를 업데이트하면 에러가 반환된다', async () => {
    // 다른 유저 생성
    const otherEmail = `019-other-${RUN_ID}@example.com`;
    const { data: otherUser } = await adminClient.auth.admin.createUser({
      email: otherEmail,
      password: TEST_PASSWORD,
      email_confirm: true,
    });

    const otherClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
    await otherClient.auth.signInWithPassword({
      email: otherEmail,
      password: TEST_PASSWORD,
    });

    const { error } = await otherClient.rpc('update_memo_with_links', {
      p_memo_id: memoForUpdate,
      p_sector_ids: [l1SectorId],
    });

    expect(error).not.toBeNull();

    // 정리
    await otherClient.auth.signOut();
    if (otherUser?.user?.id) {
      await adminClient.auth.admin.deleteUser(otherUser.user.id);
    }
  });
});

// ════════════════════════════════════════════
// 10. 카운트 쿼리 정확성
// ════════════════════════════════════════════

describe('[019-10] total_count 정확성 — 카운트 쿼리와 목록 쿼리 일치', () => {
  it('p_sector_ids 필터 적용 시 total_count와 실제 반환 메모 수가 일치한다', async () => {
    // 전체 반환을 위해 p_limit를 충분히 크게 설정
    const { data, error } = await userClient.rpc('list_memos', {
      p_sector_ids: [l1SectorId],
      p_limit: 100,
      p_offset: 0,
    });

    expect(error).toBeNull();
    const memos = data.memos as Array<any>;
    const totalCount = data.total_count as number;

    // total_count는 실제 반환된 메모 수 이상이어야 함
    // (p_limit=100 이고 실제 메모가 100개 미만이면 동일해야 함)
    if (memos.length < 100) {
      expect(totalCount).toBe(memos.length);
    } else {
      expect(totalCount).toBeGreaterThanOrEqual(memos.length);
    }
  });

  it('p_sector_ids=null 시 total_count가 실제 메모 총 수와 일치한다', async () => {
    const { data: withNull, error: e1 } = await userClient.rpc('list_memos', {
      p_limit: 100,
      p_offset: 0,
    });

    expect(e1).toBeNull();

    const memos = withNull.memos as Array<any>;
    const totalCount = withNull.total_count as number;

    if (memos.length < 100) {
      expect(totalCount).toBe(memos.length);
    } else {
      expect(totalCount).toBeGreaterThanOrEqual(100);
    }
  });

  it('페이지네이션 시 total_count는 변하지 않는다 (offset만 변경)', async () => {
    const { data: page1, error: e1 } = await userClient.rpc('list_memos', {
      p_sector_ids: [l1SectorId],
      p_limit: 2,
      p_offset: 0,
    });

    const { data: page2, error: e2 } = await userClient.rpc('list_memos', {
      p_sector_ids: [l1SectorId],
      p_limit: 2,
      p_offset: 2,
    });

    expect(e1).toBeNull();
    expect(e2).toBeNull();

    // 동일 필터에서 total_count는 offset에 무관하게 동일해야 함
    expect(page1.total_count).toBe(page2.total_count);
  });

  it('미인증 사용자는 list_memos RPC 호출 불가', async () => {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });

    const { error } = await anonClient.rpc('list_memos', {});
    expect(error).not.toBeNull();
  });
});
