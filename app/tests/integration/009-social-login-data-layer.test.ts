/**
 * [009] 소셜 로그인 데이터/API 레이어 통합 테스트
 *
 * 테스트 범위:
 *   1. extractSocialNickname — 소셜 로그인 닉네임 추출 로직 (순수 함수)
 *   2. 소셜 로그인 후 프로필 자동 생성 시뮬레이션 (service_role로 유저 생성 → getProfile → createProfile)
 *
 * OAuth 플로우(signInWithOAuth) 자체는 시스템 브라우저 + OAuth provider 상호작용이 필요하므로
 * 통합 테스트에서는 검증 불가. E2E 테스트(Maestro)에서 커버한다.
 *
 * 필요 환경변수 (app/.env.test):
 *   SUPABASE_URL          — Supabase 프로젝트 URL
 *   SUPABASE_ANON_KEY     — anon/publishable key
 *   SUPABASE_SERVICE_KEY  — service_role key
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

// ────────────────────────────────────────────
// extractSocialNickname 직접 구현 (서비스 파일이 expo 의존성이 있어 직접 테스트)
// ────────────────────────────────────────────

function extractSocialNickname(
  userMetadata: Record<string, unknown> | undefined,
  email: string | undefined,
): string {
  const fullName = userMetadata?.full_name as string | undefined;
  const name = userMetadata?.name as string | undefined;
  const emailPrefix = email?.split('@')[0];

  const raw = fullName || name || emailPrefix || '사용자';

  const trimmed = raw.slice(0, 20);
  return trimmed.length >= 2 ? trimmed : '사용자';
}

// ────────────────────────────────────────────
// 테스트 1: extractSocialNickname 순수 함수
// ────────────────────────────────────────────

describe('extractSocialNickname', () => {
  it('full_name이 있으면 full_name을 사용한다', () => {
    const result = extractSocialNickname(
      { full_name: '홍길동', name: '길동' },
      'hong@example.com',
    );
    expect(result).toBe('홍길동');
  });

  it('full_name이 없으면 name을 사용한다', () => {
    const result = extractSocialNickname(
      { name: 'John Doe' },
      'john@example.com',
    );
    expect(result).toBe('John Doe');
  });

  it('full_name과 name 모두 없으면 이메일 @ 앞부분을 사용한다', () => {
    const result = extractSocialNickname({}, 'testuser@example.com');
    expect(result).toBe('testuser');
  });

  it('메타데이터와 이메일 모두 없으면 "사용자"를 반환한다', () => {
    const result = extractSocialNickname(undefined, undefined);
    expect(result).toBe('사용자');
  });

  it('full_name이 빈 문자열이면 name으로 폴백한다', () => {
    const result = extractSocialNickname(
      { full_name: '', name: 'Fallback' },
      'test@example.com',
    );
    expect(result).toBe('Fallback');
  });

  it('20자를 초과하면 잘라낸다', () => {
    const result = extractSocialNickname(
      { full_name: 'A'.repeat(30) },
      'test@example.com',
    );
    expect(result).toBe('A'.repeat(20));
  });

  it('1자짜리 이름이면 "사용자"로 폴백한다', () => {
    const result = extractSocialNickname(
      { full_name: 'A' },
      undefined,
    );
    expect(result).toBe('사용자');
  });

  it('이메일 @ 앞부분이 1자이면 "사용자"로 폴백한다', () => {
    const result = extractSocialNickname({}, 'a@example.com');
    expect(result).toBe('사용자');
  });
});

// ────────────────────────────────────────────
// 테스트 2: 소셜 로그인 후 프로필 자동 생성 시뮬레이션
// ────────────────────────────────────────────

describe('소셜 로그인 프로필 자동 생성 시뮬레이션', () => {
  let adminClient: SupabaseClient;
  let userClient: SupabaseClient;
  let testUserId: string;

  const TEST_EMAIL = `social-test-${RUN_ID}@example.com`;
  const TEST_PASSWORD = 'TestPassword123!';

  beforeAll(async () => {
    adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 테스트 유저 생성 (소셜 로그인 시뮬레이션: service_role로 유저 생성)
    const { data: authData, error: authError } =
      await adminClient.auth.admin.createUser({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: 'Social Test User' },
      });

    if (authError) throw authError;
    testUserId = authData.user.id;

    // 일반 클라이언트로 로그인
    userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: signInError } = await userClient.auth.signInWithPassword({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });
    if (signInError) throw signInError;
  });

  afterAll(async () => {
    // 프로필 및 유저 정리
    await adminClient.from('profiles').delete().eq('user_id', testUserId);
    await adminClient.auth.admin.deleteUser(testUserId);
  });

  it('프로필이 없는 신규 사용자에게 프로필을 생성할 수 있다', async () => {
    // 프로필 존재 여부 확인 (maybeSingle로 조회)
    const { data: existingProfile } = await userClient
      .from('profiles')
      .select('id')
      .eq('user_id', testUserId)
      .maybeSingle();

    expect(existingProfile).toBeNull();

    // 소셜 닉네임 추출 (user_metadata에서)
    const nickname = extractSocialNickname(
      { full_name: 'Social Test User' },
      TEST_EMAIL,
    );
    expect(nickname).toBe('Social Test User');

    // 프로필 생성
    const { data: profile, error } = await userClient
      .from('profiles')
      .insert({ user_id: testUserId, nickname })
      .select()
      .single();

    expect(error).toBeNull();
    expect(profile).toBeDefined();
    expect(profile!.nickname).toBe('Social Test User');
    expect(profile!.user_id).toBe(testUserId);
  });

  it('이미 프로필이 있는 사용자는 중복 생성이 거부된다', async () => {
    // 위 테스트에서 이미 프로필이 생성됨 → 중복 INSERT 시도
    const { error } = await userClient
      .from('profiles')
      .insert({ user_id: testUserId, nickname: 'Duplicate' })
      .select()
      .single();

    // user_id UNIQUE 제약 위반
    expect(error).not.toBeNull();
    expect(error!.code).toBe('23505'); // unique_violation
  });
});
