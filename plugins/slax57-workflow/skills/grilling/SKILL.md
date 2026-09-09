---
name: grilling
description: Grill the user relentlessly about a plan, decision, or idea. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrases.
---

Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled: the questions you can ask _now_ without guessing at answers you haven't heard yet. Ask the whole frontier each round, then wait for the user's answers before the next round.

## Ask through AskUserQuestion, never prose

Every question goes through the **AskUserQuestion** tool. Do not print questions as markdown text and do not ask the user to type free-form answers — the tool renders selectable options, which is the whole point.

Rules for each call:

- **Max 4 questions per call.** If this round's frontier has more than 4, issue back-to-back AskUserQuestion calls until the round is covered. Splitting a round across calls is fine; deferring a ready question to a later round is not.
- **2-4 concrete options per question**, mutually exclusive unless you set `multiSelect: true`. Never write abstract, open-ended questions — turn the decision into real, named alternatives the user can pick between.
- **Recommend one.** Put your recommended option first and append `(Recommended)` to its label. This replaces the old `➡️` recommendation line.
- Each option's `description` states the trade-off or consequence of picking it — that is where the reasoning goes, not in the question body.
- `header` is a ≤12-char chip (e.g. `Auth method`, `Storage`, `Rollout`).
- **Never add an "Other" option** — the UI supplies it. The user may answer through it in free text; treat that as authoritative and let it reshape the tree.
- Use `preview` (single-select only) when the options are concrete comparable artifacts: layout mockups, code snippets, config or schema variants, diagram shapes. Skip it for plain preference questions.
- Never repeat a question already answered earlier in the thread.

## Rounds

Each round the user answers reshapes the tree: settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a _later_ round, not this one.

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (filesystem, tools, etc.), dispatch a sub-agent to find it; don't ask the user for anything you could look up yourself. Don't block on it: a running exploration is an unsettled prerequisite, so only the questions downstream of it wait for the sub-agent to report; ask the rest of the frontier now. The _decisions_ are the user's: put each to them and wait.

Between rounds, keep the running summary short — a line per settled decision, no re-narration of what the user just picked.

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed. Then state the shared understanding plainly and wait for the user to confirm it before acting on it.
