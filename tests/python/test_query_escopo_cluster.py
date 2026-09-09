# -*- coding: utf-8 -*-
"""/query respeita o cluster da sessão.

Este teste existe porque o filtro passou despercebido: _query_response recebia
fornecedor_key e cluster_key soltos, com default None, e as 5 chamadas passavam
só o primeiro. O filtro ficou desligado no endpoint principal — sem erro, sem
log, com os testes de unidade das funções de filtro passando.

Agora _query_response recebe a sessão inteira e obrigatoriamente, e este teste
cobre o caminho de ponta a ponta.
"""

import csv
import io
import json
import time
from unittest.mock import patch

import pytest

from cabonnet import state
from cabonnet.app import app, _require_session

CABECALHO = "numos,nomedacidade,nomedaequipe,descsituacao,servico,tiposervico"
LINHAS = [
    "1000001,Taubaté,03- VAL - INSTALACAO F01,Pendente,INSTALACAO,INSTALACAO",
    "1000002,Adamantina,05 - ADA - INSTALACAO F 01,Pendente,INSTALACAO,INSTALACAO",
    "1000003,Lucélia,05 - ADA - MANUTENCAO F 07,Pendente,MANUTENCAO,MANUTENCAO",
    "1000004,Pindamonhangaba,03- VAL - INSTALACAO F08,Pendente,INSTALACAO,INSTALACAO",
    "1000005,Osvaldo Cruz,05 - ADA - INSTALACAO FCT 05,Pendente,INSTALACAO,INSTALACAO",
]
CSV = CABECALHO + "\n" + "\n".join(LINHAS) + "\n"


@pytest.fixture
def cache_populado():
    with state._query_cache_lock:
        anterior = dict(state._query_cache)
        state._query_cache.update({
            "ts": time.time(), "pendente": CSV, "agendado": CSV, "futuro": CSV,
        })
    yield
    with state._query_cache_lock:
        state._query_cache.clear()
        state._query_cache.update(anterior)


def _cidades(payload, chave="agendado"):
    texto = payload.get(chave) or ""
    return sorted({r["nomedacidade"] for r in csv.DictReader(io.StringIO(texto))})


def _consulta(client, sess):
    app.dependency_overrides[_require_session] = lambda: sess
    try:
        r = client.get("/query?date=hoje")
        assert r.status_code == 200, r.text[:200]
        return r.json()
    finally:
        app.dependency_overrides.pop(_require_session, None)


def test_sessao_de_adamantina_nao_recebe_o_vale(client, cache_populado):
    payload = _consulta(client, {"role": "gestor", "username": "oscar",
                                 "fornecedor_key": None, "cluster_key": "ADAMANTINA"})
    assert _cidades(payload) == ["Adamantina", "Lucélia", "Osvaldo Cruz"]


def test_sessao_do_vale_nao_recebe_adamantina(client, cache_populado):
    payload = _consulta(client, {"role": "operador", "username": "vale",
                                 "fornecedor_key": None, "cluster_key": "VALE"})
    assert _cidades(payload) == ["Pindamonhangaba", "Taubaté"]


def test_sessao_com_todos_recebe_os_dois_clusters(client, cache_populado):
    payload = _consulta(client, {"role": "gestor", "username": "admin",
                                 "fornecedor_key": None, "cluster_key": "TODOS"})
    assert len(_cidades(payload)) == 5


def test_gestor_nao_escapa_do_recorte(client, cache_populado):
    """Papel nao afrouxa o cluster: gestor de Adamantina ve so Adamantina."""
    payload = _consulta(client, {"role": "gestor", "username": "oscar",
                                 "fornecedor_key": None, "cluster_key": "ADAMANTINA"})
    assert "Taubaté" not in _cidades(payload)


def test_recorte_vale_para_as_tres_listas(client, cache_populado):
    payload = _consulta(client, {"role": "gestor", "username": "oscar",
                                 "fornecedor_key": None, "cluster_key": "ADAMANTINA"})
    for chave in ("pendente", "agendado", "futuro"):
        assert "Taubaté" not in (payload.get(chave) or ""), chave


def test_query_response_exige_a_sessao():
    """Assinatura sem default: uma chamada nova que esqueca a sessao quebra na
    hora, em vez de servir tudo sem filtro."""
    import inspect
    from cabonnet.app import _query_response
    sig = inspect.signature(_query_response)
    assert sig.parameters["sess"].default is inspect.Parameter.empty
