#!/usr/bin/env bash
# Starts a throwaway FitFlow instance (production build + worker, mock AI) for E2E tests.
# Requires `pnpm build` first.
set -euo pipefail
DIR="${E2E_DIR:-$(pwd)/.e2e}"
rm -rf "$DIR" && mkdir -p "$DIR"
export NODE_ENV=production APP_URL="http://localhost:${E2E_PORT:-3200}" DATABASE_PATH="$DIR/fitflow.db" STORAGE_DIR="$DIR/storage" \
  CODEX_WORKDIR="$DIR/codex" AI_PROVIDER=mock FITFLOW_ALLOW_MOCK_AI=1 BACKUP_DIR="$DIR/backups" LOG_LEVEL=warn
node dist/migrate.mjs
node dist/worker.mjs > "$DIR/worker.log" 2>&1 &
WORKER=$!
trap 'kill $WORKER 2>/dev/null || true' EXIT
exec npx next start -p "${E2E_PORT:-3200}"
