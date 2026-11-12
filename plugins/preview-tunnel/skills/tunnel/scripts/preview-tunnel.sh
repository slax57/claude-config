#!/usr/bin/env bash
# preview-tunnel: makes the services of a cloud container reachable from the
# owner's tailnet, through a userspace Tailscale node. Stack-agnostic: it only
# knows ports and commands, declared in the project's `.preview` file.
#
# Usage: preview-tunnel.sh up | serve <port> -- <command> | url | down
# Documentation: https://github.com/slax57/claude-config/blob/main/plugins/preview-tunnel/README.md
#
# Every subcommand is a silent no-op (exit 0) when TS_AUTHKEY is undefined.

set -uo pipefail

SELF=$(readlink -f "${BASH_SOURCE[0]}")
STATE_DIR="${PREVIEW_STATE_DIR:-$HOME/.preview}"
BIN_DIR="$STATE_DIR/bin"
SERVICES_DIR="$STATE_DIR/services"
LOG_FILE="$STATE_DIR/preview.log"
LOCK_FILE="$STATE_DIR/lock"
ADHOC_FILE="$STATE_DIR/adhoc.tsv"
TS_STATE="$STATE_DIR/tailscaled.state"
TS_SOCKET="$STATE_DIR/tailscaled.sock"
TS_PID_FILE="$STATE_DIR/tailscaled.pid"
TS_PROXY_FILE="$STATE_DIR/tailscaled.proxy"
TS_LOG="$STATE_DIR/tailscaled.log"
HOSTNAME_FILE="$STATE_DIR/hostname"
PROJECT_FILE="$STATE_DIR/project"

SERVICE_TIMEOUT="${PREVIEW_TIMEOUT:-90}"
EXIT_GRACE="${PREVIEW_EXIT_GRACE:-15}"
NPM_TIMEOUT=300
LOCK_TIMEOUT=150
NPM_PATTERN='^(npm|node [^ ]*npm[^ ]*) (install|ci|i)( |$)'

PROJECT_DIR=""
CONFIG_FILE=""

TUNNEL_HOST=""
TUNNEL_NAME=""

log() {
    local line
    line="[$(date '+%F %T')] $*"
    printf '%s\n' "$line" >&2
    printf '%s\n' "$line" >>"$LOG_FILE"
}

die() {
    log "error: $*"
    exit 1
}

ts() {
    "$BIN_DIR/tailscale" --socket="$TS_SOCKET" "$@"
}

port_open() {
    (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null
}

# Runs once per execution: every process started afterwards must close fd 9.
take_lock() {
    exec 9>"$LOCK_FILE"
    flock -w "$LOCK_TIMEOUT" 9 || die "another preview-tunnel.sh run still holds $LOCK_FILE after ${LOCK_TIMEOUT}s"
}

# --- Tailscale --------------------------------------------------------------

install_tailscale() {
    [ -x "$BIN_DIR/tailscale" ] && [ -x "$BIN_DIR/tailscaled" ] && return 0

    local arch tgz tmp
    case "$(uname -m)" in
        x86_64) arch=amd64 ;;
        aarch64 | arm64) arch=arm64 ;;
        *) die "unsupported architecture $(uname -m)" ;;
    esac
    log "installing Tailscale ($arch) into $BIN_DIR"
    tgz=$(curl -fsSL 'https://pkgs.tailscale.com/stable/?mode=json' | grep -o "tailscale_[0-9.]*_${arch}\.tgz" | head -n 1)
    [ -n "$tgz" ] || die "cannot find the Tailscale package name on pkgs.tailscale.com"

    tmp=$(mktemp -d "$STATE_DIR/download.XXXXXX")
    if ! curl -fsSL "https://pkgs.tailscale.com/stable/$tgz" -o "$tmp/tailscale.tgz" \
        || ! tar -xzf "$tmp/tailscale.tgz" -C "$tmp" --strip-components=1 --wildcards '*/tailscale' '*/tailscaled'; then
        rm -rf "$tmp"
        die "cannot download or extract $tgz"
    fi
    mkdir -p "$BIN_DIR"
    mv "$tmp/tailscale" "$tmp/tailscaled" "$BIN_DIR/"
    rm -rf "$tmp"
}

