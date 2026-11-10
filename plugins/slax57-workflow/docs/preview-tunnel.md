# Preview tunnel

A Claude Code on the web session runs in a cloud container nobody can reach.
The preview tunnel makes the services started in that container reachable from **your
own devices**, through your Tailscale tailnet: a private network, no public URL.

[`skills/tunnel/scripts/preview-tunnel`](../skills/tunnel/scripts/preview-tunnel) runs a Tailscale node in the
container (userspace networking: no root, no TUN), joins the tailnet, starts the
services the project declares in a `.preview` file at its root and prints their
URLs. It knows nothing about the project's stack: only ports and commands.

Without `TS_AUTHKEY`, the whole thing is inactive: every subcommand exits 0 and
prints nothing. A local terminal or Dev Container is therefore unaffected.

| Ships | What it does |
| --- | --- |
| `SessionStart` hook | starts the tunnel in the background and tells Claude how to use it |
| `skills/tunnel/scripts/preview-tunnel` | the script; the hook gives Claude its absolute path |
| `/tunnel` | starts or restarts the tunnel and answers with the URLs |

## Enable it in a project

It ships with `slax57-workflow`, so the cloud session must load that plugin
([see the README](../../../README.md#enable-in-cloud-sessions)). Then commit a
[`.preview`](#preview) file at the project's root, and define `TS_AUTHKEY` in the
cloud environment (below).

## One-time setup, in the Tailscale admin console

1. **Declare the tag** and **restrict what it reaches**, in *Access controls*.
   Your devices reach each other and the cloud containers, on the preview ports
   only; the containers reach nothing (no rule has the tag as `src`):
   ```jsonc
   {
     "tagOwners": {
       "tag:claude-cloud": ["autogroup:admin"],
     },
     "acls": [
       {"action": "accept", "src": ["autogroup:member"], "dst": ["autogroup:member:*"]},
       {"action": "accept", "src": ["autogroup:member"], "dst": ["tag:claude-cloud:8000,8025"]},
     ],
   }
   ```
   Replace the default *allow all* rule with these, and list every port the
   projects' `.preview` files declare. This ACL is what restricts the exposed
   ports: in userspace mode, **every** port listening on `127.0.0.1` in the
   container is reachable at its tailnet address.
2. **Create an auth key** in *Settings → Keys → Generate auth key*:
   *Reusable*, *Ephemeral* (the node disappears shortly after the container
   goes away), *Tags*: `tag:claude-cloud`. A key expires after 90 days at most:
   generate a new one then.

## One-time setup, in the cloud environment

In the environment settings of Claude Code on the web:

- **Network access**: add `*.tailscale.com` (package download, control plane,
  DERP relays), plus GitHub for the plugin itself.
- **Environment variables**: `TS_AUTHKEY=<the auth key>`.

The container has no direct UDP: Tailscale goes through the HTTPS proxy and the
DERP relays. It works, with a few tens of milliseconds of latency.

## How it runs

The `SessionStart` hook calls `preview-tunnel hook`, which starts `up` in a
detached process and returns at once. `up`:

1. installs the static `tailscale` and `tailscaled` binaries into
   `~/.preview/bin` (first run only);
2. starts `tailscaled` in userspace mode, or restarts it when `HTTPS_PROXY`
   changed (it reads the proxy only at start-up);
3. joins the tailnet as `claude-<branch>` unless it is already connected. The
   name is computed once and stored in `~/.preview/hostname`, so a woken-up
   container comes back under the same name;
4. waits for a running `npm install` to finish (the cloud runs one at start-up,
   5 minutes max), then starts every service whose port is not listening yet,
   and waits until it is (90 s max);
5. prints the URLs.

The container falls asleep after about 10 minutes of inactivity: processes die,
files stay, and `SessionStart` fires again on wake-up. Everything above restarts
from the state kept in `~/.preview`. A `flock` on `~/.preview/lock` keeps the
hook and a manual `up` from running together.

The hook also records the project directory in `~/.preview/project`, so a manual
run reads the same `.preview` whatever its working directory.

## Instructions given to Claude

The hook's output, added to the session's context, tells Claude to:

- give the user the URLs `url` prints whenever they want to see a
  change, rather than describing `127.0.0.1`;
- use `up`, `serve` and `down` to manage the services;
- **never connect to the other machines of the tailnet**: the tunnel exists so
  the user reaches the container, never the other way round.

## `.preview`

One line per service, `name port command`, the command running to the end of
the line. Empty lines and `#` comments are ignored.

```
# name  port  command
web     8000  python3 -m http.server $PORT --bind 127.0.0.1
```

The command runs through `bash -c` from the project root, so variables are
expanded when the service starts. It must listen on `127.0.0.1` (or all
interfaces) **on the declared port**: force it on the command line. A command
that exits is fine as long as its port answers within 15 s (a daemon, a set of
containers); otherwise the start fails with the end of the service log.

Without `.preview`, `up` only joins the tailnet.

A project whose own `SessionStart` hook already starts its server should skip
that start when `TS_AUTHKEY` is defined, and leave it to the tunnel.

### Variables given to each command

| Variable | Value |
| --- | --- |
| `TUNNEL_HOST` | the container's tailnet IPv4 address (read again at every start) |
| `TUNNEL_NAME` | its MagicDNS name, without the final dot |
| `PORT` | the port declared for the service |

The script adds nothing framework-specific: translating these into the
project's own configuration (an allowed host, a base URL) is the project's job.

The container cannot reach its own tailnet address: tests driving a browser
must start their own server on another port, never reuse the preview one.

## Subcommands

`preview-tunnel` stands for the script's path, which the hook gives Claude.

| Command | Effect |
| --- | --- |
| `preview-tunnel hook` | `up` in the background; meant for `SessionStart` |
| `preview-tunnel up` | install, connect, start the services, print the URLs; idempotent |
| `preview-tunnel serve <port> -- <command>` | expose one more service, outside `.preview`; it is recorded and restarted like the others. Quote `'$PORT'` so it expands at start-up |
| `preview-tunnel url` | print the URLs |
| `preview-tunnel down` | stop the managed services and forget the `serve` ones; the node stays on the tailnet |

A service is identified by a `PREVIEW_SERVICE_ID` variable in its environment:
`down` only kills processes carrying it, so a PID reused after a wake-up is never
killed by mistake, and a command that daemonizes is still found.

`PREVIEW_TIMEOUT` (default 90) and `PREVIEW_EXIT_GRACE` (default 15) tune the
waits, in seconds; `PREVIEW_STATE_DIR` moves `~/.preview`.

## Logs

Everything is under `~/.preview/`:

- `preview.log`: the script;
- `tailscaled.log`: the Tailscale daemon;
- `services/<name>.log`: one per service.

## Known limit

If joining the tailnet fails at start-up, no service of `.preview` starts: run
`preview-tunnel up` again, or start the server by hand.

## Moving to Headscale

Define `TS_LOGIN_SERVER=https://<headscale host>` (and allow that host in the
environment's network access), replace `TS_AUTHKEY` with a Headscale pre-auth
key, then delete `~/.preview/tailscaled.state` so the node registers again.
Nothing else changes.
