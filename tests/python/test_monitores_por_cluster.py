# -*- coding: utf-8 -*-
"""Alertas e relatorios agendados chegam ao grupo da regiao certa.

O risco e cruzado: o grupo de Adamantina receber OS do Vale, ou o contrario. E
ha um risco pior que os dois: uma OS de cidade inesperada nao aparecer em grupo
nenhum, silenciosamente.
"""

from unittest.mock import patch

import pytest

from cabonnet import monitors
from cabonnet.telegram import _rows_para_grupo, escopo_cluster

CHAT_ADA = "-1004296795561"
CHAT_ALERTAS = "-100111111111"

VALE = {"numos": "1", "nomedacidade": "Taubaté", "nomedaequipe": "03- VAL - INSTALACAO F01"}
ADA1 = {"numos": "2", "nomedacidade": "Adamantina", "nomedaequipe": "05 - ADA - INSTALACAO F 01"}
ADA2 = {"numos": "3", "nomedacidade": "Lucélia", "nomedaequipe": "01 - TUP - RETIRADA"}
ORFA = {"numos": "9", "nomedacidade": "Presidente Prudente", "nomedaequipe": "09 - PP - F01"}
TODAS = [VALE, ADA1, ADA2, ORFA]


@pytest.fixture
def dois_grupos():
    with patch.object(monitors, "TELEGRAM_CHAT_ALERTAS", CHAT_ALERTAS), \
         patch.object(monitors, "TELEGRAM_CHAT_ADAMANTINA", CHAT_ADA):
        yield


def test_destinos_incluem_os_dois_grupos(dois_grupos):
    assert monitors._destinos_cluster() == [(CHAT_ALERTAS, "VALE"), (CHAT_ADA, "ADAMANTINA")]


def test_sem_grupo_de_adamantina_so_sobra_o_alertas():
    with patch.object(monitors, "TELEGRAM_CHAT_ALERTAS", CHAT_ALERTAS), \
         patch.object(monitors, "TELEGRAM_CHAT_ADAMANTINA", ""):
        assert monitors._destinos_cluster() == [(CHAT_ALERTAS, "VALE")]


def test_recorte_por_grupo_separa_as_regioes():
    assert [r["numos"] for r in _rows_para_grupo(TODAS, "ADAMANTINA")] == ["2", "3"]
    # Equipe 01 - TUP - nao tem prefixo de Adamantina, mas atende Lucelia:
    # o grupo da regiao precisa ve-la.
    assert ADA2 in _rows_para_grupo(TODAS, "ADAMANTINA")


def test_alertas_e_catch_all_do_que_nao_e_de_outro_cluster():
    """Recortar por "== VALE" faria a OS de cidade inesperada sumir dos dois
    grupos, sem erro e sem log."""
    do_vale = _rows_para_grupo(TODAS, "VALE")
    assert [r["numos"] for r in do_vale] == ["1", "9"]


def test_chat_do_row_resolve_o_grupo_da_os(dois_grupos):
    assert monitors._chat_do_row(ADA1) == CHAT_ADA
    assert monitors._chat_do_row(VALE) == CHAT_ALERTAS
    assert monitors._chat_do_row(ORFA) == CHAT_ALERTAS


def test_enviar_por_cluster_manda_uma_mensagem_por_regiao(dois_grupos):
    enviados = {}

    def _fake_send(texto, chat_id_override=None, **kwargs):
        enviados[chat_id_override] = texto

    with patch.object(monitors, "_telegram_send", _fake_send):
        monitors._enviar_por_cluster(
            TODAS, montar=lambda itens: ["OS: " + ",".join(r["numos"] for r in itens)])

    assert set(enviados) == {CHAT_ALERTAS, CHAT_ADA}
    assert enviados[CHAT_ADA] == "OS: 2,3"
    assert enviados[CHAT_ALERTAS] == "OS: 1,9"


def test_enviar_por_cluster_aceita_tuplas(dois_grupos):
    """SLA e VT trabalham com (row, idade) — o recorte olha a row da tupla."""
    itens = [(VALE, 5), (ADA1, 9)]
    enviados = {}

    with patch.object(monitors, "_telegram_send",
                      lambda t, chat_id_override=None, **k: enviados.__setitem__(chat_id_override, t)):
        monitors._enviar_por_cluster(
            itens, montar=lambda i: ["n=%d" % len(i)], linha=lambda i: i[0])

    assert enviados == {CHAT_ALERTAS: "n=1", CHAT_ADA: "n=1"}


