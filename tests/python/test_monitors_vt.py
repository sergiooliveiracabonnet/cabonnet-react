# -*- coding: utf-8 -*-
"""Testes do monitor de VT (Fila de Prioridade) — cabonnet/monitors.py."""

from unittest.mock import patch

from cabonnet.monitors import _enviar_alertas_vt


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
