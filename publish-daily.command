#!/bin/zsh

set -eu

APP_DIR="/Users/lawrencego/Desktop/Global-Meeting-Coach"
INDEX_FILE="data/session-index.json"

cd "$APP_DIR"

SESSION_DAY="$(python3 -c 'import json; print(int(json.load(open("data/daily-session.json"))["day"]))')"
SESSION_ARCHIVE="data/sessions/day-$(printf '%02d' "$SESSION_DAY").json"

python3 - <<'PY'
import json
from pathlib import Path

path = Path("data/daily-session.json")
session = json.loads(path.read_text())
archive_path = Path(f"data/sessions/day-{session['day']:02d}.json")
index_path = Path("data/session-index.json")
archive = json.loads(archive_path.read_text())
index = json.loads(index_path.read_text())

assert isinstance(session.get("date"), str) and session["date"]
assert isinstance(session.get("day"), int)
assert isinstance(session.get("source"), dict)
assert len(session.get("coldListenQuestions", [])) == 5
assert len(session.get("secondPassTargets", [])) == 5
assert isinstance(session.get("microClip"), dict)
assert len(session.get("speaking", {}).get("followUps", [])) == 2
assert len(session["microClip"].get("transcript", "").split()) <= 25
assert archive == session
assert index.get("latest", {}).get("day") == session["day"]
assert index.get("latest", {}).get("date") == session["date"]
assert index.get("latest", {}).get("path") == str(archive_path)
matches = [item for item in index.get("sessions", []) if item.get("day") == session["day"]]
assert len(matches) == 1
assert matches[0].get("date") == session["date"]
assert matches[0].get("path") == str(archive_path)
PY

if [ "${1:-}" = "--validate-only" ]; then
  echo "Validated Day $SESSION_DAY archive and session index."
  exit 0
fi

UNRELATED_STAGED="$(git diff --cached --name-only | awk -v archive="$SESSION_ARCHIVE" -v index="$INDEX_FILE" '$0 != "data/daily-session.json" && $0 != archive && $0 != index')"
if [ -n "$UNRELATED_STAGED" ]; then
  echo "Publish stopped: unrelated staged files exist:"
  echo "$UNRELATED_STAGED"
  exit 1
fi

git add -- data/daily-session.json "$SESSION_ARCHIVE" "$INDEX_FILE"

if git diff --cached --quiet -- data/daily-session.json "$SESSION_ARCHIVE" "$INDEX_FILE"; then
  exit 0
fi

SESSION_LABEL="$(python3 -c 'import json; d=json.load(open("data/daily-session.json")); print("Day %s training (%s)" % (d["day"], d["date"]))')"
git commit -m "Publish $SESSION_LABEL"
git push origin main
