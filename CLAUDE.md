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
├── docs/
│   ├── planning/        # 기획서 (변경 시 이슈 생성 트리거)
│   ├── design/
│   │   └── DESIGN.md    # UI 설계 설명 (변경 시 이슈 생성 트리거)
│   ├── architecture/
│   │   ├── domain-model.md   # 공통 도메인 모델 (이슈마다 누적 업데이트)
│   │   └── db-schema.md      # 공통 DB 스키마 (이슈마다 누적 업데이트)
│   ├── api/
│   │   └── api-spec.md       # 공통 API 명세 (이슈마다 누적 업데이트)
│   ├── testing/
│   │   └── manual-test-scenarios.md  # 전체 기능 수동 테스트 회귀 시나리오
│   └── DEPLOYMENT.md
├── ui/                  # UI 레퍼런스 파일
│   └── {기능명}/
│       └── code.html
├── issues/
│   └── {NNN}-{issue-title}/
│       ├── issue.md          # 이슈 정의 + docs 변경 내역
│       ├── 04-supabase-impl.md   # BE 트랙: Supabase 구현 내역
│       ├── 05-be-review.md       # BE 트랙: 백엔드 코드 리뷰
│       ├── 06-backend-test.md    # BE 트랙: Jest 통합 테스트 결과
│       ├── 07-fe-impl.md         # FE 트랙: 프론트엔드 구현 내역
│       ├── 08-fe-review.md       # FE 트랙: 프론트엔드 코드 리뷰
│       └── 09-manual-test.md     # 수동 테스트 시나리오 (개발자가 직접 수행)
├── scripts/             # Python 배치 (종목 마스터 시드/동기화: seed_stocks.py, sync_stocks.py)
├── .github/workflows/   # keep-supabase-alive (무료 티어 일시정지 방지 ping)
├── .claude/
│   ├── agents/          # 파이프라인 서브에이전트 정의
│   ├── hooks/           # git 훅 (core.hooksPath로 연결)
│   └── *.sh, *.md       # 파이프라인 스크립트/프롬프트 (자동화 섹션 참조)
└── app/                 # React Native (Expo) 앱 — 실제 코드
    ├── services/        # Supabase API 호출 (도메인별, 예: auth.ts, memo.ts)
    ├── hooks/           # 커스텀 훅
    ├── screens/         # 화면 컴포넌트
    ├── components/      # 공통 컴포넌트
    ├── types/           # 공통 타입
    ├── utils/           # supabase 클라이언트 등 공용 유틸
    ├── supabase/
    │   ├── config.toml  # 로컬 Supabase 스택 설정 (supabase start)
    │   ├── seed.sql     # 로컬 시드 (종목 마스터 샘플 — db reset 시 자동 적용)
    │   └── migrations/  # DB 마이그레이션 SQL
    └── tests/
        └── integration/ # Jest 백엔드 통합 테스트 (로컬 Supabase 대상)
