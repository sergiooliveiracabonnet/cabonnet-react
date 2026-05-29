# -*- coding: utf-8 -*-
"""
cabonnet_server.py — Entry point.
Inicia os dois HTTP servers (5000 e 5001) e todos os threads de background.
Toda a lógica de negócio vive em cabonnet/.
"""

import atexit
import logging
import threading
from datetime import date

# ── Carrega configuração e logging antes de qualquer outro import ──────────────
from cabonnet.config import CONFIG, PORT, PORT_BACKUP, _DB_PATH
from logging.handlers import RotatingFileHandler as _RFH

_log_fmt     = logging.Formatter("%(asctime)s [%(levelname)s] %(name)s — %(message)s",
                                  datefmt="%d/%m/%Y %H:%M:%S")
_root_logger = logging.getLogger()
_root_logger.setLevel(logging.INFO)

_fh = _RFH(CONFIG["log_file"], maxBytes=10 * 1024 * 1024, backupCount=5, encoding="utf-8")
_fh.setFormatter(_log_fmt)
_root_logger.addHandler(_fh)

_sh = logging.StreamHandler()
_sh.setFormatter(_log_fmt)
_root_logger.addHandler(_sh)

log = logging.getLogger("CaboNetServer")

# ── Módulos do pacote ──────────────────────────────────────────────────────────
from cabonnet.config import BACKUP_DIR
from cabonnet.utils import _acquire_lock, _release_lock
from cabonnet.telegram import _telegram_enabled
from cabonnet.backup import _all_snapshots
from cabonnet.app import app
from cabonnet.backup_app import backup_app
import uvicorn


def _run_backup_server():
    try:
        uvicorn.run(backup_app, host="localhost", port=PORT_BACKUP, log_level="warning")
    except OSError as ex:
        if "10048" in str(ex) or "Address already in use" in str(ex):
            log.error("[Backup] ERRO: porta %d já em uso.", PORT_BACKUP)
        else:
            log.exception("[Backup] Erro inesperado")


if __name__ == "__main__":
    try:
        _acquire_lock()
        atexit.register(_release_lock)

        if not BACKUP_DIR.exists():
            BACKUP_DIR.mkdir(parents=True, exist_ok=True)

        snaps = _all_snapshots()
        today = date.today().strftime("%d/%m/%Y")

        log.info("=" * 55)
        log.info("  CaboNet OS — Servidor Unificado v2026.8")
        log.info("=" * 55)
        log.info("  Grafana proxy : http://localhost:%d", PORT)
        log.info("  Backup server : http://localhost:%d", PORT_BACKUP)
        log.info("  Pasta Backup  : %s", BACKUP_DIR)
        log.info("  Snapshots     : %d arquivo(s)", len(snaps))
        if snaps:
            log.info("  Mais recente  : %s", snaps[0].name)
        log.info("  Hoje          : %s", today)
        log.info("  Log           : %s", CONFIG["log_file"])
        log.info("  Database      : %s", _DB_PATH)
        log.info("=" * 55)

        threading.Thread(target=_run_backup_server, name="BackupServer", daemon=True).start()

        if _telegram_enabled():
            log.info("  Telegram      : bot configurado — polling e scheduler ativos")
        else:
            log.info("  Telegram      : não configurado (defina TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID no .env)")

        uvicorn.run(app, host="localhost", port=PORT, log_level="info")

    except KeyboardInterrupt:
        log.info("Servidor encerrado.")
    except Exception:
        log.exception("Erro inesperado")
