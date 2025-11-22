#!/usr/bin/env bash
set -euo pipefail

# 项目根目录
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

kill_port_if_busy() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    local pids
    pids="$(lsof -iTCP:"${port}" -sTCP:LISTEN -t 2>/dev/null || true)"
    if [[ -n "$pids" ]]; then
      echo "检测到端口 ${port} 被占用，尝试清理：${pids}"
      kill $pids 2>/dev/null || true
      sleep 1
    fi
  elif command -v fuser >/dev/null 2>&1; then
    echo "检测到端口 ${port} 被占用，尝试通过 fuser 清理"
    fuser -k "${port}/tcp" 2>/dev/null || true
    sleep 1
  else
    echo "无法检测端口占用：缺少 lsof 或 fuser，请手动确认端口 ${port}" >&2
  fi
}

# 读取 CODEX_API_KEY：优先环境变量，次选 ~/.codex/auth.json 的 OPENAI_API_KEY
if [[ -z "${CODEX_API_KEY:-}" ]]; then
  if [[ -f "$HOME/.codex/auth.json" ]]; then
    CODEX_API_KEY="$(jq -r '.OPENAI_API_KEY // empty' "$HOME/.codex/auth.json")"
  fi
fi

if [[ -z "${CODEX_API_KEY:-}" ]]; then
  echo "缺少 CODEX_API_KEY（环境变量或 ~/.codex/auth.json 的 OPENAI_API_KEY）" >&2
  exit 1
fi

# 启动前端 Dev Server
cd "$ROOT_DIR/UI"
kill_port_if_busy "${FRONTEND_PORT}"
echo "启动前端: Vite --host --port ${FRONTEND_PORT}"
# 使用 --strictPort，端口占用时直接失败，避免 Tauri devUrl 与实际端口不一致
npm run dev -- --host --port "${FRONTEND_PORT}" --strictPort &
UI_PID=$!

cleanup() {
  echo "清理前端进程 ${UI_PID}"
  kill "${UI_PID}" 2>/dev/null || true
}
trap cleanup EXIT

# 启动 Tauri 后端（传入 CODEX_API_KEY）
cd "$ROOT_DIR/Backend/src-tauri"
echo "启动后端: cargo tauri dev"
CODEX_API_KEY="${CODEX_API_KEY}" cargo tauri dev
