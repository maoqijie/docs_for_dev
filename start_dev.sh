#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

kill_port_if_busy() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    local pids
    pids="$(lsof -iTCP:"${port}" -sTCP:LISTEN -t 2>/dev/null || true)"
    if [[ -n "$pids" ]]; then
      echo "Port ${port} is busy, trying to stop: ${pids}"
      kill $pids 2>/dev/null || true
      sleep 1
    fi
  elif command -v fuser >/dev/null 2>&1; then
    echo "Port ${port} is busy, trying fuser cleanup"
    fuser -k "${port}/tcp" 2>/dev/null || true
    sleep 1
  elif command -v netstat >/dev/null 2>&1 && command -v taskkill >/dev/null 2>&1; then
    local pids
    pids="$(
      netstat -ano 2>/dev/null \
        | awk -v p=":${port}" '$1=="TCP" && $2 ~ p"$" && $4=="LISTENING" {print $5}' \
        | tr -d '\r' \
        | sort -u
    )"
    if [[ -n "$pids" ]]; then
      echo "Port ${port} is busy, trying taskkill: ${pids}"
      while IFS= read -r pid; do
        [[ -n "$pid" ]] || continue
        taskkill //PID "$pid" //F >/dev/null 2>&1 || true
      done <<< "$pids"
      sleep 1
    fi
  else
    echo "Cannot auto-check port ${port}: missing lsof/fuser/netstat/taskkill" >&2
  fi
}

show_top_x11_clients() {
  local display="$1"
  local display_number="${display#*:}"
  display_number="${display_number%%.*}"
  local x_socket="/tmp/.X11-unix/X${display_number}"

  if [[ -S "$x_socket" ]] && command -v lsof >/dev/null 2>&1; then
    echo "Top X11 client processes:"
    lsof -U "$x_socket" 2>/dev/null \
      | awk 'NR>1 {print $1, $2}' \
      | sort \
      | uniq -c \
      | sort -nr \
      | head -10
  fi
}

count_x11_clients() {
  local display="$1"
  local display_number="${display#*:}"
  display_number="${display_number%%.*}"
  local x_socket="/tmp/.X11-unix/X${display_number}"

  if [[ ! -S "$x_socket" ]] || ! command -v lsof >/dev/null 2>&1; then
    echo ""
    return 0
  fi

  {
    lsof -U "$x_socket" 2>/dev/null || true
  } \
    | awk 'NR>1 {print $2}' \
    | sort -u \
    | wc -l \
    | tr -d '[:space:]'
}

check_gui_backend() {
  local display="${DISPLAY:-}"
  local x11_client_soft_limit="${X11_CLIENT_SOFT_LIMIT:-240}"

  if [[ -z "$display" ]]; then
    echo "DISPLAY is not set, cannot start Tauri GUI." >&2
    return 1
  fi

  local client_count=""
  client_count="$(count_x11_clients "$display")"

  if [[ -n "$client_count" ]] && [[ "$client_count" =~ ^[0-9]+$ ]] && [[ "$client_count" -ge "$x11_client_soft_limit" ]]; then
    echo "X11 client count (${client_count}) is near limit (${x11_client_soft_limit})." >&2
    echo "Stop some GUI apps first, then retry." >&2
    echo "Example: X11_CLIENT_SOFT_LIMIT=300 ./start_dev.sh" >&2
    show_top_x11_clients "$display"
    return 1
  fi

  if command -v xdpyinfo >/dev/null 2>&1; then
    local check_err=""
    if ! check_err="$(xdpyinfo -display "$display" 2>&1 >/dev/null)"; then
      echo "Cannot access display server: ${display}" >&2

      if [[ "$check_err" == *"Maximum number of clients reached"* ]]; then
        echo "X11 max clients reached; GTK init will fail." >&2
        show_top_x11_clients "$display"
      elif [[ "$check_err" == *"MIT-MAGIC-COOKIE-1"* ]]; then
        echo "X11 auth failed (MIT-MAGIC-COOKIE-1)." >&2
      else
        echo "$check_err" >&2
      fi

      return 1
    fi
  fi
}

check_gui_backend

cd "$ROOT_DIR/UI"
kill_port_if_busy "${FRONTEND_PORT}"
echo "Start frontend: Vite --host --port ${FRONTEND_PORT}"
npm run dev -- --host --port "${FRONTEND_PORT}" --strictPort &
UI_PID=$!

cleanup() {
  echo "Cleanup frontend process ${UI_PID}"
  kill "${UI_PID}" 2>/dev/null || true
}
trap cleanup EXIT

cd "$ROOT_DIR/Backend/src-tauri"
echo "Start backend: cargo tauri dev"
check_gui_backend
cargo tauri dev
