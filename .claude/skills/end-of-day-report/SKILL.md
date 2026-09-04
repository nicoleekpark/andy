---
name: end-of-day-report
description: Use at the end of a working day in this repo, or whenever asked for a day report / 하루 리포트 / end-of-day report. Writes dev-reports/day-NN.dev.md so the next day's session can pick the work up cold.
---

# End of Day Report

Write the report **yourself**, in this session, while the day is still in your context. Do not delegate it to a subagent: a fresh agent would have to reconstruct the day from `git log` and the commit log, and the parts worth writing down — the assumption that turned out wrong, the option that was rejected and why, the thing a reviewer caught — are exactly the parts that aren't in either.

Gathering mechanical facts first is fine (`git log --reverse --since=`, the file tree, test counts, `git show --stat`), but the synthesis is yours.

## The test this has to pass

> Someone opens a new session tomorrow with none of today's context. After reading only this report, can they continue the work as if they had been here?

If a section doesn't help with that, cut it. If something that would help is missing, add it even if it isn't in the outline below.

## Write to

`dev-reports/day-NN.dev.md` — two-digit, so they sort. Gitignored via `*.dev.md`, like the other dev notes.

## What it must contain

1. **What today was supposed to be** — the plan as it stood at the start, from `PROJECT_SCOPE.md`'s day table plus whatever was agreed in-session.
2. **What actually happened** — in order, as slices/commits, with the commit SHAs. Where reality diverged from the plan, say so and why.
3. **How the pieces fit** — the file-by-file map: what each file is for, what depends on what, where a request enters and where it lands. This is the part a newcomer needs most and the part that is most tempting to skip.
4. **What was hard, wrong, or surprising** — assumptions that failed, bugs found and how, reviewer catches, dead ends and why they were abandoned. Be specific: name the wrong belief and what corrected it. A report that reads like everything went smoothly is not useful and is usually not true.
5. **Decisions and their reasons** — choices that constrain tomorrow, especially ones that would look arbitrary without the reason. Include the ones deliberately deferred, and what would trigger revisiting them.
6. **State of the world** — what runs, what's verified how (unit tests vs. actually pressed on a device), what's set up outside the repo (dashboards, deployments), what's known-broken.
7. **What actually works — a manual QA pass** — everything a person could sit down and test right now, as steps plus the expected result, not a feature list. State the preconditions (a signed-in simulator, a running dev server, a deployment that's had the config pushed) because a test that fails for a missing precondition looks like a bug. Mark which rows were actually performed today and which are inferred from unit tests — a tester needs to know which claims are already proven.

   Pair it with **what is deliberately not built yet**, so nobody files a bug against a screen that was always meant to be empty. Without that list, the QA section generates noise instead of signal.
8. **How to get unstuck** — the recovery commands for states that were actually hit: a wedged app, config that won't take, a held port, a simulator that needs wiping, a stale build cache. Carry the previous day's entries forward and add whatever today cost time to work out. This is the companion to the QA section — a tester who breaks a state and can't reset it stops there.
9. **Where the time actually went** — a rough split between planned work and everything else (debugging, environment, docs), with the day's own estimate of how that compares to the plan. Not self-flagellation: on a fixed deadline, estimate accuracy is the project risk, and a single day's number means little while five days' trend decides whether the scope still fits. Say plainly if the rate implies the plan doesn't hold.
10. **Known issues and deferred work** — everything being lived with rather than fixed. For each: what it is, why it was left, what makes it safe (or not) for now, and the **trigger** that forces it to be handled. This section is the one most likely to be quietly dropped and the most expensive to lose — a deferred problem with no recorded trigger becomes a surprise. Carry forward every unresolved item from the previous day's report that is still unresolved; do not let it fall off because it wasn't touched today.
11. **Tomorrow** — what to start with, what must be true before certain work can begin, known traps, and any external setup needed first.

    **Name the gates tomorrow's work will trigger, before it triggers them.** Walk tomorrow's scope against the review gates this project requires — `app-store-reviewer` for any slice that adds or changes a sensitive permission, contacts, microphone, calendar, photos, or notification permissions; `security-reviewer` for anything touching data access, auth, or an external API; `docs-verifier` for an unfamiliar third-party API — and write down which slice trips which. A gate that only exists in `CLAUDE.md` is a gate the next session has to *remember*; a gate written into this section is one they *read*. The permission strings are the sharpest case: they are written most accurately at the moment the feature is built, and they are an actual App Store rejection reason, so discovering the gate on submission day means rewriting them from memory of what the feature does.
12. **Open questions** — things genuinely undecided, not rhetorical.

## Bring the documentation up to date — part of the day, not an extra

A day isn't finished until the docs describe the repo as it now is. Before writing the report, go through each of these and fix what today made wrong:

- `README.md` / `README.ko.md` (or whichever docs this project maintains)
- `CLAUDE.md` / `CLAUDE.ko.md`
- `PROJECT_SCOPE.md` / `PROJECT_SCOPE.ko.md`
- `STYLE.md`, `AGENTS.md` (if present)

Look for: commands that no longer exist or no longer work, setup steps that are already done or now wrong, a plan or schema block that reality has diverged from, a constraint discovered today that belongs in `PROJECT_SCOPE.md`'s Reality Checks, and decisions that were made in-session but live nowhere durable.

**Every one of these files is a pair, if this project keeps bilingual docs.** Editing one language without its twin leaves the project with two documents that disagree, and the next reader can't tell which is right. Update both in the same pass, then check they still line up (section counts, the command column of any table, code-block counts).

Then record what changed, and why, in the report's own section. That way the report explains the doc diff rather than the reader having to infer it from `git diff`.

## Rules

- **Distinguish verified from assumed.** If something was proven by running it, say how. If it's inferred, mark it. The next session will act on this as fact.
- **Record the failures.** An approach that was tried and abandoned saves the next session from trying it again — write down what happened and the evidence that killed it.
- **Link to the source, not just the claim.** Point at the file, the commit, the doc URL, the memory entry — so a reader can check rather than trust.
- Write in the language the developer has been using in the session.
- Keep the commit-level detail in `dev-reports/day-NN-commits.dev.md` — one per day, same NN as the report. This file is the day's shape, not a second copy of the log.

## After writing

Tell the developer where it is and what's in it. Do not commit it — `*.dev.md` is gitignored, and commits are theirs to make anyway.
