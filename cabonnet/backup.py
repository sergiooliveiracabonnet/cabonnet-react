# -*- coding: utf-8 -*-
"""
cabonnet/backup.py — BackupHandler (HTTP port 5001) + _all_snapshots.
"""

import glob
import json
import logging
import os
import pathlib
from urllib.parse import urlparse

from cabonnet.config import BACKUP_DIR, PORT_BACKUP

log = logging.getLogger("CaboNetServer")


def _all_snapshots():
    if not BACKUP_DIR.exists():
        return []
    fixo = BACKUP_DIR / "CABONNET_BACKUP.json"
    if fixo.exists():
        return [fixo]
    arquivos = sorted(glob.glob(str(BACKUP_DIR / "cabonnet_*.json")), key=os.path.getmtime, reverse=True)
    return [pathlib.Path(p) for p in arquivos]


from http.server import BaseHTTPRequestHandler


class BackupHandler(BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        log.info("[Backup] " + fmt, *args)

    def send_cors(self):
        self.send_header("Access-Control-Allow-Origin",  "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_cors()
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path.rstrip("/")

        if path == "/health":
            snaps = _all_snapshots()
            self._json(200, {"status": "ok", "server": "backup", "port": PORT_BACKUP,
                             "backup_dir": str(BACKUP_DIR), "snapshots": len(snaps),
                             "latest": snaps[0].name if snaps else None})
            return

        if path == "/latest_backup":
            snaps = _all_snapshots()
            if not snaps:
                self._json(404, {"error": "Nenhum snapshot encontrado", "backup_dir": str(BACKUP_DIR)})
                return
            snap = snaps[0]
            try:
                with open(snap, "r", encoding="utf-8") as f:
                    data = json.load(f)
                data["_serverMeta"] = {"filename": snap.name, "sizeKB": round(snap.stat().st_size / 1024, 1)}
                body = json.dumps(data, ensure_ascii=False).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type",   "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.send_cors(); self.end_headers(); self.wfile.write(body)
                log.info("[Backup] Servido: %s  (%.1f KB)", snap.name, snap.stat().st_size / 1024)
            except Exception as ex:
                log.exception("[Backup] Erro ao ler snapshot")
                self._json(500, {"error": str(ex)})
            return

        if path == "/list_backups":
            snaps = _all_snapshots()
            lista = [{"name": f.name, "sizeKB": round(f.stat().st_size / 1024, 1), "modified": f.stat().st_mtime} for f in snaps]
            self._json(200, {"backups": lista, "count": len(lista)})
            return

        self._json(404, {"error": "Rotas: /health | /latest_backup | /list_backups"})

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type",   "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_cors(); self.end_headers(); self.wfile.write(body)
