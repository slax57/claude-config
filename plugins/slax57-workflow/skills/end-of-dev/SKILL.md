---
name: end-of-dev
description: End-of-development workflow to run AFTER the user has implemented and manually validated a feature. Commits the work, then runs three review lanes with disjoint mandates in parallel (the built-in code-review skill at xhigh, a report-only gaps subagent, a report-only security subagent), triages their findings (drop / fix autonomously / one batched arbitration), applies the fixes, then drafts the PR description and offers to push (never without approval). Use when the user signals the feature is validated and wants to wrap up ("c'est validé", "lance la fin de dev", "termine la feature", "ready to open the PR").
---

# End-of-dev workflow

Runs **after** the user has implemented a feature **and validated it manually**.

Two hard rules for this whole workflow:

- **Only the orchestrator (you) edits, tests and commits.** Every review lane is
  report-only — including `code-review`, which is called **without** `--fix`.
- **Don't block.** Act on your own judgment; group everything that genuinely
  needs the user into a single arbitration point (step 3). Never ask
  finding-by-finding.

## Preconditions

- The user has validated the implementation. If unclear, confirm before starting.
- You are on a feature branch. If on `main`/`master`/`develop`, stop and ask.
- Resolve the base branch (usually `main`) — the lanes review `<base>...HEAD`.
- If `/code-review` or `/simplify` was already run on this branch and its fixes
  committed, **skip lane 1** and run only lanes 2 and 3; say so in one line.

## 1. Commit the validated work

If `git status --porcelain` is dirty, those changes are the validated feature.
Commit with conventional-commit message(s) derived from the diff: one commit for
a small change, several coherent ones (model / endpoint / UI / migration) for a
larger one. Follow the user's commit conventions; no AI attribution.

## 2. Three review lanes, in parallel

The three mandates are deliberately disjoint so no finding is paid for twice.
Launch all three in **one message**: the `Skill` call for lane 1 alongside the
two `Agent` calls for lanes 2 and 3.

### Lane 1 — `code-review`, at `xhigh`

Invoke the built-in **`code-review`** skill via the `Skill` tool:

```
code-review xhigh <base>...HEAD
```

**Always pass the level explicitly.** With no level the skill reuses whatever
level the *user* last typed (`getDefaultEffort`), which makes this step
non-deterministic. Never pass `--fix` (the orchestrator applies) and never
`--comment` (nothing goes to the PR before step 6).

Why `xhigh`: on Opus 5, `low` caps at 4 findings and skips test files entirely,
and `medium` and `high` route to the *same* minimal single-pass prompt that
hunts correctness only — no reuse, simplification, efficiency, altitude or
CLAUDE.md-conventions angles at all. `xhigh` is the cheapest level that runs all
ten angles (5 correctness + reuse + simplification + efficiency + altitude +
conventions) plus a gap sweep, and on Opus 5 it runs them in sequence in one
agent rather than fanning out. `max` adds a subagent fan-out and a per-candidate
verify pass — real precision, but step 3 already drops speculative findings by
hand, so it mostly pays twice. On other model families `xhigh` maps to a fuller
fan-out; it stays a superset, just pricier.

Lane 1 therefore **owns**: correctness, removed behaviour, broken call sites,
language pitfalls, wrapper/proxy bugs, reuse, simplification, efficiency,
altitude, and CLAUDE.md conventions. Do not brief another lane on any of those.

`code-review` normally runs as a fork with its own context, which preserves
most of the outside-eye value the old blind reviewer had. If it runs inline
instead (it does when `CLAUDE_CODE_REPORT_FINDINGS` is set and `ReportFindings`
is available), work through it yourself first, then launch lanes 2 and 3.

### Lanes 2 and 3 — report-only subagents

Common contract for both:

