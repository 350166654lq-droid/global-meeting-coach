#!/bin/zsh

set -eu

APP_DIR="/Users/lawrencego/Desktop/Global-Meeting-Coach"
SESSION_FILE="$APP_DIR/data/daily-session.json"

cd "$APP_DIR"

python3 - <<'PY'
import json
from pathlib import Path

path = Path("data/daily-session.json")
session = json.loads(path.read_text())

assert isinstance(session.get("date"), str) and session["date"]
assert isinstance(session.get("day"), int)
assert isinstance(session.get("source"), dict)
assert len(session.get("coldListenQuestions", [])) == 5
assert len(session.get("secondPassTargets", [])) == 5
assert isinstance(session.get("microClip"), dict)
assert len(session.get("speaking", {}).get("followUps", [])) == 2
assert len(session["microClip"].get("transcript", "").split()) <= 25
PY

UNRELATED_STAGED="$(git diff --cached --name-only | awk '$0 != "data/daily-session.json"')"
if [ -n "$UNRELATED_STAGED" ]; then
  echo "Publish stopped: unrelated staged files exist:"
  echo "$UNRELATED_STAGED"
  exit 1
fi

git add -- data/daily-session.json

if git diff --cached --quiet -- data/daily-session.json; then
  exit 0
fi

SESSION_LABEL="$(python3 -c 'import json; d=json.load(open("data/daily-session.json")); print("Day %s training (%s)" % (d["day"], d["date"]))')"
git commit -m "Publish $SESSION_LABEL"
git push origin main