```

## 에이전트 워크플로우

### 오케스트레이션 원칙

- **메인 Claude가 직접 오케스트레이션한다** — 별도 pipeline-agent 없음
- 서브에이전트는 하위 에이전트를 spawn할 수 없으므로, 모든 에이전트 호출은 메인 Claude에서만 한다
- 현재는 **수동 트리거** (사용자 요청 → 메인 Claude 실행)
- 자동화 계획은 하단 참조

### 파이프라인

```
[트리거: docs/planning/ 또는 docs/design/ 변경 커밋]
        │
        ▼
  메인 Claude (오케스트레이터)
        │
        ▼ [1] 설계 — 순차 실행 (기획서/디자인 파일 직접 읽음)
  domain-model-agent  →  docs/architecture/domain-model.md 업데이트
        │
  db-schema-agent     →  docs/architecture/db-schema.md 업데이트
        │
  api-spec-agent      →  docs/api/api-spec.md 업데이트
        │
        ▼ [1.5] 설계 결과 커밋
  git add docs/architecture/ docs/api/
  git commit -m "[Docs] 설계 업데이트 ({커밋해시} 기반)"
        │
        ▼ [2] 이슈 생성 (완성된 설계 기반으로 판단, docs 변경 내역 issue.md에 기록)
    pm-agent
    └─ issues/{NNN}-{title}/issue.md 생성 (이슈 번호 auto-increment)
        │
        ▼ [3] 구현 — n+1 병렬 (BE 순차 1 + FE 병렬 n), resume 지원
  ┌──────────────────────────────┐  ┌─────────────────────┐
  │ BE 체인 (1스레드, 순차)          │  │ FE 병렬 (이슈마다)     │
  │                              │  │                     │
  │ 이슈 A:                       │  │ 이슈 A:              │
  │  supabase-impl-agent         │  │  frontend-impl      │
  │  → be-reviewer-agent         │  │  → fe-reviewer      │
  │  → backend-test-agent        │  │                     │
  │        ↓                     │  │ 이슈 B:              │
  │ 이슈 B:                       │  │  frontend-impl      │
  │  supabase-impl-agent         │  │  → fe-reviewer      │
  │  → be-reviewer-agent         │  │                     │
  │  → backend-test-agent        │  │ ...                 │
  │  ...                         │  │                     │
  └──────────────────────────────┘  └─────────────────────┘
        │ 모든 트랙 합격 후
        │
        ▼ [4] 수동 테스트 시나리오 작성 (오케스트레이터 직접) → 파이프라인 종료
  issues/{NNN}/09-manual-test.md 생성
  + docs/testing/manual-test-scenarios.md 갱신
        │
        ▼ [5] 수동 테스트 (개발자 직접 수행 — 자동화 없음)
  09-manual-test.md 시나리오를 따라 iOS 시뮬레이터에서 검증
  완료 시 issue.md의 "수동 테스트" 체크박스를 직접 체크
```

#### 커밋 해시 고정 규칙
파이프라인 전체에서 기획서/디자인 변경 diff를 볼 때 트리거 커밋 해시를 고정 사용한다:
- 변경 diff: `git diff {COMMIT_HASH}~1 {COMMIT_HASH} -- {파일}`
- 설계 에이전트가 수정한 미커밋 변경: `git diff HEAD -- {파일}`
- `HEAD~1`이나 `HEAD`만 쓰면 사용자가 중간에 새 커밋을 했을 때 잘못된 diff를 볼 수 있다

#### Resume 지원
issue.md의 구현 현황 체크박스(`[x]` / `[ ]`)를 보고 완료된 단계는 건너뛴다.
중단된 파이프라인은 `.claude/resume-pipeline.sh`로 재개할 수 있다.

#### 수동 테스트
E2E 자동화(Maestro)는 폐기했다. 대신:
- FE 트랙 합격 후 오케스트레이터가 `issues/{NNN}/09-manual-test.md`에 테스트 시나리오를 작성한다
- 시나리오는 각각 **사전 조건 / 단계 / 기대 결과**로 구성하고, 해당 이슈의 변경 범위 + 인접 기능 회귀를 포함한다
- 전체 기능 회귀 시나리오는 `docs/testing/manual-test-scenarios.md`에 누적 관리한다 (FE 변경 이슈마다 갱신)
- 개발자가 시뮬레이터에서 직접 수행하고, 완료 시 issue.md의 `- [ ] 수동 테스트`를 체크한다

### 자동화 (검증 완료 — 적용됨)

`claude -p`로 실행한 headless 인스턴스는 메인 Claude와 동일하게 Agent 툴로 서브에이전트를 spawn할 수 있음을 확인했다. (Agent spawn 제한은 에이전트가 spawn한 하위 에이전트에만 적용됨)

#### 트리거
`.claude/hooks/post-commit`에 구현. `docs/planning/` 또는 `docs/design/` 변경이 포함된 커밋에만 반응한다.

훅은 git이 추적하는 `.claude/hooks/`에 두고 `core.hooksPath`로 연결한다. 새 머신에서는 클론 후 한 번만 실행:
```bash
git config core.hooksPath .claude/hooks
```

동시 실행 방지: `.claude/pipeline.lock/` 디렉토리 락. 파이프라인 실행 중 새 docs 커밋이 들어오면 건너뛰고 알림만 보낸다 (완료 후 `resume-pipeline.sh`로 재개). 동시 실행 시 이슈 번호 채번 레이스, status log 덮어쓰기, `supabase db push` 충돌이 발생하기 때문. 프로세스가 죽어 남은 stale 락은 PID 검사로 자동 회수된다.

```
git commit (docs/planning/ 또는 docs/design/ 변경)
  → post-commit hook
  → 알림 전송 (Telegram + macOS)
  → 실시간 현황 터미널 자동 열기
  → claude -p (프롬프트 템플릿에서 변수 치환, background PID disown)
      → [1] 설계 → [1.5] 설계 커밋 → [2] PM → [3] BE/FE 병렬
      → 완료/실패 시 알림 전송
