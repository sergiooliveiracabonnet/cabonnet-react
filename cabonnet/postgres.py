# -*- coding: utf-8 -*-
"""
cabonnet/postgres.py — PostgreSQL: histórico de OS e fallback de dados.

Totalmente opcional: se psycopg2 não estiver instalado ou PG_HOST estiver
vazio, todas as funções retornam no-op/valores padrão silenciosamente.
"""

import logging
import threading
import time as _time_mod
from datetime import datetime

log_pg = logging.getLogger("CaboNetServer.PG")

_pg_available = False
_pool         = None
_pool_lock    = threading.Lock()

# ── Importação opcional ───────────────────────────────────────────────────────

try:
    import psycopg2
    from psycopg2 import pool as _pg_pool
    from psycopg2.extras import execute_values
    _psycopg2_ok = True
except ImportError:
    _psycopg2_ok = False


# ── Inicialização ─────────────────────────────────────────────────────────────

def pg_init(cfg: dict) -> bool:
    """Inicializa pool e cria tabelas. Retorna True se conectado com sucesso."""
    global _pg_available, _pool

    if not _psycopg2_ok:
        log_pg.info("[PG] psycopg2 não instalado — PostgreSQL desabilitado")
        return False
    if not cfg.get("host") or not cfg.get("user"):
        log_pg.info("[PG] PG_HOST/PG_USER não configurados — PostgreSQL desabilitado")
        return False

    try:
        with _pool_lock:
            _pool = _pg_pool.ThreadedConnectionPool(minconn=1, maxconn=4, **cfg)
        _pg_create_tables()
        _pg_available = True
        log_pg.info(
            "[PG] Conectado — %s@%s:%s/%s",
            cfg["user"], cfg["host"], cfg["port"], cfg["dbname"],
        )
        return True
    except Exception as ex:
        log_pg.warning("[PG] Falha ao conectar: %s", ex)
        return False


def pg_is_available() -> bool:
    return _pg_available


# ── Helpers de conexão ────────────────────────────────────────────────────────

def _conn():
    with _pool_lock:
        return _pool.getconn()


def _put(conn):
    with _pool_lock:
        if _pool:
            _pool.putconn(conn)


# ── Schema ────────────────────────────────────────────────────────────────────

def _pg_create_tables() -> None:
    conn = _conn()
    try:
        with conn.cursor() as cur:
            # Snapshots de CSV (espelho do SQLite query_cache — fallback rápido)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS os_snapshot (
                    chave TEXT PRIMARY KEY,
                    csv   TEXT    NOT NULL,
                    ts    BIGINT  NOT NULL
                )
            """)
            # Registros individuais de OS (histórico + deduplicação)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS os_registro (
                    numos              TEXT PRIMARY KEY,
                    empresa            TEXT,
                    nomecliente        TEXT,
                    codigocliente      TEXT,
                    codigocontrato     TEXT,
                    nomedacidade       TEXT,
                    bairro             TEXT,
                    logradouro         TEXT,
                    servico            TEXT,
                    tiposervico        TEXT,
                    nomedaequipe       TEXT,
                    equipeexecutou     TEXT,
                    descsituacao       TEXT,
                    datacadastro       TEXT,
                    dataagendamento    TEXT,
                    dataexecucao       TEXT,
                    databaixa          TEXT,
                    observacoes        TEXT,
                    observacaocritica  TEXT,
                    primeira_vez       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    ultima_atualizacao TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_os_cidade  ON os_registro(nomedacidade)"
            )
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_os_datacad ON os_registro(datacadastro)"
            )
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_os_status  ON os_registro(descsituacao)"
            )
        conn.commit()
    finally:
        _put(conn)


# ── Snapshot CSV (fallback /query) ────────────────────────────────────────────

def pg_upsert_snapshot(chave: str, csv_text: str, ts: float) -> None:
    if not _pg_available:
        return
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO os_snapshot(chave, csv, ts) VALUES(%s, %s, %s)
                   ON CONFLICT(chave) DO UPDATE
                   SET csv = EXCLUDED.csv, ts = EXCLUDED.ts""",
                (chave, csv_text, int(ts)),
            )
        conn.commit()
    except Exception as ex:
        log_pg.warning("[PG] Falha ao salvar snapshot '%s': %s", chave, ex)
        try:
            conn.rollback()
        except Exception:
            pass
    finally:
        _put(conn)


def pg_load_snapshot(chave: str) -> tuple:
    """Retorna (csv_text, ts) ou ('', 0) se não encontrado."""
    if not _pg_available:
        return ("", 0)
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT csv, ts FROM os_snapshot WHERE chave=%s", (chave,))
            row = cur.fetchone()
        return (row[0], row[1]) if row else ("", 0)
    except Exception as ex:
        log_pg.warning("[PG] Falha ao carregar snapshot '%s': %s", chave, ex)
        return ("", 0)
    finally:
        _put(conn)


# ── Registros individuais de OS ───────────────────────────────────────────────

_OS_COLS = [
    "numos", "empresa", "nomecliente", "codigocliente", "codigocontrato",
    "nomedacidade", "bairro", "logradouro", "servico", "tiposervico",
    "nomedaequipe", "equipeexecutou", "descsituacao", "datacadastro",
    "dataagendamento", "dataexecucao", "databaixa", "observacoes", "observacaocritica",
]
_OS_UPDATE_COLS = [c for c in _OS_COLS if c != "numos"]


def pg_upsert_os_rows(rows: list) -> None:
    """Upsert de registros OS no PostgreSQL. primeira_vez só gravada na inserção."""
    if not _pg_available or not rows:
        return

    def _v(r, k):
        v = r.get(k, "") or ""
        return v if isinstance(v, str) else str(v)

    data = [tuple(_v(r, k) for k in _OS_COLS) for r in rows if r.get("numos")]
    if not data:
        return

    cols_sql   = ", ".join(_OS_COLS)
    update_sql = ", ".join(f"{c} = EXCLUDED.{c}" for c in _OS_UPDATE_COLS)
    now        = datetime.now()

    conn = _conn()
    try:
        with conn.cursor() as cur:
            execute_values(
                cur,
                f"""INSERT INTO os_registro ({cols_sql}, primeira_vez, ultima_atualizacao)
                    VALUES %s
                    ON CONFLICT(numos) DO UPDATE SET
                        {update_sql},
                        ultima_atualizacao = NOW()""",
                [t + (now, now) for t in data],
            )
        conn.commit()
        log_pg.debug("[PG] Upsert %d OS concluído", len(data))
    except Exception as ex:
        log_pg.warning("[PG] Falha ao upsert OS: %s", ex)
        try:
            conn.rollback()
        except Exception:
            pass
    finally:
        _put(conn)


# ── Sync completo pós-Grafana ─────────────────────────────────────────────────

def pg_sync_grafana(csv_p: str, csv_a: str, csv_f: str, ts: float) -> None:
    """Persiste os 3 CSVs e upserta os registros individuais. Chamado em thread."""
    if not _pg_available:
        return
    try:
        from cabonnet.utils import _parse_csv_rows
        for chave, csv_val in [("pendente", csv_p), ("agendado", csv_a), ("futuro", csv_f)]:
            if csv_val:
                pg_upsert_snapshot(chave, csv_val, ts)

        all_rows = (
            _parse_csv_rows(csv_p or "")
            + _parse_csv_rows(csv_a or "")
            + _parse_csv_rows(csv_f or "")
        )
        pg_upsert_os_rows(all_rows)
    except Exception as ex:
        log_pg.warning("[PG] Erro no sync Grafana→PG: %s", ex)
