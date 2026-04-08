# invest-dashboard

## 프로젝트 개요
투자 관련 대시보드 모바일 앱.

## 개발 환경
- **하드웨어**: MacBook
- **IDE**: WebStorm (주 개발), Xcode (iOS 시뮬레이터 실행 및 앱 패키징)

## 기술 스택

### 프론트엔드 (`app/`)
- **React Native** + **Expo** (Managed Workflow)
- **언어**: TypeScript
- **배포**: EAS (Expo Application Services)
- 현재 단계: Expo Go로 개발, 추후 필요 시 Development Build로 전환

### 백엔드/DB
- **Supabase** — 별도 서버 없이 SQL 쿼리 및 외부 데이터 관리
- 추후 백엔드 서버 추가 시 `server/` 디렉토리 생성

## 디렉토리 구조
```
invest-dashboard/
├── CLAUDE.md
├── docs/           # 기획 문서, API 명세 등
└── app/            # React Native (Expo) 앱
```

## 개발 규칙
- (추후 추가)
