---
name: tunnel
description: Start or restart the preview tunnel and give its tailnet URLs.
disable-model-invocation: true
allowed-tools: Bash(preview-tunnel up)
---

Run `preview-tunnel up` (allow it up to 5 minutes).

Answer with the URLs it printed on stdout and nothing else. If it failed, answer
with the error in one line instead. If it printed nothing at all, `TS_AUTHKEY`
is undefined in this environment: say so in one line.
