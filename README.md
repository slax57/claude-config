# claude-config

My personal Claude Code configuration, packaged as a plugin marketplace so the same
skills load in a local terminal and in a [cloud session](https://code.claude.com/docs/en/claude-code-on-the-web).

## Plugins

| Plugin                                       | What it ships                                                                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| [`slax57-workflow`](plugins/slax57-workflow) | `slax57-conventions`, `grilling`, `grill-me`, `write-pr-description`, `end-of-dev`, `prepare-demo`, `notion-notes`, the `trello` MCP server |
| [`preview-tunnel`](plugins/preview-tunnel)   | `/tunnel`: exposes a cloud session's services on your Tailscale tailnet                                                                |

## Install locally

```bash
claude plugin marketplace add slax57/claude-config
claude plugin install slax57-workflow@slax57
claude plugin install preview-tunnel@slax57
```

## Enable in cloud sessions

Enable the plugins on claude.ai, in the *Customize* section of Claude Code. Each new
cloud session then syncs them into `~/.claude/plugins/synced/`, hooks and MCP servers
included.

- A plugin hosted on claude.ai may not ship a top-level `bin/` directory: claude.ai
  rejects the whole marketplace. Keep scripts inside a skill or call them from a hook.
- A new version can take a while to reach claude.ai after a merge.
- Nothing else carries a plugin into a cloud session: neither `~/.claude/settings.json`
  nor a repository's `.claude/settings.json` (`enabledPlugins`,
  `extraKnownMarketplaces`). See
  [what carries over from your setup](https://code.claude.com/docs/en/cloud-environments#what-carries-over-from-your-setup).

## Why MCP servers live in a plugin

`mcpServers` in `~/.claude.json` is per-machine runtime state, and a hardened Dev
Container gets its own `.claude.json` in a private volume — so a server declared there
exists on the host and nowhere else. `~/.claude/plugins` *is* shared, read-only, with
every container, and claude.ai syncs the plugin into cloud sessions, so a plugin is the
only declaration that follows the configuration everywhere. Credentials stay out of this
public repository: see [plugins/slax57-workflow](plugins/slax57-workflow).
