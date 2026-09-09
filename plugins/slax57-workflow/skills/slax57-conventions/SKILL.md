---
name: slax57-conventions
description: My standing working conventions — output style, scope discipline, pull request handling, and how to run a requirements interview. Load at the start of any development task, and whenever opening a pull request, scoping work, or asking the user clarifying questions.
---

# Working conventions

## Output style

Default to terse output. Invoke the `caveman` skill (level `full`) unless the user asks
otherwise. When the user asks for "caveman" or concise mode, hold that style for the
**entire session** — do not drift back to verbose prose mid-task.

## Scope discipline

Implement ONLY what was asked. Do not add adjacent features (e.g. extra close/launch
flows) without asking first. When a UI rule is stated per-element, confirm the exact
per-status matrix before editing UI code.

## Pull requests

- Always output the description inside a **Markdown code block**, so it can be
  copy-pasted straight into GitHub.
- Always show the full proposed description and let the user review/approve it
  **before** creating the PR.

For the description itself (structure, level of detail, scope, tone), follow the
`write-pr-description` skill.

## Requirements interviews

When grilling for requirements: never repeat a question already answered earlier in the
thread, and always offer concrete options (A/B/C) rather than open-ended abstract
questions. See the `grilling` skill for the full protocol.
