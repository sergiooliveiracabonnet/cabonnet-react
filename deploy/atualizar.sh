#!/usr/bin/env bash
# deploy/atualizar.sh — atualiza o Cabonnet na VM (git pull + docker compose)
# avisando no Telegram antes/depois. Rodar de dentro de /opt/cabonnet:
#
#   cd /opt/cabonnet && ./deploy/atualizar.sh
#
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

CHAT_ID="${TELEGRAM_CHAT_ALERTAS:-${TELEGRAM_CHAT_ID:-}}"

notificar() {
  local texto="$1"
  if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "$CHAT_ID" ]; then
    curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      -d chat_id="$CHAT_ID" \
      -d parse_mode="HTML" \
      --data-urlencode text="$texto" \
      > /dev/null || true
  else
    echo "[aviso] TELEGRAM_BOT_TOKEN/CHAT_ID não configurados — pulando notificação" >&2
  fi
}

COMMIT_ANTES="$(git rev-parse --short HEAD)"

notificar "🔄 <b>Cabonnet</b> — atualizando servidor...
Commit atual: <code>${COMMIT_ANTES}</code>"

if git pull && docker compose up -d --build; then
  COMMIT_DEPOIS="$(git rev-parse --short HEAD)"
  if [ "$COMMIT_ANTES" = "$COMMIT_DEPOIS" ]; then
    notificar "✅ <b>Cabonnet</b> — já estava atualizado (<code>${COMMIT_DEPOIS}</code>), nenhuma mudança."
  else
    notificar "✅ <b>Cabonnet</b> — atualizado com sucesso
<code>${COMMIT_ANTES}</code> → <code>${COMMIT_DEPOIS}</code>"
  fi
else
  notificar "❌ <b>Cabonnet</b> — falha ao atualizar (git pull ou docker compose). Confira os logs na VM."
  exit 1
fi
