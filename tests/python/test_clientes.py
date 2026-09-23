# -*- coding: utf-8 -*-
"""Visão analítica do cliente: SQL, máscara de documento e escopo da sessão."""

from unittest.mock import patch

import pytest

from cabonnet import clientes as C
from cabonnet.app import app, _require_session

VALE = {"role": "gestor", "username": "t", "fornecedor_key": None, "cluster_key": "VALE"}


def _frame(rows):
    """Resposta do Grafana no formato que frames_to_dict_list lê."""
    if not rows:
        return {"results": {"A": {"frames": []}}}
    cols = list(rows[0])
    return {"results": {"A": {"frames": [{
        "schema": {"fields": [{"name": c} for c in cols]},
        "data":   {"values": [[r[c] for r in rows] for c in cols]},
    }]}}}


@pytest.fixture
def tmp_db(tmp_path):
    from cabonnet import db
    with patch("cabonnet.db._DB_PATH", str(tmp_path / "cabonnet_test.db")):
        db._db_init()
        yield


@pytest.fixture
def sessao():
    def _usar(sess):
        app.dependency_overrides[_require_session] = lambda: sess
    yield _usar
    app.dependency_overrides.pop(_require_session, None)


# ── Máscara ──────────────────────────────────────────────────────────────────

def test_mascara_cpf_esconde_inicio_e_verificador():
    assert C.mascarar_documento("123.456.789-09") == ("***.456.789-**", "PF")


def test_mascara_cnpj():
    assert C.mascarar_documento("11.222.333/0001-81") == ("**.222.333/0001-**", "PJ")


def test_documento_invalido_nao_vaza_nada():
    assert C.mascarar_documento("123") == ("", None)
    assert C.mascarar_documento(None) == ("", None)


# ── SQL da busca ─────────────────────────────────────────────────────────────

def test_busca_por_nome_ignora_acento_e_exige_todas_as_palavras():
    sql = C.sql_busca_clientes("João  Silva", ["TAUBATE"])
    assert "like '%JOAO%'" in sql and "like '%SILVA%'" in sql
    assert " and translate(" in sql


def test_busca_nao_deixa_aspas_nem_curinga_chegarem_ao_sql():
    sql = C.sql_busca_clientes("x'; drop table clientes; -- %_", ["TAUBATE"])
    assert "';" not in sql and "--" not in sql.split("where t.nome")[1]
    assert "'%DROP%'" in sql and "%_" not in sql


def test_busca_numerica_cobre_codigo_contrato_os_e_cpf():
    sql = C.sql_busca_clientes("9.000.123", ["TAUBATE"])
    assert "cli.codigocliente = 9000123" in sql
    assert "ct.contrato = 9000123" in sql
    assert "o.numos = 9000123" in sql
    assert "like '%9000123%'" in sql


def test_busca_curta_demais_nao_consulta():
    assert C.sql_busca_clientes("12", ["TAUBATE"]) is None
    assert C.sql_busca_clientes("a", ["TAUBATE"]) is None


def test_cidade_fora_da_config_nunca_entra_no_sql():
    sql = C.sql_busca_clientes("silva", ["TAUBATE", "X') or 1=1 --"])
    assert "t.nome in ('TAUBATE')" in sql
    with pytest.raises(ValueError):
        C.sql_cliente(1, ["INVENTADA"])


def test_cidades_da_sessao_respeitam_cluster():
    assert set(C.cidades_da_sessao(VALE)) == {
        "SAO JOSE DOS CAMPOS", "CACAPAVA", "TAUBATE", "TREMEMBE", "PINDAMONHANGABA"}
    assert "ADAMANTINA" in C.cidades_da_sessao({"cluster_key": "TODOS"})
    assert C.cidades_da_sessao({"cluster_key": "NAO_EXISTE"}) == []


# ── Rotas ────────────────────────────────────────────────────────────────────

def test_busca_devolve_documento_mascarado(client, sessao):
    sessao(VALE)
    rows = [{"codigocliente": 42, "cidade": 889781, "nome": "MARIA", "nomefantasia": "",
             "cpf_cnpj": "123.456.789-09", "bairro": "CENTRO", "nomedacidade": "Taubaté",
             "contratos": 2, "contratos_ativos": 1}]
    with patch("cabonnet.app.grafana_post", return_value=_frame(rows)) as gp:
        r = client.get("/api/clientes/busca?q=maria")
    assert r.status_code == 200
    item = r.json()["items"][0]
    assert item["documento"] == "***.456.789-**"
    assert "123.456.789-09" not in r.text
    filtro = gp.call_args[0][0].split("where t.nome in (")[1].split(")")[0]
    assert "'TAUBATE'" in filtro and "'ADAMANTINA'" not in filtro


