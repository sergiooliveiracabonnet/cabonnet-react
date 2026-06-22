# -*- coding: utf-8 -*-
"""Testes do monitor de VT (Fila de Prioridade) — cabonnet/monitors.py."""

from datetime import datetime, timedelta
from unittest.mock import patch

from cabonnet.monitors import _classificar_vt_alerta, _enviar_alertas_vt


def test_enviar_alertas_vt_sem_items_nao_envia_nada():
    with patch("cabonnet.monitors._telegram_send") as mock_send:
        _enviar_alertas_vt([], "violado")
        mock_send.assert_not_called()


def test_enviar_alertas_vt_envia_para_operadora_e_para_alertas():
    row = {"numos": "1234567", "nomecliente": "Cliente Teste", "nomedaequipe": "EQUIPE F08"}
    with patch("cabonnet.monitors._telegram_send") as mock_send, \
         patch("cabonnet.monitors._operadora_da_os", return_value="WES"), \
         patch("cabonnet.monitors.TELEGRAM_CHAT_WES", "wes_chat_id"), \
         patch("cabonnet.monitors.TELEGRAM_CHAT_ALERTAS", "alertas_chat_id"), \
         patch("cabonnet.monitors._VT_CHAT_POR_OPERADORA", {"WES": "wes_chat_id"}):
        _enviar_alertas_vt([(row, -2.0, 24)], "violado")
        chats_chamados = [call.kwargs.get("chat_id_override") for call in mock_send.call_args_list]
        assert "wes_chat_id" in chats_chamados
        assert "alertas_chat_id" in chats_chamados


def test_enviar_alertas_vt_sem_operadora_so_envia_para_alertas():
    row = {"numos": "7654321", "nomecliente": "Cliente Teste", "nomedaequipe": "EQUIPE DESCONHECIDA"}
    with patch("cabonnet.monitors._telegram_send") as mock_send, \
         patch("cabonnet.monitors._operadora_da_os", return_value=None), \
         patch("cabonnet.monitors.TELEGRAM_CHAT_ALERTAS", "alertas_chat_id"):
        _enviar_alertas_vt([(row, 3.5, 24)], "risco")
        chats_chamados = [call.kwargs.get("chat_id_override") for call in mock_send.call_args_list]
        assert chats_chamados == ["alertas_chat_id"]


def test_classificar_sem_registro_e_dentro_do_prazo_nao_alerta():
    agora = datetime(2026, 6, 22, 12, 0)
    assert _classificar_vt_alerta(restante=10, registro=None, agora=agora) is None


def test_classificar_sem_registro_e_em_risco_dispara_risco():
    agora = datetime(2026, 6, 22, 12, 0)
    assert _classificar_vt_alerta(restante=3, registro=None, agora=agora) == "risco"


def test_classificar_ja_em_risco_nao_dispara_de_novo():
    agora = datetime(2026, 6, 22, 12, 0)
    registro = {"estagio": "risco", "last_sent": agora - timedelta(minutes=5)}
    assert _classificar_vt_alerta(restante=2, registro=registro, agora=agora) is None


def test_classificar_sem_registro_e_ja_violado_dispara_violado():
    agora = datetime(2026, 6, 22, 12, 0)
    assert _classificar_vt_alerta(restante=-1, registro=None, agora=agora) == "violado"


def test_classificar_violado_repete_apos_30_minutos():
    agora = datetime(2026, 6, 22, 12, 0)
    registro = {"estagio": "violado", "last_sent": agora - timedelta(minutes=31)}
    assert _classificar_vt_alerta(restante=-2, registro=registro, agora=agora) == "violado"


def test_classificar_violado_nao_repete_antes_de_30_minutos():
    agora = datetime(2026, 6, 22, 12, 0)
    registro = {"estagio": "violado", "last_sent": agora - timedelta(minutes=10)}
    assert _classificar_vt_alerta(restante=-2, registro=registro, agora=agora) is None


def test_classificar_risco_que_vira_violado_dispara():
    agora = datetime(2026, 6, 22, 12, 0)
    registro = {"estagio": "risco", "last_sent": agora - timedelta(hours=1)}
    assert _classificar_vt_alerta(restante=-0.5, registro=registro, agora=agora) == "violado"
