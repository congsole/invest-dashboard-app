# invest-dashboard

투자 관련 대시보드 모바일 앱. React Native(Expo) + Supabase.

---

## 목차

1. [기술 스택](#기술-스택)
2. [개발 환경 설정](#개발-환경-설정)
3. [앱 실행](#앱-실행)
4. [디렉토리 구조](#디렉토리-구조)
5. [기능 개발 방법](#기능-개발-방법)
6. [AI 개발 파이프라인](#ai-개발-파이프라인)
7. [이슈 구조](#이슈-구조)
8. [코드 컨벤션](#코드-컨벤션)

---

## 기술 스택

| 영역 | 기술 |
|---|---|
| 앱 | React Native 0.81 + Expo SDK 54 (Managed Workflow) |
| 언어 | TypeScript |
| 백엔드/DB | Supabase (PostgreSQL, RLS, Edge Functions) |
| 인증 | Supabase Auth (이메일/비밀번호) |
| 배포 | EAS (Expo Application Services) |

별도 백엔드 서버 없이 Supabase만 사용한다. 추후 서버가 필요해지면 `server/` 디렉토리를 생성한다.

---

## 개발 환경 설정

### 사전 준비

- Node.js 18 이상
- Xcode (iOS 시뮬레이터, Mac 전용)
- Expo Go 앱 (실기기 테스트용)

### 1. 의존성 설치

```bash
cd app
npm install
```

### 2. 환경변수 설정

`app/.env.local` 파일을 직접 생성한다 (git에 포함되지 않음):

```
EXPO_PUBLIC_SUPABASE_URL=https://{project-ref}.supabase.co
EXPO_PUBLIC_SUPABASE_KEY={anon-key}
```

값은 Supabase 대시보드 → **Project Settings → API** 에서 확인한다.

### 3. Supabase CLI 설정

마이그레이션 자동 적용 및 AI 파이프라인을 위해 필요하다.

```bash
# CLI 설치
brew install supabase/tap/supabase

# 로그인
supabase login

# 프로젝트 연결 (project-ref는 Supabase 대시보드 URL에서 확인)
cd app
supabase link --project-ref {project-ref}
```

마이그레이션 적용:

```bash
cd app
supabase db push
```

> **주의**: Supabase CLI 연결이 없으면 `supabase-impl-agent`가 마이그레이션을 자동 적용하지 못한다.

---

## 앱 실행

```bash
cd app
npx expo start
```

- **iOS 시뮬레이터**: 터미널에서 `i` 입력 또는 Xcode 시뮬레이터 실행
- **Android 에뮬레이터**: `a` 입력
- **실기기**: Expo Go 앱으로 QR 코드 스캔

---

## 디렉토리 구조

```
invest-dashboard/
├── CLAUDE.md                    # AI 에이전트 행동 규칙 (수정 금지)
├── docs/
│   ├── planning/                # 기획서 — 변경 시 이슈 자동 생성 트리거
│   ├── design/
│   │   └── DESIGN.md            # UI 설계 설명 — 변경 시 이슈 자동 생성 트리거
│   ├── architecture/
│   │   ├── domain-model.md      # 공통 도메인 모델 (누적 업데이트)
│   │   └── db-schema.md         # 공통 DB 스키마 (누적 업데이트)
│   └── api/
│       └── api-spec.md          # 공통 API 명세 (누적 업데이트)
├── ui/                          # UI 레퍼런스 (HTML/CSS — AI 구현 참고용)
│   └── {기능명}/
│       ├── index.html
│       └── style.css
├── issues/                      # 이슈별 작업 로그 및 산출물
│   └── {NNN}-{이슈명}/
│       ├── issue.md
│       ├── 04-supabase-impl.md
│       ├── 05-be-review.md
│       ├── 06-fe-review.md
│       └── 07-test-results.md
└── app/                         # React Native(Expo) 앱
    ├── services/                # Supabase API 호출 (도메인별, 예: auth.ts)
    ├── hooks/                   # 커스텀 훅
    ├── screens/                 # 화면 컴포넌트
    ├── components/              # 공통 컴포넌트
    ├── types/                   # 공통 타입
    ├── utils/                   # 유틸리티 (supabase 클라이언트 등)
    └── supabase/
        └── migrations/          # DB 마이그레이션 SQL
```

---

## 기능 개발 방법

이 프로젝트는 **기획서 커밋 → AI 파이프라인 자동 실행** 방식으로 개발한다.

### 새 기능 추가 순서

1. **기획서 작성**: `docs/planning/PRD-{NNN}-{기능명}.md` 형식으로 기획서 작성
   - 배경, 목표, 사용자 흐름, 화면 구성, 데이터 모델 포함
   - 기존 `docs/planning/PRD-001-auth.md` 참고

2. **UI 레퍼런스 작성** (선택): `ui/{기능명}/index.html`, `style.css`로 목업 제공
   - 프론트엔드 에이전트가 이 파일을 참고하여 구현한다

3. **커밋**: `docs/planning/` 또는 `docs/design/`에 변경이 생기면 파이프라인이 트리거된다
   ```bash
   git add docs/planning/PRD-{NNN}-{기능명}.md
   git commit -m "[Docs] PRD-{NNN} {기능명} 기획서 추가"
   ```

4. **이슈 생성 확인**: PM 에이전트가 `issues/{NNN}-{기능명}/issue.md`를 자동 생성한다

5. **파이프라인 실행**: Claude Code에 아래 명령 입력
   ```
   issue {NNN} 파이프라인 실행해줘.
   ```

6. **리뷰 및 테스트**: 에이전트가 코드 리뷰 → E2E 테스트까지 자동 진행한다

---

## AI 개발 파이프라인

```
[docs/planning/ 또는 docs/design/ 커밋]
        │
        ▼
    pm-agent          → issues/{NNN}/issue.md 생성
        │
        ▼
  domain-model-agent  → docs/architecture/domain-model.md 업데이트
        │
        ▼
  db-schema-agent     → docs/architecture/db-schema.md 업데이트
        │
        ▼
  api-spec-agent      → docs/api/api-spec.md 업데이트
        │
        ├────────────────────────────┐
        ▼ (병렬)                    ▼ (병렬)
  supabase-impl-agent         frontend-impl-agent
  (마이그레이션 SQL,           (RN/Expo 화면,
   RLS 정책, Edge Fn)          컴포넌트 구현)
        │                           │
  [be-reviewer-agent]        [fe-reviewer-agent]
  (최대 3 사이클)             (최대 3 사이클)
        │                           │
        └──────────────┬────────────┘
                       ▼
                 e2e-test-agent
```

### 에이전트 목록

| 에이전트 | 역할 |
|---|---|
| `pm-agent` | 기획서 분석 → 이슈 생성 |
| `domain-model-agent` | 도메인 모델 설계 및 업데이트 |
| `db-schema-agent` | DB 스키마 설계 및 업데이트 |
| `api-spec-agent` | API 명세 설계 및 업데이트 |
| `supabase-impl-agent` | Supabase 구현 (SQL + RLS + Edge Fn) + 마이그레이션 적용 |
| `frontend-impl-agent` | React Native 화면/컴포넌트 구현 |
| `be-reviewer-agent` | 백엔드 코드 리뷰 (최대 3 사이클) |
| `fe-reviewer-agent` | 프론트엔드 코드 리뷰 (최대 3 사이클) |
| `e2e-test-agent` | 통합 테스트 (정적 코드 추적) |
| `pipeline-agent` | 전체 파이프라인 오케스트레이션 |

에이전트 정의 파일: `.claude/agents/*.md`

에이전트 행동 규칙: `CLAUDE.md`

---

## 이슈 구조

각 이슈는 `issues/{NNN}-{이슈명}/` 폴더로 관리된다.

```
issues/001-user-authentication/
├── issue.md          # 이슈 요약 + docs 변경 내역 + 구현 현황 체크리스트
├── 04-supabase-impl.md   # Supabase 구현 산출물 및 로그
├── 05-be-review.md       # 백엔드 리뷰 기록
├── 06-fe-review.md       # 프론트엔드 리뷰 기록
└── 07-test-results.md    # E2E 테스트 결과
```

- `docs/`는 항상 최신 상태의 단일 진실 원천
- `issues/`는 이슈별 작업 로그 및 산출물 (과거 기록 포함)

---

## 코드 컨벤션

- 언어: TypeScript (strict 모드)
- Supabase 클라이언트: `app/utils/supabase.ts`에서 singleton 인스턴스 사용
- 도메인별 API 호출: `app/services/{도메인}.ts` (예: `auth.ts`, `portfolio.ts`)
- 화면 컴포넌트: `app/screens/{기능명}Screen.tsx`
- 공통 컴포넌트: `app/components/`
- 커스텀 훅: `app/hooks/use{기능명}.ts`
- 마이그레이션 파일: `app/supabase/migrations/` (번호 순서 유지)
