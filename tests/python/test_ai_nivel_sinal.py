import json

import cabonnet.ai as ai


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


class _TextResponse(_Response):
    def __init__(self, text, stop_reason="end_turn"):
        self.text = text
        self.stop_reason = stop_reason

    def json(self):
        return {
            "content": [{"text": self.text}],
            "stop_reason": self.stop_reason,
            "usage": {"input_tokens": 10, "output_tokens": 10},
        }


def test_ai_nivel_sinal_gera_plano_e_remove_pii(monkeypatch):
    captured = {}
    result = {
        "diagnostico": "Concentração crítica em Taubaté.",
        "prioridades": ["OLT TBT"],
        "plano_acao": [{"prazo": "Imediato", "acao": "Inspecionar PON", "responsavel": "NOC", "criterio": "RX normalizado"}],
        "riscos": ["Degradação coletiva"],
    }

    def fake_post(*_args, **kwargs):
        captured.update(kwargs["json"])
        return _Response(result)

    monkeypatch.setattr(ai, "ANTHROPIC_API_KEY", "test-key")
    monkeypatch.setattr(ai.requests, "post", fake_post)
    payload = {
        "contexto": {
            "resumo": {"total": 10, "criticos": 8},
            "rx": {"medio": -24.5, "distribuicao": [{"faixa": "Crítico", "total": 8, "cliente": "NÃO ENVIAR"}]},
            "por_olt": [{"nome": "OLT TBT", "total": 10, "criticos": 8, "cliente": "NÃO ENVIAR"}],
            "cliente": "NÃO ENVIAR",
        }
    }

    response = ai._ai_nivel_sinal(payload)

    assert response["diagnostico"] == result["diagnostico"]
    prompt = captured["messages"][0]["content"]
    assert "OLT TBT" in prompt
    assert "NÃO ENVIAR" not in prompt


def test_ai_nivel_sinal_responde_pergunta_com_contexto(monkeypatch):
    monkeypatch.setattr(ai, "ANTHROPIC_API_KEY", "test-key")
    monkeypatch.setattr(ai.requests, "post", lambda *_args, **_kwargs: _Response({"resposta": "Priorize a OLT TBT."}))

    response = ai._ai_nivel_sinal({
        "contexto": {"resumo": {"total": 10, "criticos": 8}},
        "pergunta": "Por onde começar?",
        "historico": [{"role": "assistant", "content": "Diagnóstico anterior"}],
    })

    assert response == {"resposta": "Priorize a OLT TBT.", "cached": False}


def test_ai_nivel_sinal_repete_quando_json_e_truncado(monkeypatch):
    valid = json.dumps({
        "diagnostico": "Falha coletiva.",
        "prioridades": ["OLT TBT"],
        "plano_acao": [],
        "riscos": [],
    })
    responses = iter([
        _TextResponse('{"diagnostico":"resposta interrompida', "max_tokens"),
        _TextResponse(valid),
    ])
    monkeypatch.setattr(ai, "ANTHROPIC_API_KEY", "test-key")
    monkeypatch.setattr(ai.requests, "post", lambda *_args, **_kwargs: next(responses))

    response = ai._ai_nivel_sinal({"contexto": {"resumo": {"total": 100, "criticos": 50}}})

    assert response["diagnostico"] == "Falha coletiva."
