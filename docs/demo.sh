#!/usr/bin/env bash
# Scripted marcus demo — the source of docs/demo.gif.
#
# Regenerate the GIF:
#   asciinema rec -q --cols 96 --rows 30 -c "bash docs/demo.sh" docs/demo.cast
#   .tools/agg --font-size 15 --theme monokai --speed 1.1 docs/demo.cast docs/demo.gif
#
# (agg is a single static binary: https://github.com/asciinema/agg/releases)
# The sleeps are deliberate: they produce the typing and pacing of the recording.
set -u

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MARCUS=(node "$REPO/dist/cli.js")
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"

prompt() { printf '\033[1;32m$\033[0m '; }
pause() { sleep "${1:-1.1}"; }
type() {
    local line="$1" i
    for ((i = 0; i < ${#line}; i++)); do
        printf '%s' "${line:i:1}"
        sleep 0.028
    done
    printf '\n'
}

# -- 1. safe by default: untrusted HTML becomes inert text --------------------
cat > comment.md <<'EOF'
# User comment

<script>alert(document.cookie)</script>

Nice **post**, <b>though</b>
EOF

prompt; type "cat comment.md"; cat comment.md; pause 0.9
prompt; type "marcus comment.md"; "${MARCUS[@]}" comment.md; pause 2.0

# -- 2. it tells you the truth: warnings, and a CI gate that fails ------------
cat > draft.md <<'EOF'
# Release notes

- fast
- **still writing this
EOF

prompt; type "marcus --strict draft.md"; "${MARCUS[@]}" --strict draft.md; printf 'exit=%s\n' "$?"; pause 2.6

# -- 3. tables, task lists, and LLM-artifact repair ---------------------------
cat > plan.md <<'EOF'
# Plan

| step | status |
| --- |
| tables | shipped |

- [x] safe by default
- [ ] take over the world
EOF

prompt; type "marcus --fix-llm plan.md"; "${MARCUS[@]}" --fix-llm plan.md; pause 3.0
