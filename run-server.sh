#!/bin/bash
set -euo pipefail

OPENCLAW_CONFIG_DIR="${HOME}/.config/openclaw"
SERVICE_ENV_FILE="${OPENCLAW_CONFIG_DIR}/op-service-account.env"
OP_ENV_FILE="${OPENCLAW_CONFIG_DIR}/op-env.env"
TSX_BIN="$(command -v tsx || true)"

if [[ -z "${TSX_BIN}" && -x "./node_modules/.bin/tsx" ]]; then
  TSX_BIN="./node_modules/.bin/tsx"
fi

if [[ -z "${TSX_BIN}" ]]; then
  echo "[run-server] tsx not found. Install dependencies with 'npm install'." >&2
  exit 127
fi

# Prefer running with 1Password-injected secrets when available.
if command -v op >/dev/null 2>&1 && [[ -f "${SERVICE_ENV_FILE}" && -f "${OP_ENV_FILE}" ]]; then
  set -a
  source "${SERVICE_ENV_FILE}"
  set +a
  exec op run --env-file "${OP_ENV_FILE}" -- "${TSX_BIN}" "$@"
fi

if [[ -f "${SERVICE_ENV_FILE}" ]]; then
  set -a
  source "${SERVICE_ENV_FILE}"
  set +a
fi

echo "[run-server] openclaw env files not found, starting without 1Password-injected secrets." >&2
exec "${TSX_BIN}" "$@"
