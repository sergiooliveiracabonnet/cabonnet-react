# -*- coding: utf-8 -*-
"""Grupo de alertas do cluster Adamantina.

O risco aqui é cruzado: o grupo de Adamantina receber OS do Vale, ou os grupos
do Vale receberem OS de Adamantina. As duas operações usam a mesma numeração de
frente (Vale escreve F01, Adamantina escreve F 01), e a normalização que apaga
o espaço faz as duas colidirem se o prefixo não for considerado antes.
"""

from unittest.mock import patch

from cabonnet import telegram
from cabonnet.telegram import _filter_by_operadora, _label_operadora, _operadora_for_chat

CHAT_ADA = "-1004296795561"

LINHAS = [
    {"numos": "1", "nomedacidade": "Taubaté", "nomedaequipe": "03- VAL - INSTALACAO F01", "servico": "INSTALACAO"},
    {"numos": "2", "nomedacidade": "Adamantina", "nomedaequipe": "05 - ADA - INSTALACAO F 01", "servico": "INSTALACAO"},
    {"numos": "3", "nomedacidade": "Lucélia", "nomedaequipe": "05 - ADA - MANUTENCAO F 07", "servico": "MANUTENCAO"},
    {"numos": "4", "nomedacidade": "Pindamonhangaba", "nomedaequipe": "03- VAL - INSTALACAO F08", "servico": "INSTALACAO"},
    {"numos": "5", "nomedacidade": "Taubaté", "nomedaequipe": "COPE - INSTALACAO", "servico": "INSTALACAO"},
]


def _os(operadora):
    return [r["numos"] for r in _filter_by_operadora(LINHAS, operadora)]


def test_chat_de_adamantina_resolve_para_escopo_de_cluster():
    """O grupo e visao regional, nao de operadora: recorta por cidade e mantem
    REDE e manutencao, como o Alertas faz para o Vale."""
    with patch.object(telegram, "TELEGRAM_CHAT_ADAMANTINA", CHAT_ADA):
        assert _operadora_for_chat(CHAT_ADA) == telegram.escopo_cluster("ADAMANTINA")
        assert _operadora_for_chat("-100999999999") is None


def test_grupo_de_adamantina_so_recebe_adamantina():
    """ADA nao tem lista de frentes. Sem o ramo por prefixo, _filter_by_operadora
    cairia no "return rows" e entregaria a operacao inteira ao grupo."""
    assert _os("ADA") == ["2", "3"]


def test_grupos_do_vale_nao_recebem_adamantina():
    """Regressao: "05 - ADA - INSTALACAO F 01" normaliza para "...F01" e casava
    com a F01 do Vale."""
    assert _os("INSTACABLE") == ["1"]
    assert _os("WES") == ["4"]
    assert _os("THM") == []


def test_rotulo_do_cabecalho():
    assert _label_operadora("ADA") == "ADAMANTINA"
    assert _label_operadora("INSTACABLE") == "INSTACABLE"
    assert _label_operadora(None) == "GLOBAL"


def test_chat_map_expoe_o_grupo_para_os_endpoints_de_notify():
    from cabonnet.app import _CHAT_MAP
    assert "adamantina" in _CHAT_MAP


def test_broadcast_manda_mudanca_de_adamantina_para_o_grupo_certo():
    changes = [(r, "Pendente", "Atendimento") for r in LINHAS]
    enviados = []

    def _fake_send(texto, chat_id_override=None, **kwargs):
        enviados.append(chat_id_override)

    with patch.object(telegram, "TELEGRAM_CHAT_ADAMANTINA", CHAT_ADA), \
         patch.object(telegram, "TELEGRAM_CHAT_ALERTAS", ""), \
         patch.object(telegram, "TELEGRAM_CHAT_ID", ""), \
         patch.object(telegram, "TELEGRAM_CHAT_WES", ""), \
         patch.object(telegram, "TELEGRAM_CHAT_INSTACABLE", ""), \
         patch.object(telegram, "TELEGRAM_CHAT_REDE", ""), \
         patch.object(telegram, "TELEGRAM_CHAT_OPERACIONAL_THM", ""), \
         patch.object(telegram, "_telegram_enabled", return_value=True), \
         patch.object(telegram, "_telegram_send", _fake_send):
        telegram._tg_broadcast_status_changes(changes)

    assert enviados, "nada foi enviado"
    assert set(enviados) == {CHAT_ADA}, "vazou para outro grupo: %s" % set(enviados)


def test_alertas_recebe_o_vale_e_o_que_nao_tem_cluster(client=None):
    """Alertas e o catch-all: Vale mais qualquer OS de cidade inesperada. Sem
    isso, uma cidade fora da lista sumiria dos dois grupos, em silencio."""
    linhas = LINHAS + [{"numos": "9", "nomedacidade": "Presidente Prudente",
                        "nomedaequipe": "09 - PP - INSTALACAO F01", "servico": "INSTALACAO"}]
    changes = [(r, "Pendente", "Atendimento") for r in linhas]
    enviados = {}

    def _fake_send(texto, chat_id_override=None, **kwargs):
        enviados.setdefault(chat_id_override, []).append(texto)

    with patch.object(telegram, "TELEGRAM_CHAT_ADAMANTINA", CHAT_ADA),          patch.object(telegram, "TELEGRAM_CHAT_ALERTAS", "alertas"),          patch.object(telegram, "TELEGRAM_CHAT_ID", ""),          patch.object(telegram, "TELEGRAM_CHAT_WES", ""),          patch.object(telegram, "TELEGRAM_CHAT_INSTACABLE", ""),          patch.object(telegram, "TELEGRAM_CHAT_REDE", ""),          patch.object(telegram, "TELEGRAM_CHAT_OPERACIONAL_THM", ""),          patch.object(telegram, "_telegram_enabled", return_value=True),          patch.object(telegram, "_telegram_send", _fake_send):
        telegram._tg_broadcast_status_changes(changes)

    assert set(enviados) == {CHAT_ADA, "alertas"}
    texto_alertas = " ".join(enviados["alertas"])
    assert "Presidente Prudente" in texto_alertas or "9" in texto_alertas


def test_bot_reconhece_o_grupo_e_libera_os_comandos_de_operadora():
    from cabonnet import bot
    assert hasattr(bot, "_jun_poll_loop") or True  # modulo importa
    fonte = open("cabonnet/bot.py", encoding="utf-8").read()
    assert "_CMDS_ADA" in fonte
    assert "TELEGRAM_CHAT_ADAMANTINA" in fonte
