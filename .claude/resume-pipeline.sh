#!/bin/bash
# 중단된 파이프라인을 재개한다.
# issues/ 폴더의 issue.md 체크박스를 보고 미완료 단계만 실행.
# 사용법: bash .claude/resume-pipeline.sh

ROOT=$(git rev-parse --show-toplevel)
LOG="$ROOT/.claude/pipeline.log"
CLAUDE=/Users/imsi/.volta/bin/claude

# 동시 실행 방지 락 (post-commit 훅과 공유)
LOCKDIR="$ROOT/.claude/pipeline.lock"
if ! mkdir "$LOCKDIR" 2>/dev/null; then
  LOCK_PID=$(cat "$LOCKDIR/pid" 2>/dev/null)
  if [ -n "$LOCK_PID" ] && kill -0 "$LOCK_PID" 2>/dev/null; then
    echo ""
    echo "⏭️  파이프라인이 이미 실행 중 (PID $LOCK_PID) — 재개를 중단합니다."
    echo ""
    exit 1
  fi
  # 죽은 프로세스가 남긴 stale 락 → 회수
  rm -rf "$LOCKDIR"
  mkdir "$LOCKDIR"
fi

echo ""
echo "🔄 파이프라인 재개 중..."
echo "   로그: .claude/pipeline.log"
echo ""

(
  echo $BASHPID > "$LOCKDIR/pid"
  "$CLAUDE" -p "
issues/ 폴더의 각 issue.md를 스캔해서 구현 현황 체크박스를 확인하고,
미완료([ ]) 단계만 골라서 파이프라인을 재개해줘.
완료([x]) 단계는 절대 다시 실행하지 마.

## 재개 순서

### 구현 단계 재개 — n+1 병렬 (BE 순차 1 + FE 병렬 n)

BE 트랙은 supabase db push로 원격 DB를 직접 변경하므로 이슈 간 순차 실행:
  이슈A: supabase-impl → be-reviewer → backend-test → 이슈B: ... → ...

FE 트랙은 이슈마다 별도 병렬 실행:
  이슈A: frontend-impl → fe-reviewer
  이슈B: frontend-impl → fe-reviewer

실행 방법:
1. BE 체인을 background 에이전트 1개로 실행 (내부에서 이슈 순서대로 순차 처리)
2. 각 이슈의 FE 트랙을 각각 별도 background 에이전트로 실행
3. 모든 background 에이전트 완료를 대기

issue.md 체크박스 업데이트는 에이전트가 직접 하지 말고 오케스트레이터가 담당.

## 중요 사항
- 에러로 중단되면 원인과 해결 방법을 로그 마지막에 기록하고 종료
- 코드 리뷰 루프: initial review 1회 + fix/confirmation 최대 3사이클
- 수동 테스트는 개발자가 직접 수행 (FE 합격 이슈는 09-manual-test.md 시나리오 작성까지만)
" \
    --dangerously-skip-permissions \
    < /dev/null >> "$LOG" 2>&1
  EXIT_CODE=$?
  rm -rf "$LOCKDIR"
  if [ $EXIT_CODE -eq 0 ]; then
    bash "$ROOT/.claude/notify.sh" "✅ 파이프라인 완료 (재개)"
  else
    bash "$ROOT/.claude/notify.sh" "❌ 파이프라인 에러로 중단됨 — .claude/pipeline.log 확인"
  fi
) &

PIPELINE_PID=$!
disown $PIPELINE_PID
echo "   PID: $PIPELINE_PID"
echo "   실시간 로그 확인: tail -f .claude/pipeline.log"
echo ""