#!/bin/zsh

cd "$(dirname "$0")"

PORT=4173
URL="http://127.0.0.1:${PORT}"

if lsof -nP -iTCP:${PORT} -sTCP:LISTEN >/dev/null 2>&1; then
  open "$URL"
  exit 0
fi

nohup python3 -m http.server "$PORT" --bind 127.0.0.1 > /tmp/global-meeting-coach.log 2>&1 &
sleep 1
open "$URL"
