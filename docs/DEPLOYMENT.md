# 배포 가이드 (EAS Internal Distribution)

개인 iPhone에 프라이빗 배포 + OTA 업데이트 구성.

## 초기 세팅 (1회)

```bash
# 1. EAS CLI 설치
npm install -g eas-cli

# 2. Expo 로그인 (https://expo.dev 계정 필요)
eas login

# 3. app/ 에서 프로젝트 초기화
cd app
eas init
# → app.json에 projectId 자동 반영됨
# → updates.url의 UPDATE_AFTER_EAS_INIT도 실제 ID로 교체할 것

# 4. OTA 업데이트용 패키지 설치
npx expo install expo-updates

# 5. iPhone 디바이스 등록
eas device:create
# → 나오는 URL을 iPhone Safari에서 열어 프로파일 설치

# 6. 첫 빌드
eas build --profile preview --platform ios
# → 완료 후 설치 링크가 나옴 → iPhone에서 탭하여 설치
```

## 업데이트 방법

| 변경 내용 | 명령어 | 소요 시간 |
|-----------|--------|-----------|
| JS/TS만 변경 | `eas update --branch preview` | ~30초 |
| 네이티브 변경 (새 플러그인 추가 등) | `eas build --profile preview --platform ios` | ~10분 |

> 네이티브 변경 = `app.json`의 plugins 변경, 새 네이티브 모듈 설치 등.
> 그 외 코드/스타일/로직 변경은 전부 OTA로 가능.

## 관련 파일

| 파일 | 역할 |
|------|------|
| `app/eas.json` | EAS 빌드 프로필 설정 |
| `app/app.json` | Expo 앱 설정 (updates, runtimeVersion 포함) |

## Supabase Edge Function Cron (데이터 수집 파이프라인)

`daily_snapshots`(자산 히스토리 그래프 데이터)를 채우는 일일 배치. 함수 코드는
`app/supabase/functions/cron-*`에 있고, 스케줄은 **Supabase 대시보드 Cron**으로 등록한다
(대시보드 → Integrations → Cron). 마이그레이션이 아닌 대시보드 등록인 이유: cron job에
함수 호출용 키가 필요한데 SQL 마이그레이션에 넣으면 git에 시크릿이 박히기 때문.

등록된 job (2026-06-10 배포):

| 순서 | 함수 | 스케줄 (UTC) | KST | 역할 |
|------|------|-------------|-----|------|
| 1 | `cron-collect-fx-rates` | `0 15 * * *` | 00:00 | USD/KRW 환율 → `fx_rates` |
| 2 | `cron-collect-prices` | `2 15 * * *` | 00:02 | 보유 종목 종가 → `prices` (미국: Twelve Data 최근 거래일, 한국: 네이버 금융, 코인: CoinGecko) |
| 3 | `cron-create-snapshots` | `15 15 * * *` | 00:15 | 사용자별 일일 자산 스냅샷 → `daily_snapshots` |

- cron job 설정: Method `POST`, Timeout 5000ms, Headers `Authorization: Bearer {anon key}` (UI 자동), Body 불필요 (세 함수 모두 본문을 읽지 않음).
- 순서 의존성: 환율 → 종가 → 스냅샷. 스냅샷은 최근 7일 내 최신 종가/환율을 fallback으로 쓰므로 앞 단계가 실패해도 전일 값으로 동작한다.
- `cron-collect-prices`는 즉시 202를 반환하고 수집은 `EdgeRuntime.waitUntil` 백그라운드로 계속한다 (클라이언트가 연결을 끊어도 완주 — 2026-06-10 운영 검증). Twelve Data 무료 한도(분당 8크레딧) 때문에 미국주식 8심볼당 60초 대기가 들어가 백그라운드 작업이 분 단위로 걸린다 — 스냅샷과 13분 간격을 둔 이유. 결과는 함수 Logs의 `cron-collect-prices 완료:` 라인으로 확인.
- 필요 secrets (등록 완료): `EXCHANGE_RATE_API_KEY`, `TWELVE_DATA_API_KEY`, `COINGECKO_API_KEY`
- 수동 실행(검증/재수집): `curl -X POST {SUPABASE_URL}/functions/v1/{함수명} -H "Authorization: Bearer {service key}"` — 셋 다 upsert 기반이라 중복 실행해도 안전. `cron-collect-prices`는 `?sync=1`을 붙이면 완료까지 기다렸다가 결과(JSON)를 반환한다.

## 참고

- Apple Developer 계정 ($99/yr) 필요
- Internal Distribution은 Ad Hoc 방식 — 등록된 디바이스(최대 100대)에만 설치 가능
- 빌드는 Expo 클라우드에서 실행됨 (로컬 Xcode 빌드 불필요)
- OTA 업데이트는 앱 실행 시 자동 체크 → 다음 실행 때 적용
