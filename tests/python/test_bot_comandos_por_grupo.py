# -*- coding: utf-8 -*-
"""A allowlist de cada grupo tem que corresponder ao que o bot faz.

O modo de falha e mudo: um comando entra na allowlist do grupo, passa pela
porta, percorre a cadeia de elif, nao casa com nenhum ramo — e nada acontece.
Sem resposta, sem erro, sem log. Foi o que aconteceu com os 11 comandos de
consulta no grupo de Adamantina, travados em `and grupo == "ALERTAS"`.
"""

import io

import pytest

from cabonnet import bot

GRUPOS = ["INSTACABLE", "WES", "THM", "ALERTAS", "ADAMANTINA", "PRODUTIVIDADE"]


def _fonte():
    return io.open("cabonnet/bot.py", encoding="utf-8").read()


@pytest.mark.parametrize("grupo", GRUPOS)
def test_todo_grupo_tem_allowlist(grupo):
    assert bot._CMDS_POR_GRUPO[grupo]


@pytest.mark.parametrize("grupo", GRUPOS)
def test_todo_comando_liberado_aparece_no_help_do_grupo(grupo):
    """Se o comando esta liberado mas nao esta no /help, o usuario nao tem como
    descobrir que ele existe."""
    ajuda = bot._ajuda_do_grupo(grupo)
    assert ajuda, "grupo %s sem texto de ajuda" % grupo
    faltando = [c for c in sorted(bot._CMDS_POR_GRUPO[grupo]) if c not in ajuda]
    assert not faltando, "%s: fora do /help — %s" % (grupo, faltando)


def test_nenhum_handler_travado_em_um_grupo_fixo():
    """Um `and grupo == "X"` no ramo duplica a allowlist e sai de sincronia com
    ela; a porta da allowlist ja decide quem pode o que. O modo de falha da
    divergencia e o silencio, que ninguem reporta como erro."""
    assert 'and grupo == "' not in _fonte()


def test_grupo_de_cluster_tem_os_comandos_de_consulta():
    ada = bot._CMDS_POR_GRUPO["ADAMANTINA"]
    for cmd in ("/os", "/help", "/menu", "/sla", "/aging", "/turno",
                "/cidade", "/ranking", "/forecast", "/comparativo"):
        assert cmd in ada, "%s fora do grupo de cluster" % cmd


def test_help_do_cluster_documenta_a_busca_por_nome_e_numero():
    ajuda = bot._ajuda_do_grupo("ADAMANTINA")
    assert "nome" in ajuda.lower()
    assert "n\u00famero" in ajuda.lower()


def test_help_do_cluster_nao_oferece_pdf_de_operadora_do_vale():
    ajuda = bot._ajuda_do_grupo("ADAMANTINA")
    for cmd in ("/notainstacable", "/notawes", "/notathm", "/notarede"):
        assert cmd not in ajuda


def test_busca_por_texto_livre_respeita_o_escopo_do_grupo():
    """Digitar o nome sem barra e o caminho mais usado. Sem repassar operadora,
    o grupo de Adamantina ve cliente do Vale."""
    fonte = _fonte()
    assert "_build_os_busca(t, callback_prefix=pfx)" not in fonte
    assert "_build_os_detalhes(n), chat_id_override=cid" not in fonte
