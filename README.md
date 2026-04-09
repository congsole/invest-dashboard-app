# invest-dashboard

투자 관련 대시보드 모바일 앱. React Native(Expo) + Supabase.

## 개발 환경 설정

### 1. 의존성 설치

```bash
cd app
npm install
```

### 2. 환경변수 설정

`app/.env.local` 파일 생성:

```
EXPO_PUBLIC_SUPABASE_URL=https://{project-ref}.supabase.co
EXPO_PUBLIC_SUPABASE_KEY={anon-key}
```

Supabase 대시보드 → Project Settings → API 에서 확인.

### 3. Supabase CLI 설정

마이그레이션 자동 적용을 위해 Supabase CLI 연결이 필요하다.

```bash
# CLI 설치
brew install supabase/tap/supabase

# 로그인
supabase login

# 프로젝트 연결 (project-ref는 Supabase 대시보드 URL에서 확인)
cd app
supabase link --project-ref {project-ref}
```

설정 후 마이그레이션 적용:

```bash
cd app
supabase db push
```

> **주의**: 이 설정이 없으면 AI 파이프라인의 `supabase-impl-agent`가 마이그레이션을 자동 적용하지 못한다.

### 4. 앱 실행

```bash
cd app
npx expo start
```

---

## AI 개발 파이프라인

이 프로젝트는 Claude Code 서브에이전트 기반 자동화 파이프라인을 사용한다.

### 트리거

`docs/planning/` 또는 `docs/design/` 에 커밋하면 git hook이 자동으로 PM 에이전트를 실행하여 `issues/` 폴더에 이슈를 생성한다.

### 파이프라인 실행

이슈 생성 후 아래 명령으로 전체 개발 파이프라인을 실행한다:

```
issue {NNN} 파이프라인 실행해줘.
```

### 에이전트 목록

| 에이전트 | 역할 |
|---|---|
| `pm-agent` | 기획서 분석 → 이슈 생성 |
| `domain-model-agent` | 도메인 모델 설계 |
| `db-schema-agent` | DB 스키마 설계 |
| `api-spec-agent` | API 명세 설계 |
| `supabase-impl-agent` | Supabase 구현 + 마이그레이션 적용 |
| `frontend-impl-agent` | React Native 화면/컴포넌트 구현 |
| `be-reviewer-agent` | 백엔드 코드 리뷰 (최대 3 사이클) |
| `fe-reviewer-agent` | 프론트엔드 코드 리뷰 (최대 3 사이클) |
| `e2e-test-agent` | 통합 테스트 (정적 코드 추적) |
| `pipeline-agent` | 전체 파이프라인 오케스트레이션 |

자세한 내용은 `CLAUDE.md` 참고.

---

## 디렉토리 구조

```
invest-dashboard/
├── docs/           # 기획서, 아키텍처, API 명세
├── ui/             # UI 레퍼런스 (HTML, CSS)
├── issues/         # 이슈별 작업 로그 및 산출물
└── app/            # React Native(Expo) 앱
    ├── services/   # Supabase API 호출 (도메인별)
    ├── hooks/      # 커스텀 훅
    ├── screens/    # 화면 컴포넌트
    ├── components/ # 공통 컴포넌트
    ├── types/      # 공통 타입
    └── supabase/
        └── migrations/  # DB 마이그레이션 SQL
```
