#!/usr/bin/env bash
# PreToolUse hook (Bash): refuse a `git push` to a branch whose pull requests
# are all merged or closed.
#
# Why: the developer merges between turns without saying so. On 2026-10-29
# #205 merged with one commit, seven more were pushed to its branch, and none
# of them reached main (small-commit-flow, step 8). A push to such a branch
# reaches nobody.
#
# A branch with an open PR, or with no PR yet, is let through. So is anything
# this script cannot check (no gh, no network): it says so on stderr rather
# than blocking work it knows nothing about.
#
# Exit 2 blocks the tool call; its stderr is shown to Claude.

set -u
set -f # words of the command are split below; never expand them as globs

if ! command -v jq >/dev/null 2>&1; then
  echo "block-push-to-merged-pr: jq not found, push not checked" >&2
  exit 0
fi

input=$(cat)
command=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')

case "$command" in
  *"git push"*) ;;
  *) exit 0 ;;
esac

# Deleting a merged branch's remote copy is the normal cleanup, not a push of
# work: `git push origin --delete x`, `-d x`, `:x`.
case " $command " in
  *" --delete "*|*" -d "*|*" :"*) exit 0 ;;
esac

if ! command -v gh >/dev/null 2>&1; then
  echo "block-push-to-merged-pr: gh not found, push not checked" >&2
  exit 0
fi

# The branches this push sends: any word in the command that names a local
# branch (`git push -u origin some-branch`), or the current branch when none
# does (a bare `git push`). Naming another branch or a tag leaves the current
# one out, so a merged current branch doesn't block an unrelated push.
branches=""
named_other=no
for word in $command; do
  [ "$word" = "--tags" ] && named_other=yes
  name=${word#*:}           # a refspec `src:dst` pushes to dst
  name=${name#refs/heads/}
  [ -z "$name" ] && continue
  if git show-ref --verify --quiet "refs/heads/$name"; then
    branches=$(printf '%s\n%s' "$branches" "$name")
  elif git show-ref --verify --quiet "refs/tags/${name#refs/tags/}"; then
    named_other=yes
  fi
done
if [ -z "$branches" ] && [ "$named_other" = no ]; then
  branches=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
fi

for branch in $(printf '%s\n' "$branches" | sort -u); do
  [ "$branch" = "HEAD" ] && continue
  prs=$(gh pr list --head "$branch" --state all --json number,state 2>/dev/null) || {
    echo "block-push-to-merged-pr: could not reach GitHub, push to $branch not checked" >&2
    continue
  }
  total=$(printf '%s' "$prs" | jq 'length')
  open=$(printf '%s' "$prs" | jq '[.[] | select(.state == "OPEN")] | length')
  if [ "$total" -gt 0 ] && [ "$open" -eq 0 ]; then
    list=$(printf '%s' "$prs" | jq -r '[.[] | "#\(.number) \(.state)"] | join(", ")')
    echo "Refused: every PR on branch '$branch' is merged or closed ($list), so this push would reach nobody. Branch again from main and open a new PR (small-commit-flow, step 8)." >&2
    exit 2
  fi
done

exit 0
