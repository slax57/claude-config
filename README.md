# claude-config

My personal Claude Code configuration, packaged as a plugin marketplace so the same
skills load in a local terminal and in a [cloud session](https://code.claude.com/docs/en/claude-code-on-the-web).

## Plugins

| Plugin                                       | What it ships                                                                                 |
| -------------------------------------------- | --------------------------------------------------------------------------------------------- |
| [`slax57-workflow`](plugins/slax57-workflow) | `slax57-conventions`, `caveman`, `grilling`, `grill-me`, `write-pr-description`, `end-of-dev` |

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
