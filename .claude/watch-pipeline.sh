#!/bin/bash
# 파이프라인 진행 상황을 실시간으로 보여주는 스크립트
# 사용법: bash .claude/watch-pipeline.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
LOG="$ROOT/logs/pipeline-status.log"

if [ ! -f "$LOG" ]; then
  echo "logs/pipeline-status.log가 없습니다."
  exit 1
fi

echo "📋 파이프라인 현황 (Ctrl+C로 종료)"
echo "────────────────────────────────"

# 기존 내용 출력
cat "$LOG"

# 실시간 추적
tail -f "$LOG" | while IFS= read -r line; do
  [ -n "$line" ] && echo "$line"
done
