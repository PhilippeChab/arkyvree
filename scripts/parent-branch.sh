#!/bin/bash
# Prints the parent branch of HEAD — used as the diff base for `bun test --changed`.
#
# Algorithm: pick the most recent branch whose tip is an ancestor of HEAD.
# This correctly handles:
#   - feature branch cut from main → parent is main
#   - feature branch cut from develop → parent is develop
#   - stacked branch cut from another feature (feature-on-feature) → parent is
#     the underlying feature
# Falls back to main/develop if nothing else matches (fresh branch, detached HEAD).
set -euo pipefail

CURRENT=$(git branch --show-current 2>/dev/null || true)

best_branch=""
best_ts=0

# Consider every local branch plus origin/main and origin/develop as candidates.
candidates=$(git for-each-ref --format='%(refname:short)' refs/heads refs/remotes/origin/main refs/remotes/origin/develop 2>/dev/null)

for ref in $candidates; do
  # Skip self.
  [ "$ref" = "$CURRENT" ] && continue
  # Tip must be an ancestor of HEAD (i.e. a branch HEAD was cut from or has merged).
  if git merge-base --is-ancestor "$ref" HEAD 2>/dev/null; then
    ts=$(git log -1 --format=%ct "$ref" 2>/dev/null || echo 0)
    if [ "$ts" -gt "$best_ts" ]; then
      best_ts=$ts
      best_branch="$ref"
    fi
  fi
done

# Last-resort fallback: no ancestor branch found (e.g., branch just created).
# Default to main to produce a sensible large diff rather than error.
echo "${best_branch:-main}"
