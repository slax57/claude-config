# slax57-workflow

## Skills

| Skill                  | Invoked                           | What it does                                                                               |
| ---------------------- | --------------------------------- | ------------------------------------------------------------------------------------------ |
| `slax57-conventions`   | by the model                      | Standing conventions: terse output, scope discipline, PR handling, requirements interviews |
| `caveman`              | `/caveman [level]`                | Compressed output style, six intensity levels                                              |
| `grilling`             | by the model, or a "grill" phrase | Requirements interview run as a design tree, one round of `AskUserQuestion` at a time      |
| `grill-me`             | `/grill-me` only                  | Alias that delegates to `grilling`                                                         |
| `write-pr-description` | by the model                      | PR description structure, length ceiling, tone                                             |
| `end-of-dev`           | `/end-of-dev`                     | Post-validation wrap-up: commit, three parallel review lanes, triage, fixes, PR draft      |

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
