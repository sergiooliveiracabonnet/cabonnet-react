# -*- coding: utf-8 -*-
"""Regressões P0 para a carga compacta do dashboard."""

import time
from unittest.mock import patch

from cabonnet import state


def test_query_compact_omits_heavy_observations_and_preserves_rows(client):
    csv_text = (
        "numos,nomecliente,nomedacidade,observacoes,observacaocritica\n"
        '1234567,Cliente Teste,TAUBATE,"histórico muito grande","alerta crítico"\n'
    )
    cached = {"pendente": "", "agendado": csv_text, "futuro": "", "ts": time.time()}

    with patch.dict(state._query_cache, cached, clear=True):
        response = client.get("/query?compact=1")

    assert response.status_code == 200
    data = response.json()
    assert data["compact"] is True
    assert "observacoes" not in data["agendado"].splitlines()[0]
    assert "observacaocritica" not in data["agendado"].splitlines()[0]
    assert "1234567" in data["agendado"]
    assert "Cliente Teste" in data["agendado"]


def test_query_compact_is_gzipped_when_client_accepts_it(client):
    rows = [
        str(1234000 + i) + f',Cliente {i},TAUBATE,"' + ("x" * 200) + '",crítica'
        for i in range(30)
    ]
    csv_text = (
        "numos,nomecliente,nomedacidade,observacoes,observacaocritica\n"
        + "\n".join(rows)
        + "\n"
    )
    cached = {"pendente": "", "agendado": csv_text, "futuro": "", "ts": time.time()}

    with patch.dict(state._query_cache, cached, clear=True):
        response = client.get("/query?compact=1", headers={"Accept-Encoding": "gzip"})

    assert response.status_code == 200
    assert response.headers.get("content-encoding") == "gzip"
