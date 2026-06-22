# -*- coding: utf-8 -*-
"""
cabonnet/utils.py — Utilitários gerais (sem estado mutável).
"""

import csv
import ctypes
import glob
import io
import logging
import os
import pathlib
from datetime import datetime, date
from http.server import HTTPServer
from socketserver import ThreadingMixIn
from urllib.parse import parse_qs

from cabonnet.config import BACKUP_DIR, LOCK_FILE, _PROJECT_DIR

log = logging.getLogger("CaboNetServer")


class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
    """HTTPServer multi-threaded: cada requisição roda em sua própria thread.
    Evita que uma query lenta (ex: /agendado) bloqueie o health-check do JS."""
    daemon_threads = True


def _parse_csv_rows(csv_text):
    """Parseia CSV (saída de frames_to_csv) em lista de dicts."""
    if not csv_text:
        return []
    try:
        reader = csv.DictReader(io.StringIO(csv_text))
        return [dict(row) for row in reader]
    except Exception:
        return []


def _parse_data_br(s):
    """Parseia 'DD/MM/YYYY' ou 'DD/MM/YYYY HH:MM' em date, ou None."""
    if not s:
        return None
    try:
        return datetime.strptime(s.strip()[:10], "%d/%m/%Y").date()
    except ValueError:
        return None


def _parse_datetime_br(s):
    """Parseia 'DD/MM/YYYY HH:MM' (com hora) ou 'DD/MM/YYYY' (assume 00:00) em datetime, ou None."""
    if not s:
        return None
    s = s.strip()
    for fmt in ("%d/%m/%Y %H:%M", "%d/%m/%Y"):
        try:
            return datetime.strptime(s[:16], fmt)
        except ValueError:
            continue
    return None


def isConcluida_str(situacao):
    """Retorna True se a situação indica OS concluída/encerrada."""
    s = (situacao or "").lower()
    return "conclu" in s or "encerr" in s or "cancel" in s


def parse_date_param(raw):
    if not raw or raw.strip().lower() in ("hoje", "today", ""):
        return date.today().isoformat()
    raw = raw.strip()
    for fmt in ("%d-%m-%Y", "%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw, fmt).date().isoformat()
        except ValueError:
            continue
    raise ValueError("Formato inválido: '{}'. Use DD-MM-YYYY.".format(raw))


def _all_snapshots():
    if not BACKUP_DIR.exists():
        return []
    # Busca pelo nome fixo CABONNET_BACKUP.json (padrão atual)
    # Fallback: qualquer cabonnet_*.json para compatibilidade com backups antigos
    fixo = BACKUP_DIR / "CABONNET_BACKUP.json"
    if fixo.exists():
        return [fixo]
    arquivos = sorted(glob.glob(str(BACKUP_DIR / "cabonnet_*.json")), key=os.path.getmtime, reverse=True)
    return [pathlib.Path(p) for p in arquivos]


def _pid_alive(pid):
    """Windows: verifica se um PID ainda está em execução (sem matá-lo)."""
    try:
        PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
        kernel32 = ctypes.windll.kernel32
        h = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, int(pid))
        if h:
            kernel32.CloseHandle(h)
            return True
        return False
    except Exception:
        return False


def _acquire_lock():
    """Cria o lockfile com o PID atual. Aborta se outra instância viva já existir."""
    if os.path.exists(LOCK_FILE):
        try:
            with open(LOCK_FILE, "r", encoding="utf-8") as f:
                old_pid = int((f.read() or "0").strip())
        except Exception:
            old_pid = 0
        if old_pid and old_pid != os.getpid() and _pid_alive(old_pid):
            log.error("=" * 55)
            log.error("  Outra instância do CaboNet já está em execução (PID %d).", old_pid)
            log.error("  Encerre-a antes de iniciar uma nova instância.")
            log.error("  Lockfile: %s", LOCK_FILE)
            log.error("=" * 55)
            raise SystemExit(1)
        log.info("[Lock] Lockfile antigo (PID %s) removido — processo não está mais ativo.", old_pid or "?")
    try:
        with open(LOCK_FILE, "w", encoding="utf-8") as f:
            f.write(str(os.getpid()))
        log.info("[Lock] Lockfile criado: %s (PID %d)", LOCK_FILE, os.getpid())
    except Exception as ex:
        log.warning("[Lock] Falha ao gravar lockfile: %s", str(ex)[:120])


def _release_lock():
    """Remove o lockfile no encerramento, apenas se pertencer a este processo."""
    try:
        if os.path.exists(LOCK_FILE):
            with open(LOCK_FILE, "r", encoding="utf-8") as f:
                pid = int((f.read() or "0").strip())
            if pid == os.getpid():
                os.remove(LOCK_FILE)
    except Exception:
        pass
