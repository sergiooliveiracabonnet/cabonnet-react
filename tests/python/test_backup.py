# -*- coding: utf-8 -*-
"""
Testes do app de backup (porta 5001).
"""


def test_backup_health(backup_client):
    r = backup_client.get("/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert data["server"] == "backup"
    assert "snapshots" in data
    assert isinstance(data["snapshots"], int)


def test_list_backups(backup_client):
    r = backup_client.get("/list_backups")
    assert r.status_code == 200
    data = r.json()
    assert "backups" in data
    assert "count" in data
    assert isinstance(data["backups"], list)
    assert data["count"] == len(data["backups"])


def test_latest_backup_no_snapshot(backup_client, tmp_path, monkeypatch):
    """Com diretório de backup vazio, retorna 404."""
    from cabonnet import backup
    monkeypatch.setattr(backup, "BACKUP_DIR", tmp_path / "vazio_que_nao_existe")
    r = backup_client.get("/latest_backup")
    assert r.status_code == 404
    assert "error" in r.json()