```

#### 관련 파일
| 파일 | 역할 |
|------|------|
| `.claude/hooks/post-commit` | 트리거 — 변경 감지 및 파이프라인 실행 (`core.hooksPath`로 연결) |
| `.claude/hooks/pre-commit` | 파이프라인 사전 체크 (claude CLI, supabase link, .env.test 확인) |
| `.claude/pipeline-prompt.md` | 프롬프트 템플릿 (`{{COMMIT_HASH}}`, `{{COMMIT_MSG}}`, `{{CHANGED}}` 변수) |
| `.claude/notify.sh` | Telegram + macOS 알림 전송 (`.env.local`에서 `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` 로드) |
| `.claude/watch-pipeline.sh` | 실시간 현황 터미널 (`tail -f logs/pipeline-status.log`) |
| `.claude/resume-pipeline.sh` | 중단된 파이프라인 재개 (issue.md 체크박스 기반) |
| `.claude/pipeline.lock/` | 동시 실행 방지 락 (실행 중인 파이프라인 PID 보관, 종료 시 자동 삭제) |
| `.claude/pipeline.log` | 전체 로그 (`--output-format stream-json --verbose`) |
| `logs/pipeline-status.log` | 한 줄 요약 현황 로그 (오케스트레이터가 직접 기록) |

#### 현황 로그 형식
`logs/pipeline-status.log`에 각 에이전트 시작/완료 시점에 한 줄씩 append:
```bash
echo "[$(date +%H:%M:%S)] {메시지}" >> logs/pipeline-status.log
```
- 파이프라인: `── 파이프라인 시작 ({해시7자리})` / `── 파이프라인 완료 ✅` / `── 파이프라인 실패 ❌`
- 설계: `[설계] {agent-name} 시작` / `[설계] {agent-name} ✅`
- PM: `[PM] 이슈 생성 시작` / `[PM] 이슈 {N}개 생성: {번호들}` / `[PM] 이슈 없음 — 종료`
- 구현: `[{이슈번호}/{BE|FE}] {agent-name} 시작` / `✅` / `❌ ({사유})` / `❌ ({N}/3) 재수정 중`

서브에이전트에게 이 로그를 쓰라고 지시하지 않는다 — 오케스트레이터가 에이전트 호출 전후에 직접 쓴다.

검증 스크립트: `.claude/test-headless-agent-spawn.sh`

### 코드 리뷰 루프 규칙
- initial review: 1회
- fix → confirmation 사이클: 최대 3회
- 3회 초과 시 미해결 이슈와 리뷰 로그를 사용자에게 escalate

### docs vs issues 역할 분리
- `docs/` — 항상 최신 상태의 단일 진실 원천 (domain model, API spec 등)
- `issues/` — 이슈별 작업 로그, 구현 산출물, 리뷰 기록
- 이슈 작업 시 docs 파일을 직접 수정하고, issue.md에 변경 내역을 기록

### issue.md 형식

각 섹션은 단계별 에이전트가 순차적으로 채운다.

```markdown
# [{NNN}] {이슈 제목}

<!-- PM-agent 작성 -->
## 개요
커밋 메시지와 변경된 기획서/디자인 파일을 바탕으로 이슈 요약

## 참조 문서
- 커밋: {hash} — {커밋 메시지}
- 기획서: docs/planning/{file}
- 디자인: docs/design/{file} (해당 시)

