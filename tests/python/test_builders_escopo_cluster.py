# -*- coding: utf-8 -*-
"""Os builders de supervisao aceitam escopo de cluster.

Os 11 comandos de consulta do grupo Alertas (/sla, /aging, /turno, /cidade,
/ranking, /forecast, /comparativo, /manutencoes, /reagendadas, /equipe,
/listarede) liam o cache inteiro. Enquanto so o Alertas os chamava isso era a
visao global desejada; com um segundo grupo regional, a mesma chamada entrega
o Vale ao grupo de Adamantina.
"""

from unittest.mock import patch

import pytest

from cabonnet import builders, state
from cabonnet.telegram import escopo_cluster

HOJE = None  # preenchido no fixture


def _row(numos, cidade, equipe, cliente, servico="INSTALACAO"):
    from datetime import date
    d = date.today().strftime("%d/%m/%Y")
    return {
        "numos": numos, "nomecliente": cliente, "nomedacidade": cidade,
        "nomedaequipe": equipe, "servico": servico, "tiposervico": servico,
        "descsituacao": "Pendente", "situacao": "1", "bairro": "Centro",
        "datacadastro": d, "dataagendamento": d, "dataexecucao": "", "databaixa": "",
        "codigocontrato": "111", "codigoassinante": "222", "empresa": "CABONNET",
    }


VALE = _row("1000001", "Taubaté", "03- VAL - INSTALACAO F01", "CLIENTE DO VALE")
ADA  = _row("2000002", "Adamantina", "05 - ADA - INSTALACAO F 01", "CLIENTE DE ADAMANTINA")

# (nome do builder, argumentos posicionais antes de operadora)
BUILDERS = [
    ("_build_sla_detalhado",   ()),
    ("_build_aging",           ()),
    ("_build_ranking",         ()),
    ("_build_reagendadas",     ()),
    ("_build_turno",           ()),
    ("_build_forecast",        ()),
    ("_build_comparativo",     ()),
    ("_build_manutencoes_hoje", ()),
    ("_build_listarede",       ()),
    ("_build_equipe_ficha",    ("F 01",)),
    ("_build_cidade",          ("Adamantina",)),
]


@pytest.fixture
def cache_dos_dois_clusters():
    with state._dados_cache_lock:
        antes = list(state._dados_cache["agendado"])
        state._dados_cache["agendado"] = [VALE, ADA]
    yield
    with state._dados_cache_lock:
        state._dados_cache["agendado"] = antes


@pytest.mark.parametrize("nome,args", BUILDERS)
def test_builder_aceita_escopo_de_cluster(nome, args, cache_dos_dois_clusters):
    fn = getattr(builders, nome)
    saida = fn(*args, operadora=escopo_cluster("ADAMANTINA")) or ""
    assert "Taubaté" not in saida, "%s vazou cidade do Vale" % nome
    assert "CLIENTE DO VALE" not in saida, "%s vazou cliente do Vale" % nome
    assert "VAL - INSTALACAO F01" not in saida, "%s vazou equipe do Vale" % nome


@pytest.mark.parametrize("nome,args", BUILDERS)
def test_builder_sem_escopo_continua_global(nome, args, cache_dos_dois_clusters):
    """Sem operadora o comportamento nao muda — o Alertas de hoje depende disso."""
    fn = getattr(builders, nome)
    assert fn(*args) is not None
