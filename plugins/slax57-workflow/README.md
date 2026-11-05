# slax57-workflow

## Skills

| Skill                  | Invoked                           | What it does                                                                               |
| ---------------------- | --------------------------------- | ------------------------------------------------------------------------------------------ |
| `slax57-conventions`   | by the model                      | Standing conventions: terse output, scope discipline, PR handling, requirements interviews |
| `grilling`             | by the model, or a "grill" phrase | Requirements interview run as a design tree, one round of `AskUserQuestion` at a time      |
| `grill-me`             | `/grill-me` only                  | Alias that delegates to `grilling`                                                         |
| `write-pr-description` | by the model                      | PR description structure, length ceiling, tone                                             |
| `end-of-dev`           | `/end-of-dev`                     | Post-validation wrap-up: commit, three parallel review lanes, triage, fixes, PR draft      |
| `prepare-demo`         | by the model, or `/prepare-demo`  | Sprint demo notes from the user's Trello cards, PRs and code, chained and timed            |

## MCP servers

`.mcp.json` ships one server, started automatically whenever the plugin is enabled.

| Server   | Package                       | Credentials                      |
| -------- | ----------------------------- | -------------------------------- |
| `trello` | `@delorenj/mcp-server-trello` | `TRELLO_API_KEY`, `TRELLO_TOKEN` |

Its tools are namespaced by the plugin, so they are called
`mcp__plugin_slax57-workflow_trello__*` — a permission rule or a hook matching the bare
`mcp__trello__*` will not fire.

### Credentials

This repository is public, so `.mcp.json` only references environment variables. Set
their values in `~/.claude/settings.json`, which is not versioned:

```json
{
  "env": {
    "TRELLO_API_KEY": "…",
    "TRELLO_TOKEN": "…"
  }
}
```

Claude Code exports that `env` block into the session and expands `${VAR}` in a plugin's
`.mcp.json` against it. A server whose variables are unset starts and then fails to
authenticate.

Get a Trello key and token from <https://trello.com/power-ups/admin>.

## Mod: dev-notes

A hooks module (`hooks/dev-notes/`) that keeps one Notion page of control notes per repo
and branch, out of the model's reach.

- **Session start:** resolves `owner/repo` (from `origin`, else the folder name) and the
  branch, finds the oldest matching page in the database or creates it with five toggle
  headings (Tests, Revue, Arbitrages, Questions PO, TODO). A detached HEAD only toasts.
- **`/notes`:** opens a pane that shows and edits the page: add, edit, check, delete
  (confirmed), refresh, open in Notion. Every write re-reads the page first and writes
  nothing if it changed elsewhere. Where no pane can be drawn, it toasts the page URL.
- **Filter:** a `tool.call` hook on every Notion MCP tool refuses calls that name the
  database, its data source, views or pages, removes them from search and list results,
  strips the lines that mention them from other pages, and replaces any other result that
  names them. Notion's agent tools (`notion-spawn-session`, `notion-send-message-to-session`)
  are always refused.

### Prerequisites

- The Notion connector, connected in the session. The mod finds it by its `notion-fetch` tool, whatever the server is named (an opaque ID on Desktop).
- A Notion database with exactly these properties: `Name` (title), `Repo` (text),
  `Branch` (text).
- Keep that database out of pages Claude reads often: its parent page stays readable, minus
  the line that links the database.

### Configuration

Set the database ID (or its URL) in `/config`, row `notionDatabaseId` of
`slax57-workflow`. Without it, the mod only toasts that it is not configured.

### Tests

```bash
claude plugin validate plugins/slax57-workflow
```

```bash
claude plugin test plugins/slax57-workflow
```

Tested with Claude Code 2.1.318.
