#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="snippets-dev.service"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/ops/systemd/${SERVICE_NAME}"
DST_DIR="${HOME}/.config/systemd/user"
DST="${DST_DIR}/${SERVICE_NAME}"

if [[ ! -f "$SRC" ]]; then
  echo "Service template not found: $SRC" >&2
  exit 1
fi

mkdir -p "$DST_DIR"
install -m 0644 "$SRC" "$DST"

systemctl --user daemon-reload
systemctl --user enable --now "$SERVICE_NAME"

echo
echo "✅ Installed and started: $SERVICE_NAME"
echo "   Check:   systemctl --user status $SERVICE_NAME --no-pager"
echo "   Restart: systemctl --user restart $SERVICE_NAME"
echo "   Logs:    journalctl --user -u $SERVICE_NAME -f"
