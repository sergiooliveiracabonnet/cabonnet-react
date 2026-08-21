import json

import cabonnet.ai as ai
import cabonnet.state as state


class _Response:
    ok = True
    status_code = 200

    def __init__(self, result):
        self._result = result

    def json(self):
        return {
            "content": [{"text": json.dumps(self._result, ensure_ascii=False)}],
            "usage": {"input_tokens": 10, "output_tokens": 10},
        }


PAYLOAD = {
    "total_pares": 47,
    "total_clientes": 22,
    "janela_dias": 60,
    "intervalo_medio": 12.4,
    "revisitas_rapidas": 15,
    "filtros": "Todas as terceiras",
    "causas": [
        {
            "causa": "Conectorizacao/Sinal", "count": 19, "pct": 40, "intervalo_medio": 8.1,
            "equipes": [{"equipe": "F04", "count": 7}, {"equipe": "F08", "count": 5}],
            "exemplos": ["Cliente A (SJC, F04, 5d) - feito: refez conector; faltou: sinal seguiu fora do padrao"],
        },
        {"causa": "Configuracao", "count": 11, "pct": 23, "intervalo_medio": 15.0, "equipes": [], "exemplos": []},
    ],
    "notas": ["Leitura do lote 1.", "Leitura do lote 2."],
}

RESULT = {
    "sintese": "As revisitas se concentram na F04 e voltam rapido demais.",
    "acoes": [{"titulo": "Auditar fechamento da F04", "detalhe": "Exigir foto do conector.", "causa": "Conectorizacao/Sinal"}],
}


def _reset_cache():
    with state._ai_revisitas_sintese_lock:
        state._ai_revisitas_sintese_cache.update({"hash": "", "ts": 0.0})


def test_sintese_recebe_o_agregado_inteiro_e_as_leituras_parciais(monkeypatch):
    _reset_cache()
    captured = {}

    def fake_post(*_args, **kwargs):
        captured.update(kwargs["json"])
        return _Response(RESULT)

    monkeypatch.setattr(ai, "ANTHROPIC_API_KEY", "test-key")
    monkeypatch.setattr(ai.requests, "post", fake_post)

    response = ai._ai_revisitas_sintese(PAYLOAD)

    assert response["sintese"] == RESULT["sintese"]
    assert response["acoes"] == RESULT["acoes"]
    assert response["cached"] is False

    prompt = captured["messages"][0]["content"]
    # O passo 2 precisa ver o conjunto todo, nao um lote.
    assert "47 pares de revisita" in prompt
    assert "22 clientes distintos" in prompt
    assert "Revisitas em ate 7 dias: 15 (32%)" in prompt
    assert "1. Conectorizacao/Sinal - 19 pares (40%)" in prompt
    assert "concentrado em F04 (7), F08 (5)" in prompt
    assert "ex: Cliente A (SJC, F04, 5d)" in prompt
    assert "- Leitura do lote 1." in prompt
    assert "- Leitura do lote 2." in prompt


def test_sintese_reaproveita_o_cache_para_o_mesmo_agregado(monkeypatch):
    _reset_cache()
    chamadas = {"n": 0}

    def fake_post(*_args, **_kwargs):
        chamadas["n"] += 1
        return _Response(RESULT)

    monkeypatch.setattr(ai, "ANTHROPIC_API_KEY", "test-key")
    monkeypatch.setattr(ai.requests, "post", fake_post)

    ai._ai_revisitas_sintese(PAYLOAD)
    segunda = ai._ai_revisitas_sintese(PAYLOAD)

    assert chamadas["n"] == 1
    assert segunda["cached"] is True
    assert segunda["sintese"] == RESULT["sintese"]


def test_sintese_sem_causas_nao_chama_a_api(monkeypatch):
    _reset_cache()

    def fake_post(*_args, **_kwargs):
        raise AssertionError("nao deveria chamar a API sem causas")

    monkeypatch.setattr(ai, "ANTHROPIC_API_KEY", "test-key")
    monkeypatch.setattr(ai.requests, "post", fake_post)

    assert ai._ai_revisitas_sintese({"total_pares": 0, "causas": []}) is None


def test_sintese_vazia_e_tratada_como_falha(monkeypatch):
    _reset_cache()
    monkeypatch.setattr(ai, "ANTHROPIC_API_KEY", "test-key")
    monkeypatch.setattr(ai.requests, "post", lambda *_a, **_k: _Response({"sintese": "   ", "acoes": []}))

    assert ai._ai_revisitas_sintese(PAYLOAD) is None


def test_sintese_descarta_acao_sem_titulo_e_limita_a_quatro(monkeypatch):
    _reset_cache()
    acoes = [{"titulo": "", "detalhe": "x"}] + [{"titulo": f"Acao {i}", "detalhe": "d", "causa": "Configuracao"} for i in range(6)]
    monkeypatch.setattr(ai, "ANTHROPIC_API_KEY", "test-key")
    monkeypatch.setattr(ai.requests, "post", lambda *_a, **_k: _Response({"sintese": "ok.", "acoes": acoes}))

    response = ai._ai_revisitas_sintese(PAYLOAD)

    assert [a["titulo"] for a in response["acoes"]] == ["Acao 0", "Acao 1", "Acao 2"]


def test_sintese_sem_chave_configurada_retorna_none(monkeypatch):
    _reset_cache()
    monkeypatch.setattr(ai, "ANTHROPIC_API_KEY", "")
    assert ai._ai_revisitas_sintese(PAYLOAD) is None
