import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * The Claude Code hook that refuses a `git push` to a branch whose PRs are all
 * merged or closed (`.claude/hooks/block-push-to-merged-pr.sh`). On 2026-10-29
 * #205 merged with one commit and seven more went to its branch; none reached
 * main.
 *
 * Run against a throwaway repo and a fake `gh`, so the answer never depends on
 * GitHub, the network, or this repo's real branches.
 */
const HOOK = resolve(__dirname, "../.claude/hooks/block-push-to-merged-pr.sh");

/** What the fake `gh pr list --head <branch>` answers, per branch. */
const PRS: Record<string, { number: number; state: string }[]> = {
  merged: [
    { number: 2, state: "CLOSED" },
    { number: 1, state: "MERGED" },
  ],
  reopened: [
    { number: 4, state: "OPEN" },
    { number: 3, state: "MERGED" },
  ],
  "no-pr": [],
};

let repo: string;
let bin: string;

/**
 * The environment without inherited `GIT_*` variables: run from inside a git
 * hook, `GIT_DIR` would point every command here at the real repo.
 */
const env = { ...process.env };
for (const key of Object.keys(env)) {
  if (key.startsWith("GIT_")) delete env[key];
}

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), "push-guard-repo-"));
  bin = mkdtempSync(join(tmpdir(), "push-guard-bin-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, env });
  git("init", "-q", "-b", "no-pr");
  git(
    ...["-c", "user.email=t@t", "-c", "user.name=t"],
    ...["-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null"],
    ...["commit", "-q", "--allow-empty", "-m", "x"],
  );
  git("branch", "merged");
  git("branch", "reopened");
  git("tag", "v1");

  // Prints the canned list for the branch after --head.
  writeFileSync(
    join(bin, "gh"),
    `#!/usr/bin/env bash
while [ $# -gt 0 ]; do [ "$1" = "--head" ] && head="$2"; shift; done
case "$head" in
${Object.entries(PRS)
  .map(([branch, prs]) => `  ${branch}) echo '${JSON.stringify(prs)}' ;;`)
  .join("\n")}
  *) echo '[]' ;;
esac
`,
  );
  chmodSync(join(bin, "gh"), 0o755);
});

afterAll(() => {
  rmSync(repo, { recursive: true, force: true });
  rmSync(bin, { recursive: true, force: true });
});

/**
 * Exit code of the hook for a Bash command, run on `onBranch`. Every test
 * checks out in the one shared repo, so these must not run concurrently.
 */
function hook(command: string, onBranch = "no-pr"): number | null {
  execFileSync("git", ["checkout", "-q", onBranch], { cwd: repo, env });
  return spawnSync("bash", [HOOK], {
    cwd: repo,
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
    env: { ...env, PATH: `${bin}:${process.env.PATH}` },
  }).status;
}

const REFUSED = 2;
const ALLOWED = 0;

test("should refuse a push to a branch whose PRs are all merged or closed", () => {
  expect(hook("git push -u origin merged")).toBe(REFUSED);
  expect(hook("cd /x && git push origin merged 2>&1 | tail -1")).toBe(REFUSED);
});

test("should refuse a bare push from a branch whose PRs are all merged or closed", () => {
  expect(hook("git push", "merged")).toBe(REFUSED);
  expect(hook("git push origin", "merged")).toBe(REFUSED);
});

test("should allow a push to a branch with an open PR, even beside merged ones", () => {
  expect(hook("git push origin reopened")).toBe(ALLOWED);
});

test("should allow a push to a branch with no PR yet", () => {
  expect(hook("git push -u origin no-pr")).toBe(ALLOWED);
  expect(hook("git push")).toBe(ALLOWED);
});

test("should allow deleting a merged branch's remote copy", () => {
  expect(hook("git push origin --delete merged")).toBe(ALLOWED);
  expect(hook("git push origin :merged")).toBe(ALLOWED);
});

test("should not hold a merged current branch against a push of something else", () => {
  expect(hook("git push origin no-pr", "merged")).toBe(ALLOWED);
  expect(hook("git push origin v1", "merged")).toBe(ALLOWED);
  expect(hook("git push origin --tags", "merged")).toBe(ALLOWED);
});

test("should ignore commands that are not a push", () => {
  expect(hook("git status", "merged")).toBe(ALLOWED);
});
