# -*- coding: utf-8 -*-


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert data.get("version") == "2026.8.0"
    assert "date" in data
    assert "porta" in data


def test_health_v1(client):
    """Mesmo endpoint disponível no prefixo versionado."""
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
    assert r.json()["version"] == "2026.8.0"


def test_legacy_and_v1_are_equivalent(client):
    r_legacy = client.get("/health")
    r_v1     = client.get("/api/v1/health")
    assert r_legacy.json() == r_v1.json()
