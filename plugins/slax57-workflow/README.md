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
| `notion-notes`         | by the model, or `/notion-notes [branch]` | Creates or finds the Notion notes page for the repo and branch; URL only, never reads it |
| `tunnel`               | `/tunnel` only                    | Starts or restarts the preview tunnel and answers with its URLs                            |

`notion-notes` relies on the official Notion connector (claude.ai connectors), not on a
server shipped here. It writes to the database named by `NOTION_NOTES_DATABASE` (its URL
or id), which needs the properties `Name` (title), `Repo` (text) and `Branch` (text).
Set it like the Trello credentials below, or in the cloud environment's variables.

## Preview tunnel

In a cloud session where `TS_AUTHKEY` is defined, a `SessionStart` hook makes the
services the project declares in a `.preview` file reachable from your own devices,
through your Tailscale tailnet. The `preview-tunnel` script is on the Bash tool's `PATH`.
Without `TS_AUTHKEY`, it does nothing. Setup and usage:
[docs/preview-tunnel.md](docs/preview-tunnel.md).

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
    "TRELLO_TOKEN": "…",
    "NOTION_NOTES_DATABASE": "https://app.notion.com/p/…"
  }
}
```

Claude Code exports that `env` block into the session and expands `${VAR}` in a plugin's
`.mcp.json` against it. A server whose variables are unset starts and then fails to
authenticate.

Get a Trello key and token from <https://trello.com/power-ups/admin>.