<!-- domain-model-agent 작성 후 추가 -->
## docs 변경 내역

### domain-model.md
- [추가/수정/삭제] ...

<!-- db-schema-agent 작성 후 추가 -->
### db-schema.md
- [추가/수정/삭제] ...

<!-- api-spec-agent 작성 후 추가 -->
### api-spec.md
- [추가/수정/삭제] ...

<!-- 구현 단계에서 업데이트 -->
## 구현 현황
- [ ] Supabase 구현
- [ ] 백엔드 테스트
- [ ] 프론트엔드 구현
- [ ] 수동 테스트
```

## 개발 규칙
- 백엔드 구현은 Supabase 단일 사용 (SQL 쿼리, RLS 정책, Edge Function)
- 별도 서버 추가 시 `server/` 디렉토리 생성
- 이슈 번호는 `issues/` 폴더 스캔 후 auto-increment

### 백엔드 테스트는 로컬 Supabase 대상 (운영 DB 격리)
- Jest 통합 테스트는 **로컬 Supabase**(Docker, `supabase start`)를 대상으로 실행한다 — `app/.env.test`가 `http://127.0.0.1:54321`과 CLI 공개 데모 키를 가리킨다
- 흐름: 마이그레이션 작성 → `supabase db reset`(로컬 전체 적용 + seed) → **전체 스위트** `npm run test:integration` → 합격 시에만 `supabase db push`(원격 반영, 파이프라인 유일의 원격 쓰기 지점)
- `db reset`이 매번 마이그레이션 전체를 빈 DB에 적용하므로 타임스탬프 충돌·드리프트가 즉시 드러난다
- 테스트 합격 판정은 이슈 테스트 파일 단독이 아니라 **반드시 전체 스위트**로 한다 (이슈 025의 `name_en` 회귀가 전체 미실행으로 운영까지 나간 전례)
- 원격 스키마를 SQL Editor 등으로 직접 수정하지 않는다 — 모든 변경은 마이그레이션 파일로 (드리프트 발생 시 `supabase db diff --linked`로 동기화)

### 프론트엔드 렌더링 최적화 원칙

#### 1. 로딩 상태는 영향 범위를 최소화한다
- 전체 화면을 대체하는 로딩 스피너(`if (loading) return <Spinner/>`)는 **초기 마운트 시에만** 허용
- 재조회(refetch) 또는 필터 변경에 의한 로딩은 해당 섹션에만 반영하고, 기존 콘텐츠는 유지한다
- 로딩 상태는 목적에 따라 분리한다: `initialLoading` / `refreshing` / `sectionLoading` 등

#### 2. UI 필터는 가능한 클라이언트 사이드로 처리한다
- 탭/필터 변경 시 이미 패칭된 데이터가 있으면 클라이언트에서 걸러낸다
- 서버 재호출이 필요한 경우에도 기존 콘텐츠를 숨기지 않고 로딩 인디케이터를 오버레이한다
- 마스터 데이터(`allItems`)와 파생 데이터(`filteredItems`)를 명확히 구분하고, 파생 데이터는 `useMemo`로 계산한다

#### 3. 불필요한 리렌더링을 방지한다
- 부모 상태 변경이 자식에 전파되지 않도록 `React.memo`를 적극 활용한다
- `useCallback` / `useMemo`로 prop 참조를 안정화한다 (인라인 함수/객체는 리렌더링마다 새 참조를 생성한다)
- 훅의 dependency array가 의도치 않게 변경되지 않는지 확인한다 — 필터 상태를 훅 파라미터로 내리면 필터 변경마다 전체 재조회가 트리거되는 실수가 흔하다

#### 4. 상태는 영향 범위를 좁게 유지한다
- 탭/필터처럼 특정 섹션에만 영향을 주는 상태를 최상위 화면 컴포넌트에 두지 않는다
- 연관된 상태끼리 묶어 별도 컴포넌트나 훅으로 분리하여, 해당 상태 변경이 무관한 섹션의 리렌더링을 유발하지 않도록 한다
