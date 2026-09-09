---
name: write-pr-description
description: How I write GitHub pull request descriptions — structure, length ceiling, level of detail, scope, and tone. Use whenever creating a pull request or drafting/refining a PR description.
---

# Writing PR descriptions

Applies to the pull request **description**. Always write it in **English**, always inside a
**Markdown code block** so I can copy-paste it into GitHub.

**Before creating the PR**, show me the full proposed description and let me review/approve it.

## Golden rule

**The reviewer has the diff.** The description exists so a developer grasps the *scope* of the PR
in under a minute. Anything they could learn by opening the diff does not belong here.

A too-long description is worse than a too-short one: it stops being read. When in doubt, cut.

## Hard length ceiling

**Never longer than the reference example below** (~45 lines). Shorter is always fine, and is the
norm — a one-line fix gets one bullet per section.

Rough budget:

| Section | Budget |
| --- | --- |
| `## Problems` | 1–3 bullets, one line each (a bug may earn a repro / `wrong vs expected` block) |
| `## Solutions` | 3–6 bullets, one line each |
| `## Additional fix` | 1–3 bullets, one line each |
| `## Out of scope` | 1–4 bullets |
| `## How To Test` | no ceiling — this is the one section where detail earns its place |

If a section overflows its budget, the fix is to delete, not to reflow.

## Structure

In this order, only the ones that earn their place:

1. Ticket / issue link at the very top (Trello, `Fix #1234`, `Closes <url>`).
2. `## Problems`
3. `## Solutions`
4. `## Additional fix` — secondary fixes found along the way, never merged into `Solutions`.
5. `## Out of scope`
6. `## How To Test`

Also available when they genuinely apply: `## Screenshots`, `## Alternatives considered`,
`## Additional notes`.

If the repo ships a PR template (e.g. react-admin's "Additional Checks", ra-enterprise's
"Release process"), keep those extra sections and fill them honestly — leave a box unchecked with
a short reason rather than pretending.

## Problems

**Detail here is conditional. Default to one line.**

- **New feature** → one line stating what the feature is, from the user's point of view. Do **not**
  argue why its absence was a problem, do not describe the current screen, do not quote the
  acceptance criteria. "Pilot currently has no way of viewing X" is the whole bullet.
- **Bug fix** → this is the one case worth investing in. Describe the symptom concretely, from the
  outside in (what a user or API consumer observes). A short repro, a `wrong vs expected`, a
  snippet or a screenshot beats prose.
  A **small code block is welcome** when the problem is genuinely technical and an example shows it
  faster than words — a race condition's interleaving, the wrong API response, the exact error
  raised under specific conditions. Keep it to the few decisive lines. For a feature, never.
- **Non-functional problem** (performance, scale, security) → one bullet naming the constraint and
  where it came from, e.g. *"Data volume challenge: PO confirmed a survey could target ~1000
  stores. The survey list page makes too many DB requests in that case (indicators counted in
  memory)."* Not the arithmetic, not the row counts, not the query name, not the quoted code
  comment.

Only problems that existed **before** this PR. Nothing introduced while iterating. If a linked
issue already describes it, link it and stop.

## Solutions

**What changes for the user, not how it was built.** One line per change, grouped by surface
(web / API / admin) when that helps.

A **technical pointer is fine** — naming the new service, the shared query, the file a rule was
written into gives the reviewer somewhere to start. What must not appear is the implementation
itself, even a fragment: the reviewer has the diff for that.

- Yes: *"One `App\Service\Survey\SurveyPerimeterQuery` behind web and API."*
- No: *"Rows fold with a plain `<details>`, so the products are readable without JavaScript."*

**Exception — a new public API.** On a library we publish (react-admin, ra-*), when the PR *is* a
new or changed DX, show the usage snippet: the new prop, hook or component as a consumer will
write it. That snippet is the feature, not its implementation. Keep it minimal — no surrounding
app code. On an end-user project this case essentially never arises.

Never include:

- Component internals, HTML tags, payload shapes, query plans, snippets of the new code beyond the
  public-API exception above.
- The reasoning behind an implementation choice. If it was worth arbitrating, we arbitrated it
  together during design, with the project's context and future in mind — re-litigating it in the
  PR adds nothing.

Single exception: an implementation choice that carries a **severe, lasting trade-off** a future
developer must know about. One line, and only if we haven't already settled it together.

## Out of scope

Only two kinds of item belong here:

