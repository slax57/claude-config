---
name: slax57-conventions
description: My standing working conventions — output style, scope discipline, Git history, and how to run a requirements interview. Load at the start of any development task, and whenever scoping work or asking the user clarifying questions.
---

# Working conventions

## Output style

Default to the **Concise** output style. Hold it for the **entire session** — do not
drift back to verbose prose mid-task.

## Scope discipline

Implement ONLY what was asked. Do not add adjacent features (e.g. extra close/launch
flows) without asking first. When a UI rule is stated per-element, confirm the exact
per-status matrix before editing UI code.

## Git history

Never rewrite pushed Git history (no rebase, amend, reset or force-push) unless I
explicitly ask for it: add a new commit instead. "Rebase on main" (or any branch) means
merge `origin/main` into the branch. PRs are usually squash-merged, so the branch
history does not matter.

## Requirements interviews

When grilling for requirements: ask through the **AskUserQuestion** tool, never repeat a
question already answered earlier in the thread, and always offer concrete options
(A/B/C) rather than open-ended abstract questions. See the `grilling` skill for the full
protocol.