tailscaled_running() {
    local pid
    pid=$(cat "$TS_PID_FILE" 2>/dev/null) || return 1
    [ -n "$pid" ] && tr '\0' ' ' 2>/dev/null <"/proc/$pid/cmdline" | grep -qF -- "--socket=$TS_SOCKET"
}

# tailscaled reads HTTPS_PROXY once, at start-up: a container woken up with a
# new proxy port needs a fresh daemon.
start_tailscaled() {
    if tailscaled_running; then
        if [ "$(cat "$TS_PROXY_FILE" 2>/dev/null)" = "${HTTPS_PROXY:-}" ]; then
            return 0
        fi
        log "HTTPS_PROXY changed, restarting tailscaled"
        kill "$(cat "$TS_PID_FILE")" 2>/dev/null
        sleep 1
    fi

    log "starting tailscaled (userspace networking)"
    rm -f "$TS_SOCKET"
    setsid nohup "$BIN_DIR/tailscaled" \
        --tun=userspace-networking \
        --state="$TS_STATE" \
        --socket="$TS_SOCKET" \
        --no-logs-no-support \
        >>"$TS_LOG" 2>&1 </dev/null 9>&- &
    echo $! >"$TS_PID_FILE"
    printf '%s' "${HTTPS_PROXY:-}" >"$TS_PROXY_FILE"

    local i
    for i in $(seq 1 30); do
        ts status --json >/dev/null 2>&1 && return 0
        tailscaled_running || break
        sleep 1
    done
    tail -n 20 "$TS_LOG" >&2
    die "tailscaled does not answer (log: $TS_LOG)"
}

backend_state() {
    ts status --json --peers=false 2>/dev/null | grep -m1 -o '"BackendState": *"[A-Za-z]*"' | sed 's/.*"\([A-Za-z]*\)"$/\1/'
}

# Computed once from the git branch, then kept on disk so that a woken-up
# container comes back under the same name.
node_name() {
    if [ ! -s "$HOSTNAME_FILE" ]; then
        local branch name
        branch=$(git -C "$PROJECT_DIR" branch --show-current 2>/dev/null)
        name=$(printf '%s' "${branch:-preview}" | tr '[:upper:]' '[:lower:]' | sed -e 's/[^a-z0-9]\{1,\}/-/g' -e 's/^-//' -e 's/^claude-//' -e 's/-$//')
        name=$(printf 'claude-%s' "${name:-preview}" | cut -c 1-63 | sed 's/-*$//')
        printf '%s\n' "$name" >"$HOSTNAME_FILE"
    fi
    cat "$HOSTNAME_FILE"
}

join_tailnet() {
    local state i
    # A restarted daemon reconnects by itself from its state file.
    for i in $(seq 1 15); do
        state=$(backend_state)
        case "$state" in NoState | Starting | '') sleep 1 ;; *) break ;; esac
    done
    if [ "$state" != Running ]; then
        local args=(up --auth-key="$TS_AUTHKEY" --hostname="$(node_name)" --accept-dns=false --timeout=60s)
        [ -n "${TS_LOGIN_SERVER:-}" ] && args+=(--login-server="$TS_LOGIN_SERVER")
        log "joining the tailnet as $(node_name) (state: ${state:-unknown})"
        ts "${args[@]}" 9>&- || die "tailscale up failed (daemon log: $TS_LOG)"
    fi
    read_tunnel_address || die "the node has no tailnet address"
}

read_tunnel_address() {
    TUNNEL_HOST=$(ts ip -4 2>/dev/null | head -n 1)
    TUNNEL_NAME=$(ts status --json --peers=false 2>/dev/null | grep -m1 -o '"DNSName": *"[^"]*"' | sed -e 's/.*"\([^"]*\)"$/\1/' -e 's/\.$//')
    [ -n "$TUNNEL_HOST" ]
}

# --- Services ---------------------------------------------------------------

# Prints one "name<TAB>port<TAB>cwd<TAB>command" line per service: `.preview`
# first, then the services registered with `serve`.
list_services() {
    if [ -f "$CONFIG_FILE" ]; then
        local line name port cmd
        while IFS= read -r line || [ -n "$line" ]; do
            line="${line#"${line%%[![:space:]]*}"}"
            case "$line" in '' | '#'*) continue ;; esac
            read -r name port cmd <<<"$line"
            if ! [[ "$name" =~ ^[A-Za-z0-9_.-]+$ && "$port" =~ ^[0-9]+$ && -n "$cmd" ]]; then
                log "ignoring malformed .preview line: $line"
                continue
            fi
            printf '%s\t%s\t%s\t%s\n' "$name" "$port" "$PROJECT_DIR" "$cmd"
        done <"$CONFIG_FILE"
    fi
    [ -f "$ADHOC_FILE" ] && cat "$ADHOC_FILE"
}

