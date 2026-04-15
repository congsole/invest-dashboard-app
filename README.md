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
7. [파이프라인 트러블슈팅](#파이프라인-트러블슈팅)
8. [이슈 구조](#이슈-구조)
9. [코드 컨벤션](#코드-컨벤션)

---

## 기술 스택

| 영역 | 기술 |
|---|---|
| 앱 | React Native 0.81 + Expo SDK 54 (Managed Workflow) |
| 언어 | TypeScript |
| 백엔드/DB | Supabase (PostgreSQL, RLS, Edge Functions) |
| 인증 | Supabase Auth (이메일/비밀번호) |
| 배포 | EAS (Expo Application Services) |
| AI 파이프라인 | Claude Code (`claude -p`, post-commit hook) |
| E2E 테스트 | Maestro (수동 실행) |

별도 백엔드 서버 없이 Supabase만 사용한다. 추후 서버가 필요해지면 `server/` 디렉토리를 생성한다.

---

## 개발 환경 설정

### 사전 준비

| 도구 | 용도 | 설치 |
|---|---|---|
| Node.js 18+ | 앱 빌드/실행 | [nodejs.org](https://nodejs.org) |
| Xcode | iOS 시뮬레이터 (Mac 전용) | App Store |
| Expo Go | 실기기 테스트 | App Store / Google Play |
| Supabase CLI | 마이그레이션 적용, 파이프라인 | `brew install supabase/tap/supabase` |
| Claude Code | AI 파이프라인 | `npm install -g @anthropic-ai/claude-code` |
| Maestro | E2E 테스트 (선택) | `brew install maestro` |

### 1. 의존성 설치

```bash
cd app
npm install
```

### 2. 환경변수 설정

값은 Supabase 대시보드 **Project Settings > API** 에서 확인한다.

**`app/.env.local`** (앱 실행용, git 미포함):

```
EXPO_PUBLIC_SUPABASE_URL=https://{project-ref}.supabase.co
EXPO_PUBLIC_SUPABASE_KEY={anon-key}
```

**`app/.env.test`** (백엔드 통합 테스트용, git 미포함):

```
SUPABASE_URL=https://{project-ref}.supabase.co
SUPABASE_ANON_KEY={anon-key}
SUPABASE_SERVICE_KEY={service_role_key}
```

> `SUPABASE_SERVICE_KEY`는 service_role (secret) 키다. RLS를 우회하여 테스트 데이터를 정리하는 데 사용된다. **이 값이 비어있으면 파이프라인의 백엔드 테스트 단계가 스킵된다.**

### 3. Supabase CLI 연결

```bash
supabase login
cd app
supabase link --project-ref {project-ref}
```

마이그레이션 적용:

```bash
cd app
supabase db push
```

> Supabase CLI 연결이 없으면 파이프라인의 `supabase-impl-agent`가 마이그레이션을 적용하지 못한다.

### 4. Post-commit hook 확인

파이프라인 자동 트리거는 `.git/hooks/post-commit`에 설정되어 있다. git clone 후에는 hook이 자동 포함되지 않으므로, 아래 내용을 확인한다:

```bash
# hook 파일 존재 및 실행 권한 확인
ls -la .git/hooks/post-commit
```

hook이 없으면 기존 개발자에게 전달받거나, `.git/hooks/post-commit`을 직접 생성한다. hook은 `.claude/pipeline-prompt.md` 파일을 읽어서 실행하므로, 프롬프트 파일이 존재하는지도 확인한다.

```bash
ls .claude/pipeline-prompt.md
```

### 5. Claude Code 권한 설정

파이프라인은 `claude -p --dangerously-skip-permissions`로 headless 실행된다. Claude Code를 처음 사용하면 로그인이 필요하다:

```bash
claude login
```

---

## 앱 실행

```bash
cd app
npx expo start
```

- **iOS 시뮬레이터**: 터미널에서 `i` 입력
- **Android 에뮬레이터**: `a` 입력
- **실기기**: Expo Go 앱으로 QR 코드 스캔

---

## 디렉토리 구조

```
invest-dashboard/
├── CLAUDE.md                    # AI 에이전트 행동 규칙
├── .claude/
│   ├── agents/                  # 에이전트 정의 파일 (*.md)
│   ├── pipeline-prompt.md       # 파이프라인 실행 프롬프트 (hook이 참조)
│   └── resume-pipeline.sh       # 중단된 파이프라인 재개 스크립트
├── docs/
│   ├── planning/                # 기획서 — 변경 시 파이프라인 자동 트리거
│   ├── design/
│   │   └── DESIGN.md            # UI 설계 — 변경 시 파이프라인 자동 트리거
│   ├── architecture/
│   │   ├── domain-model.md      # 도메인 모델 (누적 업데이트)
│   │   └── db-schema.md         # DB 스키마 (누적 업데이트)
│   └── api/
│       └── api-spec.md          # API 명세 (누적 업데이트)
├── ui/                          # UI 레퍼런스 (HTML/CSS — AI 구현 참고용)
├── issues/                      # 이슈별 작업 로그 및 산출물
│   └── {NNN}-{이슈명}/
│       ├── issue.md
│       ├── 04-supabase-impl.md
│       ├── 05-be-review.md
│       ├── 06-backend-test.md
│       ├── 07-fe-impl.md
│       └── 08-fe-review.md
├── tests/
│   └── e2e/                     # Maestro E2E 플로우 (수동 실행)
└── app/                         # React Native(Expo) 앱
    ├── services/                # Supabase API 호출 (도메인별)
    ├── hooks/                   # 커스텀 훅
    ├── screens/                 # 화면 컴포넌트
    ├── components/              # 공통 컴포넌트
    ├── types/                   # 공통 타입
    ├── utils/                   # 유틸리티 (supabase 클라이언트 등)
    ├── supabase/
    │   ├── migrations/          # DB 마이그레이션 SQL
    │   └── functions/           # Edge Functions
    └── tests/
        └── integration/         # Jest 백엔드 통합 테스트
```

---

## 기능 개발 방법

이 프로젝트는 **기획서 커밋 -> AI 파이프라인 자동 실행** 방식으로 개발한다.

### 새 기능 추가 순서

1. **기획서 작성**: `docs/planning/PRD-{NNN}-{기능명}.md`
   - 기존 `docs/planning/PRD-001-auth.md` 참고
2. **UI 레퍼런스 작성** (선택): `ui/{기능명}/code.html`
3. **커밋**:
   ```bash
   git add docs/planning/PRD-{NNN}-{기능명}.md
   git commit -m "[Docs] PRD-{NNN} {기능명} 기획서 추가"
   ```
4. **자동 실행**: post-commit hook이 파이프라인을 background로 실행한다
5. **진행 확인**: `tail -f .claude/pipeline.log`
6. **완료 알림**: macOS 알림으로 완료/에러를 알려준다

### 커밋 시 자동 검증 (pre-commit hook)

`docs/planning/` 또는 `docs/design/` 파일이 포함된 커밋은 pre-commit hook이 파이프라인 실행에 필요한 환경을 자동 검증한다. 하나라도 누락되면 커밋이 차단되고 누락 항목이 표시된다.

| 체크 항목 | 없으면 |
|---|---|
| `claude` CLI 설치 | hook 자체 실행 불가 |
| `.claude/pipeline-prompt.md` | 파이프라인 프롬프트 없음 |
| `app/.supabase/` (supabase link) | 마이그레이션 적용 실패 |
| `app/.env.test` | 백엔드 테스트 실행 불가 |
| `SUPABASE_SERVICE_KEY` 값 | 테스트 데이터 정리 불가 |

일반 커밋(docs/planning, docs/design 변경 없음)은 체크 없이 통과한다.

### 파이프라인 실행 중 주의사항

- **`app/` 하위 코드를 직접 수정하지 않는다** — 에이전트가 같은 파일을 수정 중일 수 있다
- **새 커밋을 하지 않는다** — 파이프라인이 특정 커밋 해시를 기준으로 동작한다
- `docs/`, `ui/` 파일 편집은 괜찮다 (파이프라인이 건드리지 않음)

---

## AI 개발 파이프라인

### 자동 트리거

`docs/planning/` 또는 `docs/design/` 파일이 포함된 커밋이 발생하면 `.git/hooks/post-commit`이 `claude -p`를 background로 실행한다.

### 실행 흐름

```
[커밋: docs/planning/ 또는 docs/design/ 변경]
        |
        v [1] 설계 (순차)
  domain-model-agent   -> domain-model.md
  db-schema-agent      -> db-schema.md
  api-spec-agent       -> api-spec.md
        |
        v [2] 이슈 생성
  pm-agent             -> issues/{NNN}-{slug}/issue.md
        |
        v [3] 사전 체크
  .env.test 확인 (SERVICE_KEY 없으면 BE 테스트 스킵)
        |
        v [4] 구현 (n+1 병렬: BE 순차 1 + FE 병렬 n)
  ┌──────────────────────────┐  ┌──────────────────────┐
  | BE 체인 (1스레드, 순차)   |  | FE 병렬 (이슈당 1)   |
  |                          |  |                      |
  | 이슈 A:                  |  | 이슈 A:              |
  |  supabase-impl           |  |  frontend-impl       |
  |  -> be-reviewer          |  |  -> fe-reviewer      |
  |  -> backend-test         |  |                      |
  |        |                 |  | 이슈 B:              |
  | 이슈 B:                  |  |  frontend-impl       |
  |  supabase-impl           |  |  -> fe-reviewer      |
  |  -> be-reviewer          |  |                      |
  |  -> backend-test         |  | ...                  |
  └──────────────────────────┘  └──────────────────────┘
        |
        v [5] 완료 (macOS 알림)
```

- **BE 트랙은 이슈 간 순차**: `supabase db push`가 원격 DB를 직접 변경하므로 동시 실행 시 충돌
- **FE 트랙은 이슈 간 병렬**: 각 이슈가 서로 다른 화면/컴포넌트를 구현
- **E2E 테스트는 자동 파이프라인에 미포함**: 시뮬레이터/Expo 서버 상태에 의존하므로 수동 실행

### 코드 리뷰 루프

- be-reviewer, fe-reviewer 모두: initial review 1회 + fix/confirmation 최대 3사이클
- 3회 초과 미해결 시 로그에 기록하고 다음 단계로 넘어감

### 로그 확인

```bash
tail -f .claude/pipeline.log
```

### 파이프라인 재개

에러로 중단된 경우, 원인을 해결한 후:

```bash
bash .claude/resume-pipeline.sh
```

각 이슈의 `issue.md` 구현 현황 체크박스(`[x]`/`[ ]`)를 보고 완료된 단계는 스킵한다.

### E2E 테스트 (수동)

BE/FE 트랙이 모두 완료된 후 수동으로 실행한다:

```bash
# Maestro 설치 확인
maestro --version

# iOS 시뮬레이터 부팅 + Expo 서버 실행 상태에서
cd app && npx expo start    # 별도 터미널
maestro test tests/e2e/{issue-slug}/
```

또는 Claude Code에서 e2e-test-agent를 직접 호출:

```
이슈 {NNN} E2E 테스트 실행해줘
```

### 에이전트 목록

| 에이전트 | 역할 | 모델 |
|---|---|---|
| `domain-model-agent` | 도메인 모델 설계 | sonnet |
| `db-schema-agent` | DB 스키마 설계 | sonnet |
| `api-spec-agent` | API 명세 설계 | sonnet |
| `pm-agent` | 기획서 분석, 이슈 생성 | haiku |
| `supabase-impl-agent` | Supabase 구현 (SQL + RLS + Edge Fn + 마이그레이션 적용) | sonnet |
| `be-reviewer-agent` | 백엔드 코드 리뷰 | sonnet |
| `backend-test-agent` | Jest 통합 테스트 (실제 Supabase API 호출) | sonnet |
| `frontend-impl-agent` | React Native 화면/컴포넌트 구현 | sonnet |
| `fe-reviewer-agent` | 프론트엔드 코드 리뷰 | sonnet |
| `e2e-test-agent` | Maestro E2E 테스트 (수동 트리거) | sonnet |

에이전트 정의: `.claude/agents/*.md`

---

## 파이프라인 트러블슈팅

### 파이프라인이 트리거되지 않음

```bash
# hook 파일 확인
cat .git/hooks/post-commit

# 실행 권한 확인
ls -la .git/hooks/post-commit
# -rwxr-xr-x 이어야 함. 아니면:
chmod +x .git/hooks/post-commit

# claude CLI 경로 확인
which claude
```

### 파이프라인이 즉시 실패함

```bash
# 로그 확인
cat .claude/pipeline.log

# 프롬프트 파일 존재 확인
ls .claude/pipeline-prompt.md

# Supabase CLI 연결 확인
cd app && supabase status
```

### 백엔드 테스트가 스킵됨

`app/.env.test`의 `SUPABASE_SERVICE_KEY`가 비어있다. Supabase 대시보드 > Settings > API > service_role 키를 채운 후 `bash .claude/resume-pipeline.sh`로 재개.

### 마이그레이션 적용 실패

```bash
# 현재 DB 상태 확인
cd app && supabase db diff

# 수동 적용
cd app && supabase db push
```

충돌이 발생하면 `app/supabase/migrations/` 파일을 수정한 후 다시 push.

### 에이전트가 3사이클 후 escalate

리뷰 에이전트가 3회 fix 후에도 해결 못한 이슈가 있다. `issues/{NNN}-{slug}/05-be-review.md` 또는 `08-fe-review.md`에서 미해결 이슈를 확인하고 수동으로 수정한 뒤, `issue.md` 체크박스를 `[x]`로 변경하고 `bash .claude/resume-pipeline.sh`로 재개.

---

## 이슈 구조

각 이슈는 `issues/{NNN}-{이슈명}/` 폴더로 관리된다.

```
issues/003-main-dashboard-ui/
├── issue.md              # 이슈 요약 + docs 변경 내역 + 구현 현황 체크리스트
├── 04-supabase-impl.md   # Supabase 구현 산출물
├── 05-be-review.md       # 백엔드 리뷰 기록
├── 06-backend-test.md    # 백엔드 통합 테스트 결과
├── 07-fe-impl.md         # 프론트엔드 구현 산출물
└── 08-fe-review.md       # 프론트엔드 리뷰 기록
```

- `docs/`는 항상 최신 상태의 단일 진실 원천 (single source of truth)
- `issues/`는 이슈별 작업 로그 및 산출물
- 구현 현황 체크박스는 오케스트레이터(메인 Claude)가 관리

> 이슈 001, 002는 초기에 다른 파일명 체계를 사용했다. 이슈 003부터 위 구조를 따른다.

---

## 코드 컨벤션

- 언어: TypeScript (strict 모드)
- Supabase 클라이언트: `app/utils/supabase.ts`에서 singleton 인스턴스
- 도메인별 API 호출: `app/services/{도메인}.ts` (예: `auth.ts`, `dashboard.ts`)
- 화면 컴포넌트: `app/screens/{기능명}Screen.tsx`
- 공통 컴포넌트: `app/components/`
- 커스텀 훅: `app/hooks/use{기능명}.ts`
- 마이그레이션: `app/supabase/migrations/{timestamp}_{slug}.sql`
- `any` 사용 금지