def test_grupo_sem_nada_na_fatia_nao_recebe_mensagem_vazia(dois_grupos):
    enviados = {}
    with patch.object(monitors, "_telegram_send",
                      lambda t, chat_id_override=None, **k: enviados.__setitem__(chat_id_override, t)):
        monitors._enviar_por_cluster([VALE], montar=lambda i: ["algo"])
    assert set(enviados) == {CHAT_ALERTAS}


def test_fila_guarda_contagem_por_cluster():
    """Um escalar unico oscilaria entre as regioes e dispararia alerta de
    crescimento inexistente."""
    from cabonnet import state
    assert isinstance(state._fila_prev_count, dict)


def _fonte_monitors():
    import io
    return io.open("cabonnet/monitors.py", encoding="utf-8").read()


def test_nenhum_envio_ficou_preso_no_alertas():
    """Guarda contra regressao: um destino cravado volta a ignorar Adamantina."""
    assert "chat_id_override=TELEGRAM_CHAT_ALERTAS" not in _fonte_monitors()


# --- O grupo Alertas deixou de ser pre-requisito ---------------------------
#
# Enquanto todo envio ia para o Alertas, guardar os monitores com
# `if not TELEGRAM_CHAT_ALERTAS` fazia sentido. Agora nao: com o Alertas vazio
# e so Adamantina configurada, a regiao inteira ficaria muda.


def test_monitores_nao_exigem_o_grupo_do_vale():
    fonte = _fonte_monitors()
    assert "if not TELEGRAM_CHAT_ALERTAS or not _telegram_enabled():" not in fonte
    assert "if TELEGRAM_CHAT_ALERTAS:" not in fonte


def test_chat_do_row_sem_grupo_do_vale_nao_vaza_para_o_grupo_padrao():
    """Sem override, _telegram_send cai em TELEGRAM_CHAT_ID — uma OS do Vale
    apareceria no grupo geral em vez de nao ser enviada."""
    with patch.object(monitors, "TELEGRAM_CHAT_ALERTAS", ""), \
         patch.object(monitors, "TELEGRAM_CHAT_ADAMANTINA", CHAT_ADA):
        assert monitors._chat_do_row(ADA1) == CHAT_ADA
        assert monitors._chat_do_row(VALE) is None


def test_alerta_por_os_confere_o_grupo_antes_de_enviar():
    """_chat_do_row pode devolver None: o chamador precisa segurar, nao passar
    o resultado direto para chat_id_override."""
    assert "chat_id_override=_chat_do_row(" not in _fonte_monitors()


def test_pulso_das_12h_recorta_pelo_cluster():
    """O bloco recebe _cluster e monta a mensagem; esquecer de repassar manda o
    pulso do Vale inteiro para o grupo de Adamantina."""
    fonte = _fonte_monitors()
    assert "_build_pulso()" not in fonte
    assert "_build_pulso(operadora=escopo_cluster(_cluster))" in fonte


def test_pendentes_das_17h_vai_para_o_grupo_da_regiao():
    """Era o unico agendado ainda sem destino: _telegram_send(txt) sem override
    cai no TELEGRAM_CHAT_ID, o grupo geral, com a fila das duas regioes junta."""
    fonte = _fonte_monitors()
    assert "_build_pendentes_semequipe()" not in fonte
    assert "_build_pendentes_semequipe(operadora=escopo_cluster(_cluster))" in fonte
    assert "_telegram_send(txt)" not in fonte


def test_executadas_dos_marcos_tambem_sai_por_regiao():
    """O relatorio dos marcos 10/13/16/19h se dividia por operadora do Vale, e
    o grupo regional nao entrava em nenhuma fatia. A visao global do grupo geral
    e as fatias por operadora continuam — o envio por cluster e somado."""
    fonte = _fonte_monitors()
    assert "_build_executadas_hoje(operadora=escopo_cluster(_cluster))" in fonte
    assert "texto_global = _build_executadas_hoje(operadora=None)" in fonte
    assert 'for _op, _chat in [("INSTACABLE", TELEGRAM_CHAT_INSTACABLE),' in fonte
