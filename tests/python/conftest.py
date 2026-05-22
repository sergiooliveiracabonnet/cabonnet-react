# -*- coding: utf-8 -*-
"""
Fixtures compartilhadas para os testes de integração do backend FastAPI.

Patches de sessão:
  - cabonnet.app._cache_warmup     → no-op: sem chamadas ao Grafana no startup
  - cabonnet.juniper._jun_poll_loop → no-op: sem loop de polling
  - cabonnet.app.grafana_post      → {} (patch no namespace do app, não no módulo origem)
  - cabonnet.app._auth_enabled     → False (auth desabilitada nos testes)

Por que patchar cabonnet.app.X em vez de cabonnet.grafana.X:
  app.py faz `from cabonnet.grafana import grafana_post` — isso cria uma
  referência local no namespace de app.py. Patchar o módulo origem depois
  do import não afeta essa referência. É preciso patchar onde a função é USADA.
"""

import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient


@pytest.fixture(scope="session")
def client():
    """TestClient do app principal com chamadas externas mockadas."""
    with (
        patch("cabonnet.app._cache_warmup"),
        patch("cabonnet.juniper._jun_poll_loop"),
        patch("cabonnet.app.grafana_post", return_value={}),
        patch("cabonnet.app._auth_enabled", return_value=False),
    ):
        from cabonnet.app import app
        with TestClient(app, raise_server_exceptions=True) as c:
            yield c


@pytest.fixture(scope="session")
def backup_client():
    """TestClient do app de backup (porta 5001)."""
    from cabonnet.backup_app import backup_app
    with TestClient(backup_app) as c:
        yield c
