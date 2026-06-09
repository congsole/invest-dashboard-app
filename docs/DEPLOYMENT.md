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

## 참고

- Apple Developer 계정 ($99/yr) 필요
- Internal Distribution은 Ad Hoc 방식 — 등록된 디바이스(최대 100대)에만 설치 가능
- 빌드는 Expo 클라우드에서 실행됨 (로컬 Xcode 빌드 불필요)
- OTA 업데이트는 앱 실행 시 자동 체크 → 다음 실행 때 적용
