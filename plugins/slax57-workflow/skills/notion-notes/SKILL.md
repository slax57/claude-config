---
name: notion-notes
description: Create, or find if it already exists, the user's Notion notes page for the current repository and branch, and reply with its URL only. The argument can be a branch, or the work's input (a Trello card URL or other URL, or a text description of the feature) from which the branch name is derived when the session has no branch yet. Never reads the page's content. Use when the user runs /notion-notes or asks for their notes page for a branch or a card ("ma page de notes", "mes notes Notion", "prépare ma page de notes pour cette carte", "notes page for this branch").
argument-hint: "[branch | URL | description]"
---

# Notion notes page for a branch

Returns the URL of the user's Notion notes page for `<repo>` / `<branch>`,
creating it first if needed. The user often takes notes before planning the
work, when no branch exists yet: the skill then derives the branch name from
the work's input (Trello card, other URL or description).

Relies on the official Notion connector (its tools are named `notion-fetch`,
`notion-query-data-sources`, `notion-create-pages`, whatever their prefix; load
them through `ToolSearch` if they are deferred).

## Why you must never read the page

The user keeps this page to **challenge your work**: questions to ask you,
things to check, doubts about your choices. If you read it, you anticipate the
challenge instead of facing it, and the review loses its value. So, for this
page, for the whole session, **unless the user explicitly asks you to read it**:

- never `notion-fetch` the page, its URL or its id, nor any block inside it;
- never `notion-search` for it; if you ever search Notion for something else,
  pass `max_highlight_length: 0` so no snippet of it comes back;
- never query its comments, backlinks or versions;
- never put page content in a database query (the queries below return
  properties only: keep it that way);
- never quote, summarise or guess what it contains.

This is a courtesy, not a security boundary: the user knows you technically
could. Honour it anyway. If a later task seems to need the notes, ask the user
to paste what they want you to see.

## 1. Resolve the database

The database is configured by the `NOTION_NOTES_DATABASE` environment
variable: its Notion URL or id.

```bash
printenv NOTION_NOTES_DATABASE
```

Empty: stop and tell the user to set it (in `~/.claude/settings.json` under
`env` locally, or in the cloud environment's environment variables). Do not
search for a database or create one.

`notion-fetch` the **database** (never a row) to get its `collection://` data
source URL. Fetching a database returns its schema, not its pages' content.
It must have the properties `Name` (title), `Repo` (text) and `Branch` (text);
if one is missing, stop and say which.

## 2. Resolve repo, branch and title

Arguments: `$ARGUMENTS`

```bash
git remote get-url origin                          # → owner/repo (strip host and ".git")
git branch --show-current
git symbolic-ref --short refs/remotes/origin/HEAD  # → origin/<default branch>
```

**Repo**: always from `origin`. No `origin` remote: the repository root's
folder name.

**Argument kind**:

- empty: no argument;
- a URL (starts with `http://` or `https://`): an **input**;
- a single token without whitespace: a **branch**, used as is;
- anything else: an **input**, a text description of the feature.

**Session branch**: the current branch, unless it is the default branch
(`origin/HEAD`; `main` or `master` if that ref is missing), a generated
`claude/*` branch, or HEAD is detached. In those cases the session has no
branch yet.

**Branch**, in this order:

1. the argument, if it is a branch;
2. otherwise the session branch, if there is one;
3. otherwise **derived** from the title (below): a short slug of the work in
   English, kebab-case, lowercase, no type prefix, about 2 to 5 words
   (e.g. `export-invoices-csv`). The skill only names it: never create,
   switch to or rename a git branch.

**Title**: the page is titled after the user story being worked on, so the
user can find it again later. In this order:

1. an input argument that is a Trello card URL: the card's name, verbatim,
   read through the Trello MCP server;
2. an input argument that is another URL (GitHub issue, ticket…): its title,
   read with whatever tool reaches it (`gh`, a connector, a web fetch);
3. an input argument that is a description: a short title made from it (a
   few words, in the language the user speaks);
4. without an input argument, from what this session already knows: the name
   of the Trello card the user story comes from, verbatim, otherwise a short
   description of the user story. Use only what is known to concern that
   branch: with a branch argument other than the session branch, the current
   task may be about something else.

The title is needed to derive a branch, and to create a page (step 4); it is
not needed to find an existing page by branch. So resolve it lazily: only when
the branch must be derived, or when step 3 finds nothing. When it is needed and
nothing gives it, **do not create the page**: ask the user for the Trello card
(its URL or name) or a description of the user story, then resume with the
answer as the input argument.

## 3. Look for the page

`notion-query-data-sources` in SQL mode, properties only:

```json
{"data": {"mode": "sql", "data_source_urls": ["collection://…"],
  "query": "SELECT url FROM \"collection://…\" WHERE \"Repo\" = ? AND \"Branch\" = ? ORDER BY createdTime",
  "params": ["<owner/repo>", "<branch>"]}}
```

When the branch was **derived**, a page made earlier for the same work may
carry another derived name: if nothing matches the branch, run the same query
selecting `url, "Branch"`, with `"Name" = ?` and the title instead of
`"Branch" = ?`. A page found this way gives the branch: its `Branch` value.

Found: take the first `url` and go to step 6. Several: also list the others'
URLs in one line, as duplicates. An existing page keeps its title and branch.

## 4. Title

Not found: make sure the title is resolved (step 2), asking the user if
needed.

## 5. Create it

`notion-create-pages` with
`parent: {"type": "data_source_id", "data_source_id": "<collection id>"}`,
`allow_async: false`, and one page:

- `properties`: `Name` = `<title>` from step 4, `Repo` = `<owner/repo>`,
  `Branch` = `<branch>`;
- `icon`: `📝`;
- no `content`. The page is the user's; write nothing in it.

## 6. Reply

Reply with the URL and nothing else, plus one line if the page was just
created, and one line naming the branch if it was derived (or taken from an
existing page found by title): the user will create the branch under that name
so this skill finds the page again. In a session on a `claude/*` branch that
gets renamed before the first commit, rename it to that name.

Then carry on with whatever you were doing before. Do not open, fetch or
comment on the page afterwards.
