#!/usr/bin/env bash
# Demo script for PR Readiness Coach fixtures.
# Expected:
#   not-ready → NOT READY (exit 1)
#   ready     → READY (exit 0)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

run_json() {
  local path="$1"
  local out="$2"
  set +e
  npm run -s pr-ready -- --local --path "$path" --json >"$out" 2>/tmp/pr-ready-demo.err
  echo $?
  set -e
}

echo "== not-ready fixture =="
NR=$(run_json fixtures/demo-app/not-ready /tmp/pr-ready-not-ready.json)
VERDICT=$(node -e "console.log(JSON.parse(require('fs').readFileSync('/tmp/pr-ready-not-ready.json','utf8')).verdict)")
echo "verdict=$VERDICT exit=$NR"
test "$VERDICT" = "NOT READY"
test "$NR" -eq 1

echo "== ready fixture =="
R=$(run_json fixtures/demo-app/ready /tmp/pr-ready-ready.json)
VERDICT=$(node -e "console.log(JSON.parse(require('fs').readFileSync('/tmp/pr-ready-ready.json','utf8')).verdict)")
echo "verdict=$VERDICT exit=$R"
test "$VERDICT" = "READY"
test "$R" -eq 0

echo "demo.sh OK"
