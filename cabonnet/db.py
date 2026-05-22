# -*- coding: utf-8 -*-
"""
cabonnet/db.py — SQLite: persistência de cache e histórico de status.
"""

import sqlite3
import logging
import threading
from datetime import datetime

from cabonnet.config import _DB_PATH
from cabonnet import state

log    = logging.getLogger("CaboNetServer")
log_db = logging.getLogger("CaboNetServer.DB")


def _db_init():
    """Cria as tabelas SQLite se não existirem. Chamada uma vez no startup."""
    with state._db_lock:
        con = sqlite3.connect(_DB_PATH)
        con.execute("""
            CREATE TABLE IF NOT EXISTS query_cache (
                chave  TEXT PRIMARY KEY,
                csv    TEXT NOT NULL,
                ts     INTEGER NOT NULL
            )
        """)
        con.execute("""
            CREATE TABLE IF NOT EXISTS status_history (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                numos        TEXT    NOT NULL,
                de           TEXT,
                para         TEXT    NOT NULL,
                ts           INTEGER NOT NULL,
                nomedaequipe TEXT,
                nomedacidade TEXT,
                tiposervico  TEXT,
                revisita_motivo TEXT
            )
        """)
        con.execute("CREATE INDEX IF NOT EXISTS idx_sh_numos ON status_history(numos)")
        con.execute("CREATE INDEX IF NOT EXISTS idx_sh_ts    ON status_history(ts)")
        con.commit()
        con.close()


def _db_save_cache(chave, csv_text, ts):
    """Persiste um CSV de /query no SQLite para sobreviver a restarts."""
    try:
        with state._db_lock:
            con = sqlite3.connect(_DB_PATH)
            con.execute("INSERT OR REPLACE INTO query_cache(chave,csv,ts) VALUES(?,?,?)",
                        (chave, csv_text, int(ts)))
            con.commit()
            con.close()
    except Exception as ex:
        log_db.warning("Falha ao salvar cache SQLite: %s", ex)


def _db_load_cache(chave):
    """Carrega CSV persistido do SQLite. Retorna (csv_text, ts) ou ('', 0)."""
    try:
        with state._db_lock:
            con = sqlite3.connect(_DB_PATH)
            row = con.execute("SELECT csv, ts FROM query_cache WHERE chave=?", (chave,)).fetchone()
            con.close()
        return (row[0], row[1]) if row else ("", 0)
    except Exception as ex:
        log_db.warning("Falha ao carregar cache SQLite: %s", ex)
        return ("", 0)


def _db_save_status_changes(changes):
    """Registra mudanças de status OS no histórico SQLite."""
    if not changes:
        return
    ts = int(datetime.now().timestamp())
    rows = [
        (r.get("numos",""), old, new, ts,
         r.get("nomedaequipe",""), r.get("nomedacidade",""), r.get("tiposervico",""), None)
        for r, old, new in changes
    ]
    try:
        with state._db_lock:
            con = sqlite3.connect(_DB_PATH)
            con.executemany(
                "INSERT INTO status_history(numos,de,para,ts,nomedaequipe,nomedacidade,tiposervico,revisita_motivo) VALUES(?,?,?,?,?,?,?,?)",
                rows
            )
            con.commit()
            con.close()
    except Exception as ex:
        log_db.warning("Falha ao salvar status_history: %s", ex)
