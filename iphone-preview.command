#!/bin/zsh

set -eu

cd "$(dirname "$0")"

PORT=4174
IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"

if [ -z "$IP" ]; then
  echo "未找到局域网 IP。请确认 Mac 已连接 Wi-Fi。"
  exit 1
fi

if ! lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  nohup python3 -m http.server "$PORT" --bind 0.0.0.0 > /tmp/global-meeting-coach.log 2>&1 &
  sleep 1
fi

echo "iPhone 在同一 Wi-Fi 下打开："
echo "http://${IP}:${PORT}"
echo ""
echo "此地址适合预览阅读和播放。iPhone 麦克风录音与可靠 PWA 安装需要 HTTPS 部署。"
