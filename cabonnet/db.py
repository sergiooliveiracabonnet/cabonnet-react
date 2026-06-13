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
        con.execute("""
            CREATE TABLE IF NOT EXISTS justificativas (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                data_pico       TEXT    NOT NULL,
                periodo_inicio  TEXT    NOT NULL,
                periodo_fim     TEXT    NOT NULL,
                count_os        INTEGER DEFAULT 0,
                zscore          REAL    DEFAULT NULL,
                contexto_real   TEXT    DEFAULT '',
                causa_principal TEXT    DEFAULT '',
                impacto         TEXT    DEFAULT '',
                contexto_ia     TEXT    DEFAULT '',
                acoes           TEXT    DEFAULT '[]',
                recomendacao    TEXT    DEFAULT '',
                criado_em       TEXT    NOT NULL
            )
        """)
        con.execute("CREATE INDEX IF NOT EXISTS idx_jus_pico ON justificativas(data_pico)")
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


def _db_save_justificativa(data_pico, periodo_inicio, periodo_fim, count_os, zscore,
                           contexto_real, causa_principal, impacto, contexto_ia, acoes, recomendacao):
    """Insere ou substitui justificativa para uma data de pico."""
    import json as _json
    criado_em = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    acoes_json = _json.dumps(acoes, ensure_ascii=False) if isinstance(acoes, list) else (acoes or "[]")
    try:
        with state._db_lock:
            con = sqlite3.connect(_DB_PATH)
            cur = con.execute(
                """INSERT INTO justificativas
                   (data_pico, periodo_inicio, periodo_fim, count_os, zscore,
                    contexto_real, causa_principal, impacto, contexto_ia, acoes, recomendacao, criado_em)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                (data_pico, periodo_inicio, periodo_fim, count_os, zscore,
                 contexto_real, causa_principal, impacto, contexto_ia, acoes_json, recomendacao, criado_em)
            )
            new_id = cur.lastrowid
            con.commit()
            con.close()
        return new_id
    except Exception as ex:
        log_db.warning("Falha ao salvar justificativa: %s", ex)
        return None


def _db_list_justificativas(limit=100):
    """Lista justificativas salvas ordenadas por data_pico desc."""
    import json as _json
    try:
        with state._db_lock:
            con = sqlite3.connect(_DB_PATH)
            rows = con.execute(
                "SELECT id,data_pico,periodo_inicio,periodo_fim,count_os,zscore,"
                "contexto_real,causa_principal,impacto,contexto_ia,acoes,recomendacao,criado_em "
                "FROM justificativas ORDER BY data_pico DESC LIMIT ?", (limit,)
            ).fetchall()
            con.close()
        cols = ["id","data_pico","periodo_inicio","periodo_fim","count_os","zscore",
                "contexto_real","causa_principal","impacto","contexto_ia","acoes","recomendacao","criado_em"]
        result = []
        for r in rows:
            d = dict(zip(cols, r))
            try:
                d["acoes"] = _json.loads(d["acoes"] or "[]")
            except Exception:
                d["acoes"] = []
            result.append(d)
        return result
    except Exception as ex:
        log_db.warning("Falha ao listar justificativas: %s", ex)
        return []


def _db_delete_justificativa(jid):
    """Remove justificativa por ID. Retorna True se removeu."""
    try:
        with state._db_lock:
            con = sqlite3.connect(_DB_PATH)
            cur = con.execute("DELETE FROM justificativas WHERE id=?", (jid,))
            affected = cur.rowcount
            con.commit()
            con.close()
        return affected > 0
    except Exception as ex:
        log_db.warning("Falha ao deletar justificativa %s: %s", jid, ex)
        return False


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
