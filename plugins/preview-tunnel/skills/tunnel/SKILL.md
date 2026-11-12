---
name: tunnel
description: Start or restart the preview tunnel and give its tailnet URLs.
disable-model-invocation: true
allowed-tools: Bash(bash ${CLAUDE_SKILL_DIR}/scripts/preview-tunnel.sh up)
---

Run `bash ${CLAUDE_SKILL_DIR}/scripts/preview-tunnel.sh up` (allow it up to 5 minutes).

Answer with the URLs it printed on stdout and nothing else. If it failed, answer
with the error in one line instead. If it printed nothing at all, `TS_AUTHKEY`
is undefined in this environment: say so in one line.

For the rest of the session, the tunnel exposes this container's services on the
user's Tailscale tailnet. Run its other subcommands as
`bash ${CLAUDE_SKILL_DIR}/scripts/preview-tunnel.sh <subcommand>`:

- `url` prints the URLs: give them to the user whenever they want to see a
  change, rather than describing `127.0.0.1`.
- `up` again restarts what is missing, for instance after the container woke up
  from sleep (its processes died); it is idempotent.
- `serve <port> -- '<command using $PORT>'` exposes one more service, outside
  `.preview`; `down` stops the services.
- Never connect to the other machines of the tailnet: the tunnel exists so the
  user reaches this container, never the other way round.
