# claude-config

My personal Claude Code configuration, packaged as a plugin marketplace so the same
skills load in a local terminal and in a [cloud session](https://code.claude.com/docs/en/claude-code-on-the-web).

## Plugins

| Plugin                                       | What it ships                                                                                 |
| -------------------------------------------- | --------------------------------------------------------------------------------------------- |
| [`slax57-workflow`](plugins/slax57-workflow) | `slax57-conventions`, `grilling`, `grill-me`, `write-pr-description`, `end-of-dev`, `prepare-demo`, `notion-notes`, `tunnel`, the `trello` MCP server and the preview tunnel hook |

## Install locally

```bash
claude plugin marketplace add slax57/claude-config
claude plugin install slax57-workflow@slax57
```

## Enable in cloud sessions

A cloud session installs neither the plugins enabled in `~/.claude/settings.json` nor
the ones a repository declares in its `.claude/settings.json` (`enabledPlugins`,
`extraKnownMarketplaces`): see
[what carries over from your setup](https://code.claude.com/docs/en/cloud-environments#what-carries-over-from-your-setup).
Skills enabled on claude.ai do reach it.

How to load these plugins in a cloud session is not settled yet.

## Why MCP servers live in a plugin

`mcpServers` in `~/.claude.json` is per-machine runtime state, and a hardened Dev
Container gets its own `.claude.json` in a private volume — so a server declared there
exists on the host and nowhere else. `~/.claude/plugins` *is* shared, read-only, with
every container, so a plugin is the only declaration that follows the configuration
into them. Credentials stay out of this public repository: see
[plugins/slax57-workflow](plugins/slax57-workflow).
