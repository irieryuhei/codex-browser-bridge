#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="${ROOT_DIR}/.codex-browser-bridge/run"
PID_FILE="${RUN_DIR}/bridge.pid"
BRIDGE_PORT="${BRIDGE_PORT:-${PORT:-8765}}"

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
    local command=""
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

    local next_pid=""
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

target_pids=()
while IFS= read -r pid; do
  [[ -z "${pid}" ]] && continue
  if is_running "${pid}"; then
    target_pids+=("${pid}")
  fi
done < <(collect_target_pids)

if [[ "${#target_pids[@]}" -eq 0 ]]; then
  rm -f "${PID_FILE}"
  echo "bridge は起動していません。"
  exit 0
fi

for pid in "${target_pids[@]}"; do
  kill_tree TERM "${pid}"
done

for _ in {1..20}; do
  remaining=0
  for pid in "${target_pids[@]}"; do
    if is_running "${pid}"; then
      remaining=1
      break
    fi
  done
  if [[ "${remaining}" -eq 0 ]]; then
    rm -f "${PID_FILE}"
    echo "bridge を停止しました。"
    exit 0
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
    exit 1
  fi
done

rm -f "${PID_FILE}"
echo "bridge を停止しました。"
