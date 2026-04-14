---
name: 파이프라인 아키텍처 결정사항
description: 에이전트 파이프라인 구조 재설계 합의 내용 및 검증된 사실
type: project
---

## 확인된 사실

- **서브에이전트 → 서브서브에이전트 spawn은 신뢰성 없음**: pipeline-agent가 Agent 툴로 하위 에이전트를 spawn하려 했으나 실제 툴 콜 없이 텍스트만 출력함
- **메인 Claude → 서브에이전트 spawn은 정상 동작**: domain-model, db-schema, api-spec 에이전트를 메인에서 직접 호출했을 때 모두 성공

## 합의된 새 파이프라인 구조

```
커밋 (docs/planning/ 또는 docs/design/ 변경)
  ↓
설계 1번 실행 (순차)
  domain-model-agent → db-schema-agent → api-spec-agent
  ↓
이슈 생성 (PM 역할)
  - 설계 완료 후 issue.md 생성 (완성된 상태, placeholder 없음)
  - 이슈 분리 기준 적용 (강제 분리 규칙)
  ↓
BE/FE 전부 병렬 백그라운드
  003 BE | 003 FE | 004 BE | 004 FE | ...
```

**핵심 원칙**:
- 설계가 이슈 생성보다 먼저
- 설계는 1번만 실행 (docs/ 공유 파일 충돌 없음)
- 이슈 생성 후 모든 이슈의 BE/FE를 동시에 병렬 실행 가능
- 오케스트레이션은 메인 Claude가 직접 담당 (pipeline-agent 제거)

## 다음 작업

- pm-agent 재설계: 설계 실행 + 이슈 생성 + BE/FE 킥오프 통합
- pipeline-agent.md 삭제
- 단, pm-agent도 서브에이전트이므로 Agent 툴 사용 신뢰성 검증 필요

## 현재 이슈 003 진행 상태

- Phase 1 완료: domain-model.md, db-schema.md, api-spec.md 업데이트됨
- BE 구현 완료: migration SQL, DB Functions, RLS (supabase db push 미실행)
- FE 구현 중단: 디자인 파일 미첨부로 중단됨
- 디자인 파일 경로: docs/design/DESIGN.md, ui/dashboard/index.html
