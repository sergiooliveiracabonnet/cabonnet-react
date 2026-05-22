# -*- coding: utf-8 -*-
"""
cabonnet_server.py — Entry point.
Inicia os dois HTTP servers (5000 e 5001) e todos os threads de background.
Toda a lógica de negócio vive em cabonnet/.
"""

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
from cabonnet import state
from cabonnet.config import BACKUP_DIR
from cabonnet.utils import ThreadingHTTPServer, _acquire_lock, _release_lock
from cabonnet.db import _db_init
from cabonnet.telegram import _telegram_enabled
from cabonnet.grafana import grafana_post, frames_to_csv, SQL_AGENDADO, SQL_PENDENTE, SQL_FUTURO
from cabonnet.cache import _dados_cache_update
from cabonnet.handler import Handler
from cabonnet.backup import BackupHandler, _all_snapshots
from cabonnet.bot import _telegram_poll_loop
from cabonnet.monitors import (
    _sla_monitor_loop, _fila_monitor_loop, _manut_monitor_loop,
    _atendimento_travado_loop, _sem_exec_monitor_loop, _resumo_scheduler_loop,
)
from cabonnet.juniper import _jun_poll_loop
import time as _time_mod


def _iniciar(porta, handler, nome):
    try:
        srv = ThreadingHTTPServer(("localhost", porta), handler)
        log.info("  [%s] porta %d OK", nome, porta)
        srv.serve_forever()
    except OSError as ex:
        if "10048" in str(ex) or "Address already in use" in str(ex):
            log.error("[%s] ERRO: porta %d ja em uso.", nome, porta)
        else:
            log.exception("[%s] Erro inesperado", nome)


def _cache_warmup():
    try:
        csv_p = frames_to_csv(grafana_post(SQL_PENDENTE))
        csv_a = frames_to_csv(grafana_post(SQL_AGENDADO))
        csv_f = frames_to_csv(grafana_post(SQL_FUTURO))
        with state._query_cache_lock:
            state._query_cache.update({
                "pendente": csv_p or "",
                "agendado": csv_a or "",
                "futuro":   csv_f or "",
                "ts":       _time_mod.time(),
            })
        _dados_cache_update(csv_agendado=csv_a or "")
        # Conta registros reais via csv.reader para evitar over-count por newlines em campos
        import csv as _csv, io as _io
        def _csv_count(text):
            return sum(1 for _ in _csv.reader(_io.StringIO(text or ""))) - 1  # -1 header
        log.info("[Cache] Warmup OK — P=%d A=%d F=%d",
                 _csv_count(csv_p), _csv_count(csv_a), _csv_count(csv_f))
    except Exception as ex:
        log.warning("[Cache] Warmup falhou: %s", str(ex)[:120])


if __name__ == "__main__":
    try:
        _acquire_lock()

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

        _db_init()
        log.info("[DB] SQLite inicializado em %s", _DB_PATH)

        t1  = threading.Thread(target=_iniciar, args=(PORT,        Handler,       "Grafana"), daemon=True)
        t2  = threading.Thread(target=_iniciar, args=(PORT_BACKUP, BackupHandler, "Backup "), daemon=True)
        t3  = threading.Thread(target=_telegram_poll_loop,      name="TelegramPoll",      daemon=True)
        t4  = threading.Thread(target=_resumo_scheduler_loop,   name="TelegramScheduler", daemon=True)
        t5  = threading.Thread(target=_cache_warmup,            name="CacheWarmup",       daemon=True)
        t6  = threading.Thread(target=_jun_poll_loop,           name="JuniperPoll",       daemon=True)
        t7  = threading.Thread(target=_sla_monitor_loop,        name="SLAMonitor",        daemon=True)
        t8  = threading.Thread(target=_fila_monitor_loop,       name="FilaMonitor",       daemon=True)
        t9  = threading.Thread(target=_manut_monitor_loop,      name="ManutMonitor",      daemon=True)
        t10 = threading.Thread(target=_atendimento_travado_loop, name="AtendTravado",      daemon=True)
        t11 = threading.Thread(target=_sem_exec_monitor_loop,   name="SemExecMonitor",    daemon=True)

        t1.start()
        t2.start()
        t5.start()
        t6.start()

        if _telegram_enabled():
            t3.start(); t4.start(); t7.start(); t8.start(); t9.start(); t10.start(); t11.start()
            log.info("  Telegram      : bot configurado — polling e scheduler ativos")
        else:
            log.info("  Telegram      : não configurado (defina TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID no .env)")

        t1.join()
        t2.join()

    except KeyboardInterrupt:
        log.info("Servidor encerrado.")
    except Exception:
        log.exception("Erro inesperado")
        input("\nPressione Enter para fechar...")
