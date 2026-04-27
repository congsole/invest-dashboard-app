#!/bin/bash
# 텔레그램 + macOS 알림 전송
# 사용법: bash .claude/notify.sh "메시지 내용"
#
# 환경변수 TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID가 설정되어 있으면 텔레그램으로 전송.
# macOS에서는 osascript 알림도 함께 전송.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$ROOT/.env.local"

# .env.local에서 환경변수 로드
if [ -f "$ENV_FILE" ]; then
  export $(grep -E '^TELEGRAM_' "$ENV_FILE" | xargs)
fi

MESSAGE="$1"

# 텔레그램 전송
if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_CHAT_ID" ]; then
  curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -d chat_id="$TELEGRAM_CHAT_ID" \
    -d text="$MESSAGE" \
    -d parse_mode="Markdown" \
    > /dev/null 2>&1
fi

# macOS 알림 (fallback)
if command -v osascript &> /dev/null; then
  osascript -e "display notification \"$MESSAGE\" with title \"invest-dashboard\"" 2>/dev/null
fi