def test_busca_curta_nao_chama_o_grafana(client, sessao):
    sessao(VALE)
    with patch("cabonnet.app.grafana_post") as gp:
        r = client.get("/api/clientes/busca?q=a")
    assert r.json() == {"ok": True, "items": []}
    gp.assert_not_called()


def test_fornecedor_nao_consulta_cliente(client, sessao):
    sessao({"role": "fornecedor", "username": "w", "fornecedor_key": "WES", "cluster_key": "VALE"})
    with patch("cabonnet.app.grafana_post") as gp:
        r = client.get("/api/clientes/busca?q=maria")
    assert r.status_code == 403
    gp.assert_not_called()


def test_detalhe_codigo_invalido(client, sessao):
    sessao(VALE)
    assert client.get("/api/clientes/12a").status_code == 400
    assert client.get("/api/clientes/1234567890").status_code == 400


def test_detalhe_cliente_fora_do_escopo_da_404(client, sessao):
    sessao(VALE)
    with patch("cabonnet.app.grafana_post", return_value=_frame([])):
        assert client.get("/api/clientes/42").status_code == 404


def test_detalhe_monta_cliente_contratos_e_ordens(client, sessao):
    sessao(VALE)
    cli = [{"codigocliente": 42, "codcidade": 889781, "nome": "MARIA", "nome_social": "",
            "nomefantasia": "", "cpf_cnpj": "123.456.789-09", "email": "m@x.com",
            "logradouro": "RUA A", "numero": "1", "complemento": "", "bairro": "CENTRO",
            "cep": "12000000", "nomedacidade": "Taubaté", "cliente_desde": "01/02/2020",
            "atualizado_em": "", "dia_vencimento": 10, "vip": 1, "bloqueio_juridico": 2,
            "enviarporwhatsapp": 0, "observacao": "PLANO 500MB"}]
    contratos = [{"contrato": 7, "situacao": 2, "valor": 99.9, "datavenda": "01/02/2020",
                  "datainstalacao": "03/02/2020", "datasituacaoanterior": "", "situacaoanterior": "",
                  "empresa": "HINET", "logradouro": "RUA A", "numero": "1", "complemento": "",
                  "bairro": "CENTRO", "cep": "12000000", "apelido": ""}]
    ordens = [{"numos": 9000123, "servico": "MANUTENCAO", "descsituacao": "Concluída", "observacoes": None},
              {"numos": 9000124, "servico": "MANUTENCAO", "descsituacao": "Pendente", "observacoes": ""}]
    auditoria = [{"numos": 9000123, "reagendamentos": 2, "trocas_equipe": 1}]
    respostas = iter([_frame(cli), _frame(contratos), _frame(ordens), _frame(auditoria)])
    with patch("cabonnet.app.grafana_post", side_effect=lambda sql: next(respostas)) as gp:
        r = client.get("/api/clientes/42")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["cliente"]["documento"] == "***.456.789-**"
    assert body["cliente"]["vip"] is True and body["cliente"]["bloqueio_juridico"] is False
    assert body["contratos"][0]["situacao"] == 2
    assert body["ordens"][0]["numos"] == "9000123"
    assert body["ordens_truncadas"] is False
    assert body["auditoria_ok"] is True
    assert body["ordens"][0]["reagendamentos"] == "2" and body["ordens"][0]["trocas_equipe"] == "1"
    assert body["ordens"][1]["reagendamentos"] == "0"          # sem linha na auditoria = nunca reagendada
    assert "a.id in (select id from os)" in gp.call_args_list[3][0][0]   # usa o índice por id
    # contratos e OS são buscados na cidade do cliente, não em todas
    assert "ct.cidade = 889781" in gp.call_args_list[1][0][0]
    assert "o.cidade = 889781" in gp.call_args_list[2][0][0]


def test_modulo_cliente_registrado():
    from cabonnet.db import ALL_MODULOS, _DEFAULT_OPERADOR_MODULOS, _DEFAULT_VIEWER_MODULOS
    from cabonnet.app import _MODULO_LABELS
    assert "cliente" in ALL_MODULOS and "cliente" in _MODULO_LABELS
    # dado pessoal: não nasce liberado para operador nem viewer
    assert "cliente" not in _DEFAULT_OPERADOR_MODULOS
    assert "cliente" not in _DEFAULT_VIEWER_MODULOS