> Review the working diff against `<base>` (`git diff <base>...HEAD`).
> **Report only — do not edit, write, or commit anything.**
> Ignore pre-existing problems outside the diff. No praise, no feature summary.
> Return a flat list, worst first, max ~10 items, each on one line:
> `SEVERITY | file:line | the claim in one sentence | suggested fix`
> Only report what you can tie to a concrete failure or a concrete improvement.
> **Stay in your lane.** Anything outside your mandate belongs to another lane
> that is already running — drop it, do not report it "just in case".

- **Lane 2 — gaps.** Exists because `code-review`'s generic angle wording
  provably misses these four. Its mandate is **only** these four, nothing else:
  - **translation keys / i18n** — every user-facing string the diff adds goes
    through a key instead of a hardcoded literal; every new key exists in
    **all** locale files the repo ships, not just the default one; no key the
    diff orphans is left behind. `code-review` has no i18n angle whatsoever, so
    a missing or single-locale key is only ever caught here.
  - **test coverage gaps** — each new branch, error path or edge case the diff
    adds with no test covering it, and any test the diff deletes or weakens.
    Name the uncovered case, never "add more tests".
  - **query performance / N+1** — a query issued inside a loop or per row, a
    list endpoint lazy-loading a relation per record, a missing eager-load /
    join / batch. Name the query and the record count that makes it hurt.
    (Lane 1's efficiency angle only says "repeated I/O" and misses these.)
  - **duplicated UI components** — a new component, hook, form field, modal,
    layout or style block that restates one the design system or a sibling
    feature folder already provides. Grep the component directories; lane 1's
    reuse angle only greps shared/utility modules.

  Report nothing else. No correctness bugs, no simplification, no altitude, no
  conventions, no security — every one of those is another lane's.

- **Lane 3 — security.** Tell it to invoke the `security-review` skill and
  report its findings under the contract above (report-only); if that skill
  isn't available to it, review the diff itself for injection, authz/tenant
  scoping, secrets, unsafe deserialization, SSRF, file-upload and CSRF issues.
  That skill deliberately excludes DoS, rate limiting and secrets-at-rest —
  don't ask it for them and don't read their absence as a gap.

Wait for all three, then triage. Don't start editing while they run.

## 3. Triage

Pool the three lanes' findings and sort every one into a bucket:

- **Drop** — outside the diff, pre-existing, speculative with no failure
  scenario, already the project's convention, a duplicate of another lane's
  finding (lane 1 runs no verify pass at `xhigh`, so it deliberately keeps
  uncertain candidates — expect some to drop here), or it contradicts a choice
  the user **explicitly validated during this dev session** (common for lane 1,
  which has no feature context: say so in one line rather than re-litigating).
- **Fix** — clear, mechanical or unambiguous, no behaviour/scope change.
- **Arbitrate** — a real trade-off, a behaviour or scope change, several valid
  fixes, or a security finding whose fix is non-trivial.

Then show **one** compact table (bucket / severity / file / claim, one line
each) so the user can see what you dropped and re-classify if they disagree. If
the Arbitrate bucket is non-empty, ask about all of it in a **single**
`AskUserQuestion` with a recommended option per item. If it is empty, say so and
keep going without asking.

## 4. Apply and verify

Apply the Fix bucket plus the arbitrated decisions, run the project's test
suite, and commit — one commit per coherent group (e.g. `refactor: …` for the
cleanup findings, `fix: …` for the correctness ones). If the suite is red, fix
it before committing; if you can't, say so plainly and stop there.

## 5. Optional second pass

Only if the applied fixes were **substantial** (new logic, changed behaviour,
new endpoint/query — not renames or extractions): re-run **only** the lane whose
area changed, same level and same contract. Cap this at one extra pass.

## 6. PR

Draft the description with the **`write-pr-description`** skill, show it **in
full** inside a Markdown code block, and get approval before anything remote.
Then **offer** to push and open the PR — never do either without explicit
approval. If `git push`/`gh` fails on auth or permissions, report it plainly and
leave the branch as-is; the description is ready to use manually.
