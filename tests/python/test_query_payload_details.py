import time
from unittest.mock import patch

from cabonnet import state
from cabonnet.query_payload import extract_os_details


CSV = """numos,nomecliente,observacoes,observacaocritica
1234567,Cliente A,Texto da execução,
7654321,Cliente B,,Prioridade técnica
1111111,Cliente C,Não solicitado,
"""


def test_extract_os_details_returns_only_requested_rows():
    assert extract_os_details([CSV], {"1234567", "7654321"}) == {
        "1234567": {"observacoes": "Texto da execução", "observacaocritica": ""},
        "7654321": {"observacoes": "", "observacaocritica": "Prioridade técnica"},
    }


def test_extract_os_details_normalizes_leading_zeroes_and_ignores_invalid_ids():
    assert extract_os_details([CSV], {"01234567", "invalida"}) == {
        "1234567": {"observacoes": "Texto da execução", "observacaocritica": ""},
    }


def test_os_observacoes_endpoint_returns_details(client):
    """Regressão: `cluster_key` referenciado sem estar definido quebrava o
    endpoint com NameError (500) — a observação nunca chegava ao relatório
    de Reincidências, sempre caindo no fallback 'Sem observação registrada'."""
    cached = {"pendente": "", "agendado": CSV, "futuro": "", "ts": time.time()}

    with patch.dict(state._query_cache, cached, clear=True):
        response = client.post("/api/os-observacoes", json={"numos": ["1234567", "7654321"]})

    assert response.status_code == 200
    assert response.json() == {
        "ok": True,
        "items": {
            "1234567": {"observacoes": "Texto da execução", "observacaocritica": ""},
            "7654321": {"observacoes": "", "observacaocritica": "Prioridade técnica"},
        },
    }
