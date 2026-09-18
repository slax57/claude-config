# claude-config

My personal Claude Code configuration, packaged as a plugin marketplace so the same
skills load in a local terminal and in a [cloud session](https://code.claude.com/docs/en/claude-code-on-the-web).

## Plugins

| Plugin                                       | What it ships                                                                                 |
| -------------------------------------------- | --------------------------------------------------------------------------------------------- |
| [`slax57-workflow`](plugins/slax57-workflow) | `slax57-conventions`, `caveman`, `grilling`, `grill-me`, `write-pr-description`, `end-of-dev`, plus the `trello` MCP server |

## Install locally

```bash
claude plugin marketplace add slax57/claude-config
claude plugin install slax57-workflow@slax57
```

## Enable in cloud sessions

Plugins enabled in `~/.claude/settings.json` do **not** reach a cloud session. Commit the
declaration to the target repository's `.claude/settings.json` instead:

```json
{
  "extraKnownMarketplaces": {
    "slax57": {
      "source": { "source": "github", "repo": "slax57/claude-config" }
    }
  },
  "enabledPlugins": { "slax57-workflow@slax57": true }
}
```

The session installs the plugin at startup, so the environment needs network access to
GitHub.

## Why MCP servers live in a plugin

`mcpServers` in `~/.claude.json` is per-machine runtime state, and a hardened Dev
Container gets its own `.claude.json` in a private volume — so a server declared there
exists on the host and nowhere else. `~/.claude/plugins` *is* shared, read-only, with
every container and cloud session, so a plugin is the only declaration that follows the
configuration everywhere. Credentials stay out of this public repository: see
[plugins/slax57-workflow](plugins/slax57-workflow).