def test_supervisor_existente_ganha_modulo_novo_uma_vez(tmp_db):
    from cabonnet import db
    assert "cliente" in db._db_get_permissoes("supervisor")   # base nova já nasce com ele
    with db._connect() as con:
        con.execute("DELETE FROM role_permissoes WHERE role='supervisor' AND modulo='cliente'")
        con.execute("DELETE FROM app_meta WHERE chave='seed_supervisor_cliente'")
    db._db_seed_modulo_novo_supervisor("cliente")
    assert "cliente" in db._db_get_permissoes("supervisor")
    # corte feito depois pelo gestor não é desfeito no próximo startup
    db._db_set_permissoes("supervisor", [m for m in db.ALL_MODULOS if m != "cliente"])
    db._db_seed_modulo_novo_supervisor("cliente")
    assert "cliente" not in db._db_get_permissoes("supervisor")


def test_auditoria_fora_do_ar_nao_derruba_o_dash(client, sessao):
    sessao(VALE)
    cli = [{"codigocliente": 42, "codcidade": 889781, "nome": "MARIA", "cpf_cnpj": "", "observacao": ""}]
    def fake(sql):
        if "aud_ordemservico" in sql:
            raise RuntimeError("timeout")
        if "from contratos ct" in sql:
            return _frame([])
        if "from ordemservico o" in sql:
            return _frame([{"numos": 1234567, "servico": "X"}])
        return _frame(cli)
    with patch("cabonnet.app.grafana_post", side_effect=fake):
        r = client.get("/api/clientes/42")
    assert r.status_code == 200
    assert r.json()["auditoria_ok"] is False
    assert "reagendamentos" not in r.json()["ordens"][0]


# ── Plano extraído da ficha de venda ─────────────────────────────────────────

@pytest.mark.parametrize("texto, velocidade, valor, fidelidade, promo", [
    ("PLANO CONTRATADO: 600 MB 99,90\nFIDELIDADE/REAJUSTE IGPM: 12 MESES", 600, 99.9, 12, False),
    ("PLANO CONTRATADO: 400 MEGAS POR 89.90", 400, 89.9, None, False),
    ("PLANO CONTRATADO (60MB MEGA FIBRA) 79,90\nFIDELIDADE 12 MESES/REAJUSTE", 60, 79.9, 12, False),
    # promoção: vale o preço depois de "APÓS", não o das primeiras mensalidades
    ("PLANO CONTRATADO: (CABONNET 600/300 M, AS 3 PRIMEIRAS MENSALIDADES R$ 59,90/MÊS, "
     "APÓS R$99,90/MÊS, 12 MESES DE FIDELIDADE)", 600, 99.9, 12, True),
    # desconto citado depois do preço não pode virar o preço
    ("PLANO CONTRATADO: 400 MEGAS POR 79,90 (10,00 DE DESCONTO - AUT. EM ANEXO", 400, 79.9, None, True),
    ("PLANO CONTRATADO: 60MB 79,90 COM DESCONTO DE 50% NOS PRIMEIROS TRÊS MESES 39,95", 60, 79.9, None, True),
    ("PLANO CONTRATADO (100MB MEGA FIBRA) 89,9 (DESCONTO 10,00", 100, 89.9, None, True),
    ("PLANO CONTRATADO:350 MEGA ", 350, None, None, False),
])
def test_extrai_plano_dos_formatos_reais(texto, velocidade, valor, fidelidade, promo):
    p = C.extrair_plano(texto)
    assert p["velocidade_mb"] == velocidade
    assert p["valor"] == valor
    assert p["fidelidade_meses"] == fidelidade
    assert p["promocional"] is promo
    assert "(" not in p["descricao"] and ")" not in p["descricao"]


def test_sem_ficha_de_plano_devolve_none():
    assert C.extrair_plano("PROTOCOLO 123 / cliente pediu visita à tarde") is None
    assert C.extrair_plano("") is None


def test_observacao_do_contrato_so_aparece_quando_difere_da_ficha():
    cli = {"codigocliente": 1, "observacao": "PLANO CONTRATADO: 600 MB 99,90"}
    base = {"contrato": 1, "situacao": 2}
    igual = C.montar_cliente(cli, [{**base, "observacao": "PLANO CONTRATADO: 600 MB 99,90"}], [])
    propria = C.montar_cliente(cli, [{**base, "observacao": "PLANO CONTRATADO: 800 MB 109,90"}], [])
    assert igual["contratos"][0]["observacao"] == ""
    assert igual["contratos"][0]["plano"]["velocidade_mb"] == 600       # herda a ficha do cliente
    assert propria["contratos"][0]["observacao"].startswith("PLANO")
    assert propria["contratos"][0]["plano"]["velocidade_mb"] == 800     # a do contrato tem prioridade
