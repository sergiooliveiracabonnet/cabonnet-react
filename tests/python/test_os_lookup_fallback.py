# -*- coding: utf-8 -*-
"""
Resiliência das consultas de OS no Telegram quando o Grafana externo cai.

Contexto: em 31/07/2026 o Grafana da Interfocus ficou inacessível por ~15h e os
grupos operacionais receberam o texto cru da exceção — truncado em 100 chars,
cortando justamente a causa ("...interfo"). Estes testes fixam o comportamento
esperado: mensagem legível para o pessoal de campo + fallback no cache local.
"""

from datetime import datetime

from cabonnet import builders


class _ErroDeRede(Exception):
    pass


_TEXTO_CRU = (
    "Grafana externo inacessível (erro de rede): "
    "HTTPSConnectionPool(host='cabonnet-monitoramento.interfocus.com.br', port=3000)"
)


def _grafana_off(*_args, **_kwargs):
    raise _ErroDeRede(_TEXTO_CRU)


def _row(numos="9305540", team="INST F08", **extra):
    base = {
        "numos": numos,
        "nomedaequipe": team,
        "tiposervico": "INSTALACAO",
        "servico": "INSTALACAO",
        "nomecliente": "Cliente Teste",
        "descsituacao": "Pendente",
        "nomedacidade": "Taubaté",
        "dataagendamento": "01/08/2026",
    }
    base.update(extra)
    return base


def _popular_cache(monkeypatch, rows, ts=None):
    if ts is None:
        ts = datetime(2026, 8, 1, 14, 35).timestamp()
    monkeypatch.setitem(builders.state._dados_cache, "agendado", rows)
    monkeypatch.setitem(builders.state._dados_cache, "ts", ts)


# ── Melhoria 2: fallback no cache local ───────────────────────────────────────

def test_detalhes_cai_no_cache_local_quando_grafana_esta_fora(monkeypatch):
    monkeypatch.setattr(builders, "grafana_post", _grafana_off)
    _popular_cache(monkeypatch, [_row(nomecliente="Maria Souza")])

    texto = builders._build_os_detalhes("9305540")

    assert "OS 9305540" in texto
    assert "Maria Souza" in texto


def test_detalhes_do_cache_avisa_o_horario_do_dado(monkeypatch):
    monkeypatch.setattr(builders, "grafana_post", _grafana_off)
    _popular_cache(monkeypatch, [_row()], ts=datetime(2026, 8, 1, 14, 35).timestamp())

    texto = builders._build_os_detalhes("9305540")

    assert "14:35" in texto, "campo precisa saber que o dado está defasado"


def test_detalhes_do_grafana_nao_traz_aviso_de_cache(monkeypatch):
    monkeypatch.setattr(builders, "grafana_post", lambda sql: {"ok": True})
    monkeypatch.setattr(builders, "frames_to_dict_list", lambda payload: [_row()])
    _popular_cache(monkeypatch, [])

    texto = builders._build_os_detalhes("9305540")

    assert "cache" not in texto.lower()


def test_fallback_no_cache_respeita_escopo_da_operadora(monkeypatch):
    """Queda do Grafana não pode virar brecha de visibilidade entre grupos."""
    monkeypatch.setattr(builders, "grafana_post", _grafana_off)
    _popular_cache(monkeypatch, [_row(team="INST F08")])  # equipe da WES

    texto = builders._build_os_detalhes("9305540", operadora="INSTACABLE")

    assert texto.startswith("🔒")
    assert "Cliente Teste" not in texto


# ── Melhoria 1: mensagem legível em vez da exceção crua ───────────────────────

def test_detalhes_sem_cache_mostra_mensagem_legivel(monkeypatch):
    monkeypatch.setattr(builders, "grafana_post", _grafana_off)
    _popular_cache(monkeypatch, [])

    texto = builders._build_os_detalhes("9305540")

    assert "HTTPSConnectionPool" not in texto
    assert "9305540" in texto
    assert "indisponível" in texto.lower()


def test_ficha_rapida_sem_cache_mostra_mensagem_legivel(monkeypatch):
    monkeypatch.setattr(builders, "grafana_post", _grafana_off)
    _popular_cache(monkeypatch, [])

    texto, markup = builders._build_os_ficha_rapida("9305540")

    assert "HTTPSConnectionPool" not in texto
    assert "9305540" in texto
    assert "indisponível" in texto.lower()
    assert markup is None


def test_erro_de_consulta_e_registrado_no_log(monkeypatch, caplog):
    """A causa real não pode sumir: sai do Telegram, mas tem que ir para o log."""
    monkeypatch.setattr(builders, "grafana_post", _grafana_off)
    _popular_cache(monkeypatch, [])

    with caplog.at_level("WARNING", logger="CaboNetServer"):
        builders._build_os_detalhes("9305540")

    assert any("HTTPSConnectionPool" in rec.getMessage() for rec in caplog.records)
