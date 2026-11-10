---
name: notion-notes
description: Create, or find if it already exists, the user's private Notion notes page for the current repository and branch, and reply with its URL only. Never reads the page's content. Use when the user runs /notion-notes or asks for their notes page for this branch ("ma page de notes", "mes notes Notion", "notes page for this branch").
---

# Notion notes page for the current branch

Returns the URL of the user's Notion notes page for `<repo>` / `<branch>`,
creating it first if needed. Relies on the official Notion connector (its tools
are named `notion-search`, `notion-fetch`, `notion-query-data-sources`,
`notion-create-database`, `notion-create-pages`, whatever their prefix; load
them through `ToolSearch` if they are deferred).

## Why you must never read the page

The user keeps this page to **challenge your work**: questions to ask you,
things to check, doubts about your choices. If you read it, you anticipate the
challenge instead of facing it, and the review loses its value. So, for this
page, for the whole session, **unless the user explicitly asks you to read it**:

- never `notion-fetch` the page, its URL or its id, nor any block inside it;
- never `notion-search` with highlights: always pass `max_highlight_length: 0`;
- never query its comments, backlinks or versions;
- never put page content in a database query (rows mode and the SQL below
  return properties only: keep it that way, no `content` column);
- never quote, summarise or guess what it contains.

This is a courtesy, not a security boundary: the user knows you technically
could. Honour it anyway. If a later task seems to need the notes, ask the user
to paste what they want you to see.

## 1. Identify repo and branch

```bash
git remote get-url origin   # → owner/repo (strip host, ".git")
git branch --show-current
```

- No `origin` remote: use the repository root's folder name as repo.
- Empty branch (detached HEAD): stop and tell the user; do not create a page.

## 2. Find the database

All notes pages live in one database named **`Claude dev notes`**, with these
properties: `Name` (title), `Repo` (text), `Branch` (text), `Created`
(created time).

1. `notion-search` with `query: "Claude dev notes"`,
   `max_highlight_length: 0`, `page_size: 5`. Keep only a **database** whose
   title is exactly `Claude dev notes`.
2. Not found: create it with `notion-create-database`, no parent (private,
   workspace level), title `Claude dev notes`, schema
   `CREATE TABLE ("Name" TITLE, "Repo" RICH_TEXT, "Branch" RICH_TEXT, "Created" CREATED_TIME)`.
   Tell the user in one line that it was created as a private page they can
   move anywhere.
3. Several found: use the most recently edited one and say so in one line.

`notion-fetch` the **database** (never a row) to get its `collection://` data
source URL and the exact column names. Fetching the database returns its
schema, not the content of its pages.

## 3. Look for the page

`notion-query-data-sources` in rows mode, filtered on both properties:

```json
{"data": {"mode": "rows", "data_source_url": "collection://…", "limit": 5,
  "filter": {"type": "group", "operator": "and", "filters": [
    {"type": "property", "property": "Repo", "propertyType": "text",
     "operator": "string_is", "value": {"type": "exact", "value": "<owner/repo>"}},
    {"type": "property", "property": "Branch", "propertyType": "text",
     "operator": "string_is", "value": {"type": "exact", "value": "<branch>"}}]}}}
```

Found: take its `url` and go to step 5. Several: take the oldest and mention
the duplicates' URLs in one line.

## 4. Create it

`notion-create-pages` with `parent: {"type": "data_source_id", "data_source_id": "<id>"}`
and one page:

- `properties`: `Name` = `<repo> · <branch>`, `Repo` = `<owner/repo>`,
  `Branch` = `<branch>`;
- `icon`: `📝`;
- `content`: empty. The page is the user's; write nothing in it.

Use `allow_async: false` so the result carries the URL directly.

## 5. Reply

Reply with the URL and nothing else, plus one line if the page or database was
just created. Then carry on with whatever you were doing before. Do not open,
fetch or comment on the page afterwards.
