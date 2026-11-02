---
name: prepare-demo
description: Prepare an end-of-sprint demo for a non-technical client. Collects the user's delivered Trello cards, researches each one (card spec, pull requests, code, seed data) through parallel subagents, then writes terse numbered demo notes, ready to copy-paste, that chain the data each step creates into the next and fold every known demo-day trap into the preparation. Use when the user wants to prepare, plan or script a sprint demo or review ("prépare ma démo", "démo de fin de sprint", "sprint review", "demo script").
---

# Prepare a sprint demo

Produces **demo notes** the user follows live: a preparation checklist, then a
timed walkthrough. The audience is the client, **not technical**: show features
and business rules, never implementation.

## 1. Collect the cards

- Use the **plugin's Trello MCP** (`mcp__plugin_slax57-workflow_trello__*`), not
  any other Trello connector, unless the user says otherwise.
- No active board: find it from a card URL in recent PR bodies or commits
  (`gh pr list --state merged --limit 5 --json body`), `get_card` it, and read
  `idBoard` and the user's member id from the result. Avoid `list_boards`: its
  output is huge.
- Default scope: the cards **assigned to the user** in the sprint's "Done" list
  plus "To be validated" (or whatever lists the user names). Filter on
  `idMembers`; a card shared with a teammate still counts.
- List the cards back in one short message, then start the research without
  waiting.

## 2. Research, in parallel

Group related cards (same feature area, or one card building on another) and
launch **one `general-purpose` subagent per group, all in one message**.
Research only: tell them to change nothing. Brief each one with:

- the board id, the card URLs, and the instruction to load the Trello tools
  through `ToolSearch` first;
- read the description (user story, business rules, acceptance criteria) and
  the comments: they hold the product owner's arbitrations;
- find the pull requests (`gh pr list --state all --search "<card shortLink>"`,
  then keywords), read their descriptions and review threads for **deviations
  from the spec, things left out, and difficulties**;
- read the code to locate every entry point on each frontend the app has (if
  applicable: web pages and buttons, back-office screens, API endpoints), and
  the exact UI labels the audience will see;
- read the seed data (fixtures, demo accounts) for what is usable as is; for
  each seed record considered, say how to create it by hand and its
  prerequisites (rights, dates, ids from an external system);
- if the card is a fix (amounts, calculation, display, business rule): report
  the behaviour **before and after**, with the exact case raised by the
  product owner;
- return, in the user's language: what was actually delivered vs the card;
  a concrete demo path (account, page, button, expected on-screen result);
  prerequisites (workers, schedulers, external systems, time of day); points to
  highlight to a non-technical client; what data the step produces that a later
  step could reuse, and what it needs from an earlier one.

## 3. Verify what the chain relies on

Subagents report each feature in isolation. The path chains them, and a chain
can break at the seam. Check yourself, in the code or seed data, every
assumption a step takes from another. Example: "the account receiving the
notification is attached to the tenant where the data was just created" — it
may not be, and the preparation then has to attach it.

What you cannot verify statically becomes a **rehearsal item** in the
preparation, and is named in the chat reply.

## 4. Design the path

- **About 20 minutes** unless told otherwise. Give each section a duration.
- **Frontends, if applicable** (depends on the app):
  - **mostly the main user-facing app** (usually the web app);
  - **back-office screens inline**, at the moment their topic is on screen (the
    import's audit trail right after the import, the scheduler trigger inside
    the notifications section). Switching windows is quick; a separate
    "back-office" section breaks the story;
  - **API: one or two calls** by default, placed where they make sense, unless
    the user asks for more.
- **Chain the data.** Each step reuses what a previous one created (import
  products, run a survey on them, order them…). Prefer creating data live over
  showing static seed data.
- **Order:** group sections by domain or narrative thread (all "project"
  sections together, all "Marketplace" sections together), never alternating.
  Chained data first, then domain grouping; if the two conflict, flag it to the
  user. Each part's title names its domain.
- **Leave out** what is too complex, too slow, or too technical for the
  audience. A purely technical card (refactor, API cleanup) is a one-line talking
  point, unless it has a visible effect.
- **Data strategy:** by default, the preparation has the user **create by hand,
  ahead of the demo**, the data needed (projects, products, quotes, orders,
  accounts): it also rehearses the path and checks for regressions. Reloading
  fixtures or the database is the exception: propose it only if it greatly
  simplifies the setup, **ask the user first** (it erases existing data), and
  make it the **first** preparation item, before any account or data creation.
  No step relies on a seed record unless the user confirms it: it may have
  changed since the last load.

