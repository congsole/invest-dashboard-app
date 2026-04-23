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
│   └── api/
│       └── api-spec.md       # 공통 API 명세 (이슈마다 누적 업데이트)
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
│       └── 09-e2e-test.md        # Maestro E2E 테스트 결과
└── app/                 # React Native (Expo) 앱 — 실제 코드
    ├── services/        # Supabase API 호출 (도메인별, 예: auth.ts, portfolio.ts)
    ├── hooks/           # 커스텀 훅
    ├── screens/         # 화면 컴포넌트
    ├── components/      # 공통 컴포넌트
    ├── types/           # 공통 타입
    ├── supabase/
    │   └── migrations/  # DB 마이그레이션 SQL
    └── tests/
        └── integration/ # Jest 백엔드 통합 테스트
tests/
└── e2e/                 # Maestro E2E 플로우 파일
    └── {issue-slug}/
```

## 에이전트 워크플로우

### 오케스트레이션 원칙

- **메인 Claude가 직접 오케스트레이션한다** — 별도 pipeline-agent 없음
- 서브에이전트는 하위 에이전트를 spawn할 수 없으므로, 모든 에이전트 호출은 메인 Claude에서만 한다
- 현재는 **수동 트리거** (사용자 요청 → 메인 Claude 실행)
- 자동화 계획은 하단 참조

### 파이프라인

```
[사용자: "기획서 변경됐어, 파이프라인 실행해줘"]
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
        ▼ [2] 이슈 생성 (완성된 설계 기반으로 판단, docs 변경 내역 issue.md에 기록)
    pm-agent
    └─ issues/{NNN}-{title}/issue.md 생성 (이슈 번호 auto-increment)
        │
        ▼ [3] 구현 — n+1 병렬 (BE 순차 1 + FE 병렬 n)
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
        │ 모든 트랙 합격 후 파이프라인 종료
        │
        ▼ [4] E2E 테스트 (수동 — 자동 파이프라인에 미포함)
  e2e-test-agent
  (Maestro → iOS 시뮬레이터, 사용자가 직접 트리거)
```

### 자동화 (검증 완료 — 적용됨)

`claude -p`로 실행한 headless 인스턴스는 메인 Claude와 동일하게 Agent 툴로 서브에이전트를 spawn할 수 있음을 확인했다. (Agent spawn 제한은 에이전트가 spawn한 하위 에이전트에만 적용됨)

`.git/hooks/post-commit`에 구현되어 있으며, 로그는 `.claude/pipeline.log`에 기록된다.

```
git commit (docs/planning/ 또는 docs/design/ 변경)
  → post-commit hook
  → claude -p "..." (background, PID disown)
      → [1] domain-model-agent → db-schema-agent → api-spec-agent (순차)
      → [2] pm-agent (이슈 생성)
      → [3] 각 이슈 BE/FE 병렬 background
      → 완료 (E2E는 수동 트리거)
```

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
- [ ] E2E 테스트
```

## 개발 규칙
- 백엔드 구현은 Supabase 단일 사용 (SQL 쿼리, RLS 정책, Edge Function)
- 별도 서버 추가 시 `server/` 디렉토리 생성
- 이슈 번호는 `issues/` 폴더 스캔 후 auto-increment

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
