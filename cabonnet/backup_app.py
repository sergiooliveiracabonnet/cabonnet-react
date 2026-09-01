# -*- coding: utf-8 -*-
"""
cabonnet/backup_app.py — FastAPI app for port 5001 (snapshot browser).
"""

import json
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from cabonnet.backup import _all_snapshots
from cabonnet.config import BACKUP_DIR, PORT_BACKUP

log = logging.getLogger("CaboNetServer")

backup_app = FastAPI(title="CaboNet Backup", version="2026.8")

backup_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "OPTIONS"],
    allow_headers=["Content-Type"],
)


@backup_app.get("/health")
def health():
    snaps = _all_snapshots()
    return {
        "status": "ok",
        "server": "backup",
        "port": PORT_BACKUP,
        "backup_dir": str(BACKUP_DIR),
        "snapshots": len(snaps),
        "latest": snaps[0].name if snaps else None,
    }


@backup_app.get("/latest_backup")
def latest_backup():
    snaps = _all_snapshots()
    if not snaps:
        return JSONResponse(
            {"error": "Nenhum snapshot encontrado", "backup_dir": str(BACKUP_DIR)},
            status_code=404,
        )
    snap = snaps[0]
    try:
        with open(snap, "r", encoding="utf-8") as f:
            data = json.load(f)
        data["_serverMeta"] = {
            "filename": snap.name,
            "sizeKB": round(snap.stat().st_size / 1024, 1),
        }
        log.info("[Backup] Servido: %s  (%.1f KB)", snap.name, snap.stat().st_size / 1024)
        return data
    except Exception as ex:
        log.exception("[Backup] Erro ao ler snapshot")
        return JSONResponse({"error": str(ex)}, status_code=500)


@backup_app.get("/list_backups")
def list_backups():
    snaps = _all_snapshots()
    lista = [
        {"name": f.name, "sizeKB": round(f.stat().st_size / 1024, 1), "modified": f.stat().st_mtime}
        for f in snaps
    ]
    return {"backups": lista, "count": len(lista)}
