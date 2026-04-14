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
        ▼ [1] 이슈 생성
    pm-agent
    └─ issues/{NNN}-{title}/issue.md 생성 (이슈 번호 auto-increment)
        │
        ▼ [2] 설계 — 순차 실행 (공유 docs/ 파일, 1회만)
  domain-model-agent  →  docs/architecture/domain-model.md 업데이트
        │
  db-schema-agent     →  docs/architecture/db-schema.md 업데이트
        │
  api-spec-agent      →  docs/api/api-spec.md 업데이트
        │
        ▼ [3] 구현 — 모든 이슈의 BE/FE를 동시에 병렬 background 실행
  ┌─────────────────────────────────────────────────────────┐
  │ 이슈 A - BE 트랙        │ 이슈 A - FE 트랙             │
  │ supabase-impl-agent     │ frontend-impl-agent           │
  │ → be-reviewer-agent     │ → fe-reviewer-agent           │
  │ → backend-test-agent    │                               │
  ├─────────────────────────┼───────────────────────────────┤
  │ 이슈 B - BE 트랙        │ 이슈 B - FE 트랙             │
  │ ...                     │ ...                           │
  └─────────────────────────────────────────────────────────┘
        │ 모든 트랙 합격 후
        ▼ [4] E2E 테스트
  e2e-test-agent
  (Maestro → iOS 시뮬레이터 실제 앱 테스트)
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
      → [4] e2e-test-agent
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
