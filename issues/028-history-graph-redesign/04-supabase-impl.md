# Supabase 구현 내역

## 마이그레이션

- `app/supabase/migrations/20260611000000_history_markers_dividend_only.sql`

### 내용 요약

`get_history_markers` DB Function의 시그니처를 변경한다.

**변경 전**: `get_history_markers(p_from date, p_to date)` — 배당+출금 마커 반환  
**변경 후**: `get_history_markers()` — 배당 마커만 반환 (전체 기간)

처리 순서:
1. `drop function if exists public.get_history_markers(date, date)` — 구 시그니처 명시적 DROP.  
   CREATE OR REPLACE는 파라미터 목록이 다를 때 오버로드를 생성하므로, 구 함수를 먼저 제거하고 재생성한다.
2. `create or replace function public.get_history_markers()` — 파라미터 없는 신규 버전 생성.  
   `event_type = 'dividend'` 필터만 적용하고, 날짜 범위 조건(`event_date >= p_from / <= p_to`)을 제거한다.  
   KRW 환산 로직(fx_rate_at_event 우선, 없으면 fx_rates 조회, fallback 1300)은 그대로 유지.

## Edge Functions

해당 없음. `get_history_markers`는 DB Function(RPC)이므로 별도 Edge Function 불필요.

## 클라이언트 유틸

- `app/services/dashboard.ts` — `getHistoryMarkers`, `getDailySnapshots` 수정
- `app/types/dashboard.ts` — `HistoryMarker.event_type` 타입 수정 (FE 트랙에서 선행 수정됨, 확인 완료)

### getHistoryMarkers

```typescript
// 변경 전
export async function getHistoryMarkers(from: string, to: string): Promise<HistoryMarker[]>
// 변경 후
export async function getHistoryMarkers(): Promise<HistoryMarker[]>
```

파라미터 `from`/`to` 제거. `supabase.rpc('get_history_markers', {})` → `supabase.rpc('get_history_markers')` 로 변경.

### getDailySnapshots

```typescript
// 변경 전
export async function getDailySnapshots(from: string, to: string): Promise<DailySnapshot[]>
// 변경 후
export async function getDailySnapshots(): Promise<DailySnapshot[]>
```

파라미터 `from`/`to` 제거. `.gte`/`.lte` 날짜 범위 필터 제거. 전체 기간을 1회 조회 (FE 트랙에서 선행 수정됨, 확인 완료).

### HistoryMarker 타입 (app/types/dashboard.ts)

```typescript
// 변경 전
event_type: 'dividend' | 'withdraw';
// 변경 후
event_type: 'dividend';  // 출금(withdraw) 마커 제거, 배당(dividend)만 반환
```

FE 트랙에서 선행 수정되어 있었고 해당 방향으로 확인 완료.

## 사전 의존성 체크리스트

- [x] 로컬 `supabase db reset` 통과 — `20260611000000_history_markers_dividend_only.sql` 포함 전체 마이그레이션 정상 적용
- [x] `get_history_markers()` 파라미터 없는 시그니처만 존재 확인 (docker exec psql로 검증)
- [ ] 원격 DB 반영 (`supabase db push`) — backend-test-agent 전체 스위트 합격 후 수행

## 특이사항

- FE 트랙이 선행 수행되어 `app/services/dashboard.ts`와 `app/types/dashboard.ts` 모두 이미 이슈 028 방향으로 수정되어 있었다. 서비스 함수(`getHistoryMarkers`, `getDailySnapshots`) 및 타입(`HistoryMarker.event_type`, `Period`)이 모두 최신 API 명세와 일치하는 상태로 확인.
- `periodToDateRange` 함수는 `@deprecated`로 마킹되어 더미 구현(`from: '2000-01-01'`)으로 교체되어 있었다. 본 이슈 범위에서는 추가 수정 불필요.
- 마이그레이션 타임스탬프 `20260611000000` — 직전 마이그레이션 `20260610070000`과 중복 없이 순서 보장.
