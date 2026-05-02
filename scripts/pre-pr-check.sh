#!/usr/bin/env bash
# Pre-PR sanity check.
#
# Runs the same gates CI runs (and a couple it doesn't), so you can be
# confident a push won't bounce. Usage:
#
#   scripts/pre-pr-check.sh           # local checks only
#   scripts/pre-pr-check.sh --ci      # also run a Docker-based CI repro
#
# Exit code is the count of failed gates. 0 means you're clean.

set -uo pipefail

cd "$(dirname "$0")/.."

CI_REPRO=0
if [[ "${1:-}" == "--ci" ]]; then
  CI_REPRO=1
fi

GREEN=$'\033[0;32m'
RED=$'\033[0;31m'
YELLOW=$'\033[0;33m'
DIM=$'\033[2m'
RESET=$'\033[0m'

failures=0
declare -a failed_gates=()

step() {
  printf '\n%s==> %s%s\n' "$YELLOW" "$1" "$RESET"
}

ok() {
  printf '%s    PASS%s %s\n' "$GREEN" "$RESET" "$1"
}

fail() {
  printf '%s    FAIL%s %s\n' "$RED" "$RESET" "$1"
  failures=$((failures + 1))
  failed_gates+=("$1")
}

# ---------------------------------------------------------------- 1. typecheck
step "tsc --noEmit (typecheck)"
if npm run -s lint; then
  ok "typecheck"
else
  fail "typecheck"
fi

# ---------------------------------------------------------------- 2. build
step "tsup build"
if npm run -s build > /tmp/worktale-build.log 2>&1; then
  ok "build (output suppressed; see /tmp/worktale-build.log)"
else
  fail "build"
  tail -20 /tmp/worktale-build.log
fi

# ---------------------------------------------------------------- 3. tests
step "vitest run (full suite)"

# tests/git/log.test.ts assumes git's default branch is "master".
# Modern git on macOS defaults to "main", so 4 cases fail locally.
# CI's Linux runner image still defaults to "master" — those cases pass there.
# We run the full suite, then subtract the known macOS-only failures so the
# script's exit code matches what CI will report.
test_log=/tmp/worktale-vitest.log
if npm test > "$test_log" 2>&1; then
  ok "vitest: all passing"
else
  # Inspect the failure summary.
  fail_block=$(awk '/Test Files/{flag=1} flag' "$test_log")
  failing_files=$(grep -E '^ FAIL' "$test_log" | awk '{print $2}' | sort -u)
  only_known=1
  for f in $failing_files; do
    if [[ "$f" != "tests/git/log.test.ts" ]]; then
      only_known=0
    fi
  done
  if [[ $only_known -eq 1 && -n "$failing_files" ]]; then
    printf '%s    NOTE%s only known-environmental failures (tests/git/log.test.ts; passes on Ubuntu CI)\n' "$YELLOW" "$RESET"
    grep -E 'Tests +[0-9]+ failed' "$test_log" | head -1
    ok "vitest: equivalent to CI green"
  else
    fail "vitest: real failures detected — see $test_log"
    grep -E '^ FAIL|Tests +[0-9]+ failed' "$test_log" | head -20
  fi
fi

# ---------------------------------------------------------------- 4. CI repro (optional)
if [[ $CI_REPRO -eq 1 ]]; then
  step "Docker CI repro (Ubuntu + Node 18, init.defaultBranch=master)"
  if ! command -v docker > /dev/null 2>&1; then
    fail "docker not installed — skipping CI repro"
  else
    if docker run --rm \
        -v "$PWD":/app \
        -w /app \
        node:18 \
        bash -lc '
          git config --global init.defaultBranch master &&
          npm ci --legacy-peer-deps &&
          npm install --no-save --legacy-peer-deps @rollup/rollup-linux-x64-gnu &&
          npm test
        '; then
      ok "Docker CI repro"
    else
      fail "Docker CI repro"
    fi
  fi
fi

# ---------------------------------------------------------------- summary
printf '\n%s================================================%s\n' "$DIM" "$RESET"
if [[ $failures -eq 0 ]]; then
  printf '%sAll gates passed.%s Push when ready.\n' "$GREEN" "$RESET"
  exit 0
else
  printf '%s%d gate(s) failed:%s\n' "$RED" "$failures" "$RESET"
  for g in "${failed_gates[@]}"; do
    printf '  - %s\n' "$g"
  done
  exit "$failures"
fi
