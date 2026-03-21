#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="${ROOT_DIR}/.codex-browser-bridge/run"
PID_FILE="${RUN_DIR}/bridge.pid"
LOG_FILE="${RUN_DIR}/bridge.log"
DIST_ENTRY="${ROOT_DIR}/dist/src/index.js"
STOP_SCRIPT="${ROOT_DIR}/scripts/stop-bridge.sh"
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

read_port_pid() {
  local pid=""
  pid="$(
    lsof -tiTCP:"${BRIDGE_PORT}" -sTCP:LISTEN 2>/dev/null | head -n 1
  )"
  if [[ -z "${pid}" ]]; then
    return 1
  fi

  local command=""
  command="$(ps -p "${pid}" -o command= 2>/dev/null || true)"
  if [[ "${command}" != *"${ROOT_DIR}"* ]]; then
    return 1
  fi
  if [[ "${command}" != *"src/index.ts"* && "${command}" != *"dist/src/index.js"* ]]; then
    return 1
  fi

  printf '%s\n' "${pid}"
}

mkdir -p "${RUN_DIR}"

if [[ ! -d "${ROOT_DIR}/node_modules" ]]; then
  echo "依存関係が見つかりません。先に 'npm install' を実行してください。" >&2
  exit 1
fi

if existing_pid="$(read_pid 2>/dev/null)" && is_running "${existing_pid}"; then
  echo "bridge は既に起動しているため、停止してから再起動します。"
  "${STOP_SCRIPT}"
elif existing_pid="$(read_port_pid 2>/dev/null)" && is_running "${existing_pid}"; then
  echo "bridge がポート ${BRIDGE_PORT} で起動しているため、停止してから再起動します。"
  BRIDGE_PORT="${BRIDGE_PORT}" "${STOP_SCRIPT}"
fi

rm -f "${PID_FILE}"
: > "${LOG_FILE}"

cd "${ROOT_DIR}"
echo "bridge をビルドしています..."
npm run build

if [[ ! -f "${DIST_ENTRY}" ]]; then
  echo "build は完了しましたが、起動対象 ${DIST_ENTRY} が見つかりません。" >&2
  exit 1
fi

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

ready=0
for _ in {1..40}; do
  if ! is_running "${pid}"; then
    rm -f "${PID_FILE}"
    echo "bridge の起動に失敗しました。ログを確認してください。" >&2
    tail -n 50 "${LOG_FILE}" >&2 || true
    exit 1
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
  exit 1
fi

echo "bridge をバックグラウンドで起動しました。"
echo "PID: ${pid}"
echo "LOG: ${LOG_FILE}"
echo "STOP: ${ROOT_DIR}/scripts/stop-bridge.sh"
tail -n 3 "${LOG_FILE}" || true
