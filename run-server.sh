#!/bin/bash
set -euo pipefail

# Load 1Password service account token
set -a
source ~/.config/openclaw/op-service-account.env
set +a

# Run server with secrets injected
exec op run --env-file ~/.config/openclaw/op-env.env -- tsx "$@"
