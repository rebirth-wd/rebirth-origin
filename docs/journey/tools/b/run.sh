#!/bin/bash
# retry wrapper for strip.mjs (an HMR reload can kill a capture)
for i in 1 2 3; do out=$(node /home/claude/rebirth-origin/docs/journey/tools/b/strip.mjs "$@" 2>&1); if echo "$out" | grep -q '"total"'; then echo "$out" | tail -2; exit 0; fi; sleep 4; done; echo "$out" | grep -v '^\s*at ' | tail -5
