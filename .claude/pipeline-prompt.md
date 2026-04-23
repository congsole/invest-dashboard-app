docs/planning/ 또는 docs/design/ 에 변경이 생겼어. 방금 커밋된 내용이야:
- 커밋 해시: {{COMMIT_HASH}}
- 커밋 메시지: {{COMMIT_MSG}}
- 변경된 파일: {{CHANGED}}

CLAUDE.md의 파이프라인 순서대로 전체 파이프라인을 자율적으로 실행해줘.
사용자에게 확인을 구하거나 중간에 멈추지 말고, 각 단계를 순서대로 완료해.

## 중요: 커밋 해시 고정

이 파이프라인 전체에서 기획서/디자인 변경 diff를 볼 때 반드시 아래 해시를 사용해야 한다:
- 변경 diff: `git diff {{COMMIT_HASH}}~1 {{COMMIT_HASH}} -- {파일}`
- 설계 에이전트가 수정한 미커밋 변경: `git diff HEAD -- {파일}`

`HEAD~1`이나 `HEAD`만 쓰면 사용자가 중간에 새 커밋을 했을 때 잘못된 diff를 볼 수 있다.

## 실행 순서

### [1] 설계 단계 — 순차 실행
다음 에이전트를 순서대로 실행해 (각 에이전트가 완료된 후 다음 에이전트 실행):
1. domain-model-agent: 변경된 기획서 파일을 직접 읽고 docs/architecture/domain-model.md 업데이트
2. db-schema-agent: domain-model.md를 읽고 docs/architecture/db-schema.md 업데이트
3. api-spec-agent: domain-model.md, db-schema.md를 읽고 docs/api/api-spec.md 업데이트

설계 에이전트 중 하나라도 실패하면 `git checkout -- docs/architecture/ docs/api/`로 변경 사항을 원복하고 에러를 로그에 기록한 뒤 종료한다.

### [1.5] 설계 결과 커밋
설계 3개 에이전트가 모두 완료되면 변경된 docs/ 파일을 커밋한다:
```bash
git add docs/architecture/ docs/api/
git commit -m "[Docs] 설계 업데이트 ({{COMMIT_HASH}} 기반)"
```

### [2] 이슈 생성
- pm-agent: 변경된 기획서/디자인과 완성된 docs/를 읽고 issues/ 폴더에 이슈 문서 생성
- 이슈가 없으면 여기서 종료

### [3] 구현 단계 — resume 지원
issues/ 폴더를 스캔하여 이번 커밋으로 생성된 이슈 목록을 확인한다.
각 이슈의 issue.md 구현 현황 체크박스를 보고 완료된 단계는 건너뛴다.
(이미 [x]로 체크된 항목은 스킵)

#### 병렬 실행 구조 (이슈 n개 → n+1 병렬)

BE 트랙은 `supabase db push`로 원격 DB를 직접 변경하므로 이슈 간 순차 실행한다.
FE 트랙은 이슈 간 독립적이므로 전부 병렬 실행한다.

```
[BE 체인 — 1개 스레드, 순차]
  이슈A: supabase-impl → be-reviewer → backend-test
  → 이슈B: supabase-impl → be-reviewer → backend-test
  → ...

[FE 병렬 — 이슈마다 1개 스레드]
  이슈A: frontend-impl → fe-reviewer
  이슈B: frontend-impl → fe-reviewer
  ...
```

실행 방법:
1. BE 체인을 background 에이전트 1개로 실행 (내부에서 이슈 순서대로 순차 처리)
2. 각 이슈의 FE 트랙을 각각 별도 background 에이전트로 실행
3. 모든 background 에이전트 완료를 대기

주의: issue.md 체크박스 업데이트는 각 에이전트가 직접 하지 말고, 에이전트 완료 후 오케스트레이터(메인 Claude)가 업데이트한다.

### [4] 완료
모든 이슈의 BE/FE 트랙이 모두 합격하면 파이프라인을 종료한다.
E2E 테스트(Maestro)는 자동 파이프라인에 포함하지 않는다 — 시뮬레이터/Expo 서버 상태에 의존하므로 사용자가 수동으로 실행한다.

## 중요 사항
- 코드 리뷰 루프: initial review 1회 + fix/confirmation 최대 3사이클
- 3회 초과 미해결 이슈는 로그에 기록하고 다음 단계로 넘어가
- 실행 결과는 각 이슈 폴더의 해당 md 파일에 기록
- 어떤 단계든 에러로 중단되면 즉시 원인과 해결 방법을 로그 마지막에 기록하고 종료

지금 바로 [1] 설계 단계부터 시작해줘.
