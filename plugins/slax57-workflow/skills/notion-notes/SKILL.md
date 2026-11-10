---
name: notion-notes
description: Create, or find if it already exists, the user's Notion notes page for the current repository and branch (or a branch passed as argument), and reply with its URL only. Never reads the page's content. Use when the user runs /notion-notes or asks for their notes page for a branch ("ma page de notes", "mes notes Notion", "notes page for this branch").
argument-hint: "[branch]"
---

# Notion notes page for a branch

Returns the URL of the user's Notion notes page for `<repo>` / `<branch>`,
creating it first if needed. Relies on the official Notion connector (its tools
are named `notion-fetch`, `notion-query-data-sources`, `notion-create-pages`,
whatever their prefix; load them through `ToolSearch` if they are deferred).

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

## 2. Resolve repo and branch

Arguments: `$ARGUMENTS`

```bash
git remote get-url origin   # → owner/repo (strip host and ".git")
git branch --show-current
```

- **Branch**: the argument if one was given, used as is; otherwise the current
  branch. No argument and detached HEAD: stop and tell the user to pass a
  branch name.
- **Repo**: always from `origin`. No `origin` remote: the repository root's
  folder name.

## 3. Look for the page

`notion-query-data-sources` in SQL mode, properties only:

```json
{"data": {"mode": "sql", "data_source_urls": ["collection://…"],
  "query": "SELECT url FROM \"collection://…\" WHERE \"Repo\" = ? AND \"Branch\" = ? ORDER BY createdTime",
  "params": ["<owner/repo>", "<branch>"]}}
```

Found: take the first `url` and go to step 5. Several: also list the others'
URLs in one line, as duplicates.

## 4. Create it

`notion-create-pages` with
`parent: {"type": "data_source_id", "data_source_id": "<collection id>"}`,
`allow_async: false`, and one page:

- `properties`: `Name` = `<repo> · <branch>`, `Repo` = `<owner/repo>`,
  `Branch` = `<branch>`;
- `icon`: `📝`;
- no `content`. The page is the user's; write nothing in it.

## 5. Reply

Reply with the URL and nothing else, plus one line if the page was just
created. Then carry on with whatever you were doing before. Do not open, fetch
or comment on the page afterwards.
