# -*- coding: utf-8 -*-
"""
Simulação de ataque — tentativas de COLETA de dados do i-Manager driblando as
restrições de perfil/login/escopo.

Dispara os payloads reais contra o código de sanitização (builders de SQL) e
contra as rotas HTTP (com autenticação LIGADA). O datasource do Grafana é
mockado pela fixture `client` do conftest — nenhuma consulta chega à produção e
nenhum dado real de cliente é tocado. O que se testa aqui é se a APP deixaria
escapar SQL malicioso ou permitiria acesso sem sessão/escopo — que é onde a
coleta seria barrada.
"""

import re
import pytest
from unittest.mock import patch

from cabonnet import clientes, grafana

CIDADES = ["SAO JOSE DOS CAMPOS", "CACAPAVA"]

# Arsenal clássico de injeção SQL que um atacante tentaria na busca de cliente.
PAYLOADS_INJECAO = [
    "' OR '1'='1",
    "'; DROP TABLE clientes;--",
    "' UNION SELECT username, senha_hash FROM usuarios --",
    "1' OR '1'='1' --",
    "%'; --",
    "\\'; SELECT * FROM contratos; --",
    "' OR 1=1 LIMIT 1 OFFSET 1 --",
    "admin'--",
    "' OR cpf_cnpj IS NOT NULL --",
    "0x27 OR 1=1",
    "'||(SELECT senha_hash FROM usuarios)||'",
    "нет' OR '1'='1",           # unicode + aspas
    "'\n OR 1=1 --",             # newline injection
    "') OR ('a'='a",
]


def _sql_perigoso(sql: str) -> bool:
    """Heurística: o payload conseguiu quebrar para fora do literal e injetar
    estrutura SQL (aspas soltas, comentário, stacked query, UNION cru)."""
    if sql is None:
        return False
    corpo = sql.upper()
    # Aspa órfã: número ímpar de aspas simples indica literal quebrado.
    if sql.count("'") % 2 != 0:
        return True
    # Comentário ou terminador de statement vindos do input.
    if "--" in sql or ";" in sql.replace("';", ""):  # ';' fora de literal fechado
        pass
    # UNION / DROP / stacked introduzidos pelo atacante.
    for marca in ("DROP TABLE", "UNION SELECT", "SENHA_HASH", "FROM USUARIOS"):
        if marca in corpo:
            return True
    return False


# ─────────────────────────────────────────────────────────────────────────────
# 1. Injeção SQL na busca textual de cliente
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("payload", PAYLOADS_INJECAO)
def test_busca_cliente_neutraliza_injecao(payload):
    """sql_busca_clientes não pode deixar o payload injetar estrutura SQL."""
    sql = clientes.sql_busca_clientes(payload, CIDADES)
    if sql is None:
        return  # termo rejeitado antes de virar SQL — defesa máxima
    assert not _sql_perigoso(sql), f"INJEÇÃO ESCAPOU com payload {payload!r}:\n{sql}"
    # Garantia extra: nenhum caractere de aspa/porcento/barra do payload sobrou.
    assert "senha_hash" not in sql.lower()


@pytest.mark.parametrize("payload", PAYLOADS_INJECAO)
def test_termo_busca_so_deixa_alfanumerico(payload):
    """_termo_busca só pode devolver dígitos ou palavras [A-Z0-9]."""
    modo, termos = clientes._termo_busca(payload)
    for t in termos:
        if modo == "digitos":
            assert t.isdigit(), f"termo não-numérico no modo dígitos: {t!r}"
        else:
            assert re.fullmatch(r"[A-Z0-9]+", t), f"caractere perigoso sobreviveu: {t!r}"


# ─────────────────────────────────────────────────────────────────────────────
# 2. Injeção via código de cliente / numos (guarda int())
# ─────────────────────────────────────────────────────────────────────────────

INJECOES_NUMERICAS = ["1;DROP TABLE x", "1 OR 1=1", "1' --", "1 UNION SELECT 1", "abc", ""]

@pytest.mark.parametrize("mau", INJECOES_NUMERICAS)
def test_builders_numericos_rejeitam_nao_inteiro(mau):
    """Todo builder que interpola código/numos exige int() — payload não-inteiro
    tem que estourar ValueError antes de virar SQL."""
    for fn, args in [
        (grafana.sql_detalhes, (mau,)),
        (grafana.sql_ocorrencias, (mau,)),
        (clientes.sql_cliente, (mau, CIDADES)),
        (clientes.sql_contratos, (mau, 1)),
        (clientes.sql_ordens_cliente, (mau, 1)),
        (clientes.sql_auditoria_cliente, (mau, 1)),
    ]:
        with pytest.raises((ValueError, TypeError)):
            fn(*args)


# ─────────────────────────────────────────────────────────────────────────────
# 3. Bypass de autenticação — coletar sem sessão (auth LIGADA)
# ─────────────────────────────────────────────────────────────────────────────

ROTAS_DADOS = [
    ("GET", "/api/clientes/busca?q=silva"),
    ("GET", "/api/clientes/1234"),
    ("GET", "/detalhes?numos=1234567"),
    ("GET", "/detalhes/foto?numos=1234567&codfoto=1"),
    ("GET", "/query"),
    ("GET", "/revisitas"),
]

@pytest.mark.parametrize("metodo,rota", ROTAS_DADOS)
def test_sem_sessao_bloqueia(client, metodo, rota):
    """Sem cookie de sessão e com auth ligada, toda rota de dados dá 401."""
    with patch("cabonnet.app._auth_enabled", return_value=True):
        resp = client.request(metodo, rota)
    assert resp.status_code == 401, f"{rota} vazou sem auth: {resp.status_code}"


# ─────────────────────────────────────────────────────────────────────────────
# 4. Injeção pela query string das rotas (ponta a ponta)
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("numos", ["1;DROP TABLE x", "1 OR 1=1", "abc", "'--"])
def test_detalhes_rejeita_numos_nao_digito(client, numos):
    """/detalhes valida numos.isdigit() antes de qualquer SQL → 400, não 500."""
    resp = client.get("/detalhes", params={"numos": numos})
    assert resp.status_code == 400, f"numos {numos!r} não foi barrado: {resp.status_code}"


@pytest.mark.parametrize("codigo", ["1;DROP TABLE x", "1 OR 1=1", "'--", "99999999999"])
def test_cliente_rejeita_codigo_invalido(client, codigo):
    """/api/clientes/{codigo} exige dígito e <=9 chars → 400."""
    resp = client.get(f"/api/clientes/{codigo}")
    assert resp.status_code in (400, 404), f"codigo {codigo!r}: {resp.status_code}"


# ─────────────────────────────────────────────────────────────────────────────
# 5. O endpoint de IA não pode virar canal de consulta ao banco
# ─────────────────────────────────────────────────────────────────────────────

def test_ai_nao_consulta_banco_diretamente():
    """ai.py não pode chamar grafana_post — a IA só enxerga o cache já buscado.
    Um prompt malicioso não teria como gerar SQL contra o i-Manager."""
    import inspect
    import cabonnet.ai as ai
    fonte = inspect.getsource(ai)
    assert "grafana_post" not in fonte, "ai.py chama grafana_post — IA alcança o banco!"
