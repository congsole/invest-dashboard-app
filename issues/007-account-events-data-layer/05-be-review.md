# [007] BE 코드 리뷰

## 리뷰 결과: PASS

---

## Initial Review

**결과**: 이슈 3건 (high 1, mid 1, low 1)

### 이슈 목록

- [high] `cron-collect-fx-rates/index.ts`: `is_updated` 응답값이 항상 `true`. upsert 후 `.select().single()`로 반환된 데이터는 신규 삽입이든 업데이트든 항상 non-null이므로 api-spec의 `is_updated: 기존 데이터 업데이트 여부 (true) / 신규 삽입 (false)` 의미와 불일치.
- [mid] `confirm-account-csv/index.ts`: `external_ref` 중복 검출 쿼리에 `user_id` 필터 누락. RLS로 본인 데이터만 조회되어 실질적 문제는 없으나, 명시적 필터 부재로 코드 의도가 불명확하고 보안 관행에 미흡.
- [low] `cron-collect-prices/index.ts`: 169~171행 dead code — 빈 for loop (`for (const [, v] of netQtyMap) { if (v.qty > 0) { // asset_type에서 ticker 복원 } }`). 주석만 있고 아무 동작 없는 코드.

---

## Cycle 1

**수정 내용**

- `app/supabase/functions/cron-collect-fx-rates/index.ts`: upsert 실행 전 `.maybeSingle()`로 기존 레코드 존재 여부를 먼저 확인하여 `isUpdated`를 결정. upsert는 `.select()` 없이 실행하여 응답값 의존성 제거.
- `app/supabase/functions/confirm-account-csv/index.ts`: `external_ref` 중복 검출 쿼리에 `.eq('user_id', user.id)` 필터 추가.
- `app/supabase/functions/cron-collect-prices/index.ts`: 빈 for loop 및 관련 주석 제거. `holdingTickers` 배열 선언 후 바로 `tickerMap` 집계로 이어지도록 정리.

**Confirmation 결과**: 합격

- `cron-collect-fx-rates`: 수정 후 `is_updated`가 api-spec 의미와 일치. 새 로직 도입으로 인한 부작용 없음.
- `confirm-account-csv`: `user_id` 필터 추가 확인. RLS와 중복이지만 명시적 의도가 명확해짐.
- `cron-collect-prices`: dead code 제거 확인. 로직 흐름(`netQtyMap` → `tickerMap` → `holdingTickers` 필터) 정상.

---

## 최종 결과

**합격**

### 검토 완료 항목

- SQL 마이그레이션: db-schema.md의 모든 테이블(account_events/daily_snapshots/corporate_actions/prices/fx_rates) 컬럼·제약조건·인덱스 일치 확인. 기존 trade_events/cash_balances 제거 및 이전 RPC 함수 제거 포함.
- RLS: 모든 테이블 RLS 활성화. account_events(CRUD 본인), daily_snapshots(SELECT/INSERT/UPDATE 본인, DELETE 없음), corporate_actions/prices/fx_rates(SELECT 공개, 쓰기 정책 없이 RLS 기본 deny로 service_role 전용) — 명세 방향과 일치.
- RPC: `get_kpi_summary`의 원금/예수금/보유수량/평균매수가/corporate_actions 반영 로직이 domain-model.md 계산 규칙과 일치. `get_history_markers`의 KRW 환산 로직(fx_rate_at_event 우선 → fx_rates 테이블 → fallback 1300) 정상.
- Edge Functions: parse/confirm-account-csv JWT 인증 정상. cron 함수들 service_role 키 사용, 에러 처리 포함.
- 서비스 레이어: api-spec.md 호출 패턴 일치. TypeScript 타입 정확. 에러 처리 일관.
- 보안: SQL injection 없음(파라미터화된 쿼리 사용). RLS 우회 없음. API 키 하드코딩 없음(env var 사용).

### Info (수정 미적용)

- `get_kpi_summary`: p_asset_type 필터가 holdings(buy/sell)에만 적용되고 원금/예수금에는 미적용. api-spec의 "부문 필터 시 클라이언트에서 별도 계산 필요" 주석과 일치하는 설계 의도로 판단.
- `get_kpi_summary`: corporate_actions의 effective_date 조건 없이 전체 ratio 누적 적용. 04-supabase-impl.md에서 이미 인지된 한계(reverse_split/merger 향후 별도 처리 예정).
- `dashboard.ts` `Period` 타입에 `'day'` 포함: api-spec 범위 외지만 내부 유틸로서 기능적 문제 없음.