service_pids() {
    local id="$1" env
    for env in /proc/[0-9]*/environ; do
        tr '\0' '\n' 2>/dev/null <"$env" | grep -qxF "PREVIEW_SERVICE_ID=$id" && { env="${env#/proc/}"; echo "${env%/environ}"; }
    done
}

# True when the recorded process still runs and still carries the service id:
# a PID can be reused by an unrelated process after the container wakes up.
service_alive() {
    local name="$1" pid id
    pid=$(cat "$SERVICES_DIR/$name.pid" 2>/dev/null) || return 1
    id=$(cat "$SERVICES_DIR/$name.id" 2>/dev/null) || return 1
    tr '\0' '\n' 2>/dev/null <"/proc/$pid/environ" | grep -qxF "PREVIEW_SERVICE_ID=$id"
}

stop_service() {
    local name="$1" id pid i
    local -a pids
    id=$(cat "$SERVICES_DIR/$name.id" 2>/dev/null) || { rm -f "$SERVICES_DIR/$name".{pid,id}; return 0; }
    for i in 1 2 3 4 5 6 7 8 9 10; do
        mapfile -t pids < <(service_pids "$id")
        [ "${#pids[@]}" -eq 0 ] && break
        for pid in "${pids[@]}"; do
            if [ "$i" -lt 10 ]; then kill -TERM -- "-$pid" "$pid" 2>/dev/null; else kill -KILL -- "-$pid" "$pid" 2>/dev/null; fi
        done
        sleep 1
    done
    rm -f "$SERVICES_DIR/$name".{pid,id}
    log "stopped $name"
}

start_service() {
    local name="$1" port="$2" cwd="$3" cmd="$4" svc_log="$SERVICES_DIR/$1.log" id
    if port_open "$port"; then
        log "$name: port $port already listening"
        return 0
    fi
    if service_alive "$name"; then
        log "$name: still starting, waiting for port $port"
    else
        id="$name-$(date +%s%N)-$RANDOM"
        log "$name: starting on port $port: $cmd"
        printf '\n--- %s: %s\n' "$(date '+%F %T')" "$cmd" >>"$svc_log"
        (
            cd "$cwd" || exit 1
            PREVIEW_SERVICE_ID="$id" TUNNEL_HOST="$TUNNEL_HOST" TUNNEL_NAME="$TUNNEL_NAME" PORT="$port" \
                setsid nohup bash -c "$cmd" >>"$svc_log" 2>&1 </dev/null 9>&- &
            echo $! >"$SERVICES_DIR/$name.pid"
        )
        echo "$id" >"$SERVICES_DIR/$name.id"
    fi

    # Some commands start the service elsewhere then exit (e.g. containers):
    # once the command is gone, the port gets a short grace period.
    local deadline=$((SECONDS + SERVICE_TIMEOUT)) exited_at=""
    while [ "$SECONDS" -lt "$deadline" ]; do
        port_open "$port" && { log "$name: ready on port $port"; return 0; }
        if [ -z "$exited_at" ] && ! service_alive "$name"; then
            exited_at=$SECONDS
        fi
        [ -n "$exited_at" ] && [ $((SECONDS - exited_at)) -ge "$EXIT_GRACE" ] && break
        sleep 1
    done
    log "$name: last lines of $svc_log:"
    tail -n 20 "$svc_log" >&2
    log "$name: nothing is listening on port $port: does the command really listen on that port?"
    return 1
}

# The cloud runs its own `npm install` when the container starts: a service
# started meanwhile would see a half-written node_modules.
wait_for_package_install() {
    local deadline=$((SECONDS + NPM_TIMEOUT)) said=""
    while [ "$SECONDS" -lt "$deadline" ]; do
        npm_running || return 0
        [ -n "$said" ] || { log "waiting for a running npm install to finish"; said=1; }
        sleep 2
    done
    log "npm install still running after ${NPM_TIMEOUT}s, starting the services anyway"
}

