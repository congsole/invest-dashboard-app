#!/bin/bash
# 파이프라인 진행 상황을 실시간으로 보여주는 스크립트
# 사용법: bash .claude/watch-pipeline.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="$SCRIPT_DIR/pipeline-status.log"

if [ ! -f "$LOG" ]; then
  echo "pipeline-status.log가 없습니다."
  exit 1
fi

echo "📋 파이프라인 현황 (Ctrl+C로 종료)"
echo "────────────────────────────────"

tail -f "$LOG" | while IFS= read -r line; do
  # agent spawn 감지
  if echo "$line" | grep -q '"subtype":"agent"'; then
    agent=$(echo "$line" | sed -n 's/.*"agent_type":"\([^"]*\)".*/\1/p')
    if [ -n "$agent" ]; then
      echo "[$(date +%H:%M:%S)] 🔄 에이전트 시작: $agent"
    fi
  fi
  # 최종 결과 감지
  if echo "$line" | grep -q '"type":"result"'; then
    status=$(echo "$line" | sed -n 's/.*"subtype":"\([^"]*\)".*/\1/p')
    if [ "$status" = "success" ]; then
      echo "[$(date +%H:%M:%S)] ✅ 파이프라인 완료"
    else
      echo "[$(date +%H:%M:%S)] ❌ 파이프라인 실패"
    fi
  fi
  # tool 사용 감지 (Edit/Write = 파일 변경)
  if echo "$line" | grep -q '"type":"tool_use"'; then
    tool=$(echo "$line" | sed -n 's/.*"name":"\([^"]*\)".*/\1/p')
    if [ "$tool" = "Edit" ] || [ "$tool" = "Write" ]; then
      file=$(echo "$line" | sed -n 's/.*"file_path":"\([^"]*\)".*/\1/p')
      if [ -n "$file" ]; then
        short=$(basename "$file")
        echo "[$(date +%H:%M:%S)] 📝 $short"
      fi
    fi
  fi
done