- A **real requirement** from the ticket, deliberately deferred to another story — name it
  (`Export (RG11)`, `Clôturer / Modifier — US52 and US47/48`).
- A **known limitation shipped on purpose** that the next developer will hit.

Do **not** list:

- Ideas floated during design and dropped because they weren't mature. They were never a
  requirement and were never built — they don't exist as far as the PR is concerned.
- Interpretation calls I made during design with no real incidence (how an AC was read, keeping an
  existing empty state, …).
- Anything nobody asked for.

If nothing qualifies, drop the section.

## How To Test

Terse, actionable pointers — but be thorough, this section is *for* the reviewer:

- Prerequisite commands first (migrations, fixtures reload, env setup) and flag them as such.
- Test command + count, and where the per-AC coverage lives.
- Numbered steps for manual checks, with the expected result inline (`?store=%` → none).
- Rights / role matrix when the PR touches permissions.
- Storybook story URLs, `make …` commands, or "run unit tests" when that's all there is.
- If it can't be tested, say so in one line and why.

## Formatting & tone

- Bullet lists everywhere except a bug repro. No multi-line prose paragraphs.
- Reference PRs/issues by `#number` or full URL.
- Professional but human; a light touch of humor or an emoji is fine, never at the cost of clarity.

## Before showing it to me — cut list

Delete on sight:

- [ ] Any paragraph over 2 lines outside `How To Test`.
- [ ] Any description of *how* something was built — HTML tags, component internals, snippets of
      the new code. A bare pointer to a file or class is fine; the implementation is not.
      (Exception: the usage snippet of a new public API on a library we publish.)
- [ ] Any JSON / payload dump, quoted code comment, or performance arithmetic. (A few decisive
      lines are allowed in `Problems`, for a technical bug only.)
- [ ] Any justification of a design decision we already made together.
- [ ] Any abandoned idea or inconsequential interpretation call in `Out of scope`.
- [ ] Any restatement of the ticket's acceptance criteria.
- [ ] Any explanation of *why* a missing feature was a problem.

Then check: is it shorter than the reference example? If not, cut again.

## Reference example — this is the maximum acceptable length

````markdown
[Trello — [50] Consulter le détail d'un sondage](https://trello.com/c/etAtgXMp)

## Problems

- Pilot currently has no way of viewing the detail of each store's response for a given survey
- Data volume challenge: PO confirmed a survey could target ~1000 stores. The pilot's survey list
  page would make too many database requests in that case (indicators are counted in memory).

## Solutions

- The survey space now lists the stores it targets, each row unfolding on the products it asked for
- The stores list is paginated (web + API)
- Pilot survey list: the indicators are counted in the database.
- Admin: survey response list can now be filtered by survey and store

## Additional fix

- New search-input component, with proper wildcard and accent support
- Pagination component gains previous / next, ellipses and a count line

## Out of scope

- **Export (RG11)** — its own story.
- **Clôturer / Modifier** — US52 and US47/48. The buttons are shown inert, to whoever will
  hold the right.
- **A paginated admin view of the perimeter** — the admin embed still renders it whole, which
  is fine for the back-office but is the next thing to look at if a real 1000-store survey
  lands there.

## How To Test

- **Run the migration first**: `bin/console doctrine:migrations:migrate` (installs the
  `unaccent` extension) — and for the test database,
  `bin/console -e test doctrine:migrations:migrate`.
- `bin/phpunit tests/` — 2731 tests. Per-AC coverage lives in
  `tests/Controller/ProjectSurveyDetailTest.php` (web) and `tests/Api/SurveyPerimeterApiTest.php`
  (API); the two search traps in `tests/Service/Survey/SurveyPerimeterQueryTest.php`.
- Reload the fixtures (`bin/console doctrine:fixtures:load`) to get the 12-store demo survey.
- In the browser as `admin@ems.local`, on `/RETAIL/projects/19/survey` (12 stores, 9 answered,
  75 %):
  1. `?store=bethune` → 1 row · `?store=%` → none.
  2. Status filter → 9 answered / 3 still expected.
  3. Page 2 → 2 rows, and it keeps the search term.
  4. `?store=&responded=&page=` (what the panel submits when blank) → the full list, no 500.
- Rights: `superviseur@ems.local` sees the page without the inert Clôturer / Modifier;
  `user@ems.local` and `designer@ems.local` get 403.
- API: `GET /api/brands/RETAIL/surveys/13/stores`, and `/api/docs` — the operation sits under
  the `Survey` tag with `store` and `responded` declared.
````
