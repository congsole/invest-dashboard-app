#!/bin/bash
# headless claude -p 인스턴스에서 Agent 툴로 서브에이전트 spawn이 가능한지 검증
# 사용법: bash .claude/test-headless-agent-spawn.sh

CLAUDE=/Users/imsi/.volta/bin/claude
ROOT=$(git rev-parse --show-toplevel)

echo "=== headless Agent spawn 검증 테스트 ==="
echo "claude -p로 간단한 에이전트 spawn을 시도합니다..."
echo ""

"$CLAUDE" -p '
Agent 툴을 사용해서 general-purpose 서브에이전트를 spawn해줘.
서브에이전트에게 다음 작업을 시켜줘:
  현재 디렉토리에서 README.md 또는 CLAUDE.md 파일이 있는지 확인하고 있으면 파일명을 반환해줘.

서브에이전트가 반환한 결과를 그대로 출력해줘.
마지막 줄에 반드시 "SPAWN_TEST: SUCCESS" 또는 "SPAWN_TEST: FAILED" 중 하나를 출력해줘.
' \
  --dangerously-skip-permissions \
  < /dev/null

echo ""
echo "=== 테스트 완료 ==="
echo "위 출력에 'SPAWN_TEST: SUCCESS'가 있으면 headless Agent spawn 동작 확인됨"