npm_running() {
    local f
    for f in /proc/[0-9]*/cmdline; do
        [ "${f#/proc/}" = "$$/cmdline" ] && continue
        tr '\0' ' ' 2>/dev/null <"$f" | grep -Eq "$NPM_PATTERN" && return 0
    done
    return 1
}

start_services() {
    local name port cwd cmd failed=0
    wait_for_package_install
    while IFS=$'\t' read -r name port cwd cmd; do
        start_service "$name" "$port" "$cwd" "$cmd" || failed=1
    done < <(list_services)
    return "$failed"
}

print_urls() {
    read_tunnel_address || { echo "The tunnel is down: run $SELF up." >&2; return 1; }
    local name port cwd cmd any="" down
    while IFS=$'\t' read -r name port cwd cmd; do
        any=1
        down=""
        port_open "$port" || down=" [not listening]"
        if [ -n "$TUNNEL_NAME" ]; then
            printf '%s: http://%s:%s/ (http://%s:%s/)%s\n' "$name" "$TUNNEL_NAME" "$port" "$TUNNEL_HOST" "$port" "$down"
        else
            printf '%s: http://%s:%s/%s\n' "$name" "$TUNNEL_HOST" "$port" "$down"
        fi
    done < <(list_services 2>/dev/null)
    [ -n "$any" ] || printf 'Tailnet node %s (%s), no service declared.\n' "${TUNNEL_NAME:-?}" "$TUNNEL_HOST"
}

report_urls() {
    print_urls | tee -a "$LOG_FILE"
}

# --- Subcommands ------------------------------------------------------------

cmd_up() {
    take_lock
    install_tailscale
    start_tailscaled
    join_tailnet
    local status=0
    start_services || status=1
    report_urls
    return "$status"
}

cmd_serve() {
    local port="${1:-}"
    shift || true
    [ "${1:-}" = -- ] && shift
    [[ "$port" =~ ^[0-9]+$ ]] && [ "$#" -gt 0 ] || die "usage: preview-tunnel.sh serve <port> -- <command>"
    local cmd="$*" name="port-$port"
    [[ "$cmd" != *$'\n'* ]] || die "the command must hold on one line"

    take_lock
    if list_services | cut -f 2 | grep -qx "$port" && ! grep -q "^$name"$'\t' "$ADHOC_FILE" 2>/dev/null; then
        die "port $port is already declared in $CONFIG_FILE"
    fi
    { grep -v "^$name"$'\t' "$ADHOC_FILE" 2>/dev/null; printf '%s\t%s\t%s\t%s\n' "$name" "$port" "$PWD" "$cmd"; } >"$ADHOC_FILE.tmp"
    mv "$ADHOC_FILE.tmp" "$ADHOC_FILE"
    log "registered $name: $cmd"

    install_tailscale
    start_tailscaled
    join_tailnet
    local status=0
    start_service "$name" "$port" "$PWD" "$cmd" || status=1
    report_urls
    return "$status"
}

cmd_down() {
    take_lock
    local f
    for f in "$SERVICES_DIR"/*.id; do
        [ -e "$f" ] || continue
        f="${f##*/}"
        stop_service "${f%.id}"
    done
    rm -f "$ADHOC_FILE"
}

# `up` records the project it started, so the other subcommands read the same
# .preview whatever their working directory.
resolve_project_dir() {
    if [ "$1" != up ] && [ -s "$PROJECT_FILE" ] && [ -d "$(cat "$PROJECT_FILE")" ]; then
        PROJECT_DIR=$(cat "$PROJECT_FILE")
    else
        PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
        [ "$1" != up ] || printf '%s\n' "$PROJECT_DIR" >"$PROJECT_FILE"
    fi
    CONFIG_FILE="$PROJECT_DIR/.preview"
}

main() {
    [ -n "${TS_AUTHKEY:-}" ] || exit 0
    mkdir -p "$STATE_DIR" "$SERVICES_DIR"
    resolve_project_dir "${1:-}"
    case "${1:-}" in
        up) cmd_up ;;
        serve) shift; cmd_serve "$@" ;;
        url) print_urls ;;
        down) cmd_down ;;
        *) echo "usage: preview-tunnel.sh up | serve <port> -- <command> | url | down" >&2; exit 2 ;;
    esac
}

main "$@"