## 5. Bake the demo-day traps into the preparation

These have all bitten a real demo. Do not list them as a "pitfalls" section in
the notes: turn each one into a preparation item or a step detail.

- **A rehearsal consumes unique values.** References, codes, names, emails:
  anything with a uniqueness rule that the rehearsal creates exists on demo day,
  so the demo's first attempt fails, or a planned "duplicate" error fires too
  early. Use **different values for the rehearsal and the demo**, or say to
  generate the value at demo time (timestamp suffix). A planned duplicate error
  must duplicate something **created earlier in the same demo**.
- **Mail needs a real inbox.** Fake demo domains are often dropped on staging.
  To show emails, the preparation creates an account on the user's real address
  with a plus alias (`<user>+<sprint>@<domain>`).
- **Assign windows by mailbox.** The account receiving the emails runs in the
  **normal browser profile**, where the webmail is open, so clicking a link in a
  mail lands in the app, logged in as the right user. Other accounts go in
  private windows or another browser. Name each window after its role or
  account ("Admin", "PV e-mail", "Chef projet client"), never A, B, C; keep the
  names stable across the notes. Give each window's browser and mode (normal or
  private): two private windows of the same browser share their session, so
  they cannot hold two accounts.
- **Short-lived tokens** (JWT, signed links) are fetched **during** the demo,
  never in the preparation.
- **Relative dates in seed data.** Dates drift: prefer data created by hand
  (see §4).
- **Asynchronous processing.** Anything behind a queue, worker or scheduler: the
  preparation checks the worker runs, and the step says to refresh.
- **Batch triggers** (an admin button running a scheduled job): click once, or
  notifications and reminders go out twice.
- **Time-of-day rules** (cut-off hours, scheduled runs): check the demo slot
  does not cross one.
- **Tenant or brand scoping** of lists and notifications: say which tenant to
  switch to before looking.
- **Seed records tied to an external system** may already be consumed there:
  create fresh records live instead of using the seeded ones.
- **A backup for flaky dependencies** (external API, third-party sandbox): one
  record prepared in advance, already at the state the demo needs.
- **Name things as the audience sees them**: the product's display name, not
  its internal code.

## 6. Write the notes

Language: the user's. Deliver them as **Markdown inside a code block**, ready
to copy-paste (fence with four backticks if the notes contain code spans that
need it).

Style: numbered steps, nested levels, **a few words per line, never sentences**.
Each line says the feature, the action, or what to point out.

Structure:

1. **Préparation / Preparation**: numbered checklist. Fixtures reload (only if
   agreed, first), accounts to create (with their attachments and rights), data
   to create by hand (per item: numbered click path with exact labels, account
   and rights, values to enter, ids to note and where to read them), files to
   prepare (give their full content, e.g. one table per import file: a valid one
   and one with deliberate errors, each error line annotated with the expected
   message; for any file or payload to send, its template with the fields to
   fill), backups, browser windows (explicit name, account, browser, mode),
   rehearsal items.
2. **Déroulé / Walkthrough**, total duration in the heading. One section per
   feature or story, with its duration, grouped by domain (title names it).
   Inside: numbered steps prefixed with the window name (`Admin :`, same names
   throughout), sub-bullets for what appears on screen, and a final
   **"À dire" / "Say"** list with the business points to highlight (rules
   enforced, effort saved, deviations agreed with the product owner, what comes
   next).

For a fix: steps give the exact elements to show for the **after** (values,
screen, labels); "Say" gives the **before** (wrong value or behaviour, with its
figures if an amount). Amounts are consistent with each other (breakdown of a
total, lines, sum). When the demo must display precise values, give the input
values as a table. Demo values are copy-pasteable as is.

No "pitfalls" section, no recap of the research, no implementation detail the
audience cannot see.

Chat reply around the notes: one short line on coverage (cards included, cards
left out and why), then the rehearsal items, each with what could not be
verified statically, and nothing else.

## 7. Iterate

The user will reorder, swap accounts, or add steps. Apply the change throughout
(window names, accounts, data reused downstream), re-check any new assumption
in the code, and send the whole notes again as one code block.
