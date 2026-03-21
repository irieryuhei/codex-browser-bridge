#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="${ROOT_DIR}/.codex-browser-bridge/run"
PID_FILE="${RUN_DIR}/bridge.pid"
LOG_FILE="${RUN_DIR}/bridge.log"
DIST_ENTRY="${ROOT_DIR}/dist/src/index.js"
BRIDGE_PORT="${BRIDGE_PORT:-${PORT:-8765}}"
COMMAND="${1:-start}"

read_pid() {
  if [[ ! -f "${PID_FILE}" ]]; then
    return 1
  fi

  local pid
  pid="$(tr -d '[:space:]' < "${PID_FILE}")"
  if [[ -z "${pid}" ]]; then
    return 1
  fi

  printf '%s\n' "${pid}"
}

is_running() {
  local pid="${1:-}"
  [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null
}

command_for_pid() {
  local pid="${1:-}"
  ps -p "${pid}" -o command= 2>/dev/null || true
}

parent_pid() {
  local pid="${1:-}"
  ps -p "${pid}" -o ppid= 2>/dev/null | tr -d '[:space:]'
}

find_matching_pids() {
  local pattern="${1}"
  ps -ax -o pid= -o command= | awk -v root="${ROOT_DIR}" -v pattern="${pattern}" '
    index($0, root) && index($0, pattern) { print $1 }
  '
}

bridge_root_pid() {
  local current_pid="${1:-}"
  local candidate_pid=""

  while [[ -n "${current_pid}" && "${current_pid}" != "1" ]]; do
    local command
    command="$(command_for_pid "${current_pid}")"
    if [[ "${command}" == *"${ROOT_DIR}"* ]]; then
      if [[ "${command}" == *"tsx watch src/index.ts"* ]]; then
        printf '%s\n' "${current_pid}"
        return 0
      fi
      if [[ "${command}" == *"dist/src/index.js"* || "${command}" == *"src/index.ts"* ]]; then
        candidate_pid="${current_pid}"
      fi
    fi

    local next_pid
    next_pid="$(parent_pid "${current_pid}")"
    if [[ -z "${next_pid}" || "${next_pid}" == "${current_pid}" ]]; then
      break
    fi
    current_pid="${next_pid}"
  done

  if [[ -n "${candidate_pid}" ]]; then
    printf '%s\n' "${candidate_pid}"
  fi
}

collect_target_pids() {
  {
    read_pid 2>/dev/null || true
    find_matching_pids "tsx watch src/index.ts"
    find_matching_pids "dist/src/index.js"

    while IFS= read -r port_pid; do
      [[ -z "${port_pid}" ]] && continue
      bridge_root_pid "${port_pid}"
    done < <(lsof -tiTCP:"${BRIDGE_PORT}" -sTCP:LISTEN 2>/dev/null || true)
  } | awk 'NF && !seen[$1]++ { print $1 }'
}

child_pids() {
  local parent_pid="${1:-}"
  if command -v pgrep >/dev/null 2>&1; then
    pgrep -P "${parent_pid}" || true
    return
  fi

  ps -ax -o pid= -o ppid= | awk -v target="${parent_pid}" '$2 == target { print $1 }'
}

kill_tree() {
  local signal="${1}"
  local target_pid="${2}"
  local child_pid

  while IFS= read -r child_pid; do
    [[ -z "${child_pid}" ]] && continue
    kill_tree "${signal}" "${child_pid}"
  done < <(child_pids "${target_pid}")

  if is_running "${target_pid}"; then
    kill "-${signal}" "${target_pid}" 2>/dev/null || true
  fi
}

stop_bridge() {
  local target_pids=()
  local pid

  while IFS= read -r pid; do
    [[ -z "${pid}" ]] && continue
    if is_running "${pid}"; then
      target_pids+=("${pid}")
    fi
  done < <(collect_target_pids)

  if [[ "${#target_pids[@]}" -eq 0 ]]; then
    rm -f "${PID_FILE}"
    echo "bridge は起動していません。"
    return 0
  fi

  for pid in "${target_pids[@]}"; do
    kill_tree TERM "${pid}"
  done

  for _ in {1..20}; do
    local remaining=0
    for pid in "${target_pids[@]}"; do
      if is_running "${pid}"; then
        remaining=1
        break
      fi
    done
    if [[ "${remaining}" -eq 0 ]]; then
      rm -f "${PID_FILE}"
      echo "bridge を停止しました。"
      return 0
    fi
    sleep 0.25
  done

  for pid in "${target_pids[@]}"; do
    kill_tree KILL "${pid}"
  done
  sleep 0.25

  for pid in "${target_pids[@]}"; do
    if is_running "${pid}"; then
      echo "bridge を停止できませんでした。PID: ${pid}" >&2
      return 1
    fi
  done

  rm -f "${PID_FILE}"
  echo "bridge を停止しました。"
}

start_bridge() {
  mkdir -p "${RUN_DIR}"

  if [[ ! -d "${ROOT_DIR}/node_modules" ]]; then
    echo "依存関係が見つかりません。先に 'npm install' を実行してください。" >&2
    return 1
  fi

  if existing_pid="$(read_pid 2>/dev/null)" && is_running "${existing_pid}"; then
    echo "bridge は既に起動しているため、停止してから再起動します。"
    stop_bridge
  elif lsof -tiTCP:"${BRIDGE_PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "bridge がポート ${BRIDGE_PORT} で起動しているため、停止してから再起動します。"
    stop_bridge
  fi

  rm -f "${PID_FILE}"
  : > "${LOG_FILE}"

  cd "${ROOT_DIR}"
  echo "bridge をビルドしています..."
  npm run build

  if [[ ! -f "${DIST_ENTRY}" ]]; then
    echo "build は完了しましたが、起動対象 ${DIST_ENTRY} が見つかりません。" >&2
    return 1
  fi

  local pid
  pid="$(
    ROOT_DIR="${ROOT_DIR}" LOG_FILE="${LOG_FILE}" DIST_ENTRY="${DIST_ENTRY}" node <<'NODE'
const { spawn } = require("node:child_process");
const { openSync } = require("node:fs");

const logFile = process.env.LOG_FILE;
const rootDir = process.env.ROOT_DIR;
const distEntry = process.env.DIST_ENTRY;

if (!logFile || !rootDir || !distEntry) {
  process.stderr.write("detached 起動に必要な環境変数が不足しています。\n");
  process.exit(1);
}

const output = openSync(logFile, "a");
const child = spawn(process.execPath, [distEntry], {
  cwd: rootDir,
  detached: true,
  env: process.env,
  stdio: ["ignore", output, output],
});

child.unref();
process.stdout.write(String(child.pid));
NODE
  )"
  echo "${pid}" > "${PID_FILE}"

  local ready=0
  for _ in {1..40}; do
    if ! is_running "${pid}"; then
      rm -f "${PID_FILE}"
      echo "bridge の起動に失敗しました。ログを確認してください。" >&2
      tail -n 50 "${LOG_FILE}" >&2 || true
      return 1
    fi

    if grep -q "\\[bridge\\] Health:" "${LOG_FILE}"; then
      ready=1
      break
    fi

    sleep 0.25
  done

  if [[ "${ready}" -ne 1 ]] || ! is_running "${pid}"; then
    rm -f "${PID_FILE}"
    echo "bridge の起動に失敗しました。ログを確認してください。" >&2
    tail -n 50 "${LOG_FILE}" >&2 || true
    return 1
  fi

  echo "bridge をバックグラウンドで起動しました。"
  echo "PID: ${pid}"
  echo "LOG: ${LOG_FILE}"
  echo "STOP: ${ROOT_DIR}/scripts/bridge.sh stop"
  tail -n 3 "${LOG_FILE}" || true
}

case "${COMMAND}" in
  start)
    start_bridge
    ;;
  stop)
    stop_bridge
    ;;
  *)
    echo "usage: ./scripts/bridge.sh [start|stop]" >&2
    exit 1
    ;;
esac
