# -*- coding: utf-8 -*-
"""Cluster por usuário: barreira no servidor, não preferência de tela.

O recorte tem de acontecer antes de o CSV sair do backend. Se o dado do outro
cluster chegar ao navegador, o filtro vira enfeite — é a mesma regra que o
fornecedor_key já seguia.
"""

import sqlite3
from unittest.mock import patch

from cabonnet import db
from cabonnet.app import _filter_csv_cluster, _filter_csv_escopo

CSV = (
    "numos,nomedacidade,nomedaequipe,descsituacao\n"
    "1000001,Taubaté,03- VAL - INSTALACAO F01,Pendente\n"
    "1000002,Adamantina,05 - ADA - INSTALACAO F 01,Pendente\n"
    "1000003,Lucélia,05 - ADA - MANUTENCAO F 07,Pendente\n"
    "1000004,Pindamonhangaba,03- VAL - INSTALACAO F08,Pendente\n"
)


def _numos(csv_text):
    return [linha.split(",")[0] for linha in csv_text.strip().splitlines()[1:]]


def test_cluster_vale_nao_recebe_linha_de_adamantina():
    assert _numos(_filter_csv_cluster(CSV, "VALE")) == ["1000001", "1000004"]


def test_cluster_adamantina_nao_recebe_linha_do_vale():
    assert _numos(_filter_csv_cluster(CSV, "ADAMANTINA")) == ["1000002", "1000003"]


def test_todos_devolve_tudo_sem_reescrever():
    assert _filter_csv_cluster(CSV, "TODOS") == CSV
    assert _filter_csv_cluster(CSV, None) == CSV


def test_cluster_desconhecido_nao_vaza_nada():
    """Fail-closed: chave estranha devolve vazio em vez do CSV inteiro."""
    assert _filter_csv_cluster(CSV, "OUTRA COISA") == ""


def test_escopo_combina_fornecedor_e_cluster():
    """WES só atende Pindamonhangaba, e no Vale — sobra só a 1000004."""
    assert _numos(_filter_csv_escopo(CSV, "WES", "VALE")) == ["1000004"]
    # o mesmo fornecedor, olhando Adamantina, nao tem nada
    assert _numos(_filter_csv_escopo(CSV, "WES", "ADAMANTINA")) == []


def test_escopo_sem_restricao_preserva_o_csv():
    assert _filter_csv_escopo(CSV, None, "TODOS") == CSV


# ── Migração e CRUD ─────────────────────────────────────────────────────────

def test_migracao_da_cluster_ao_usuario_existente(tmp_path):
    """Até Adamantina só existia dado do Vale: ninguém pode perder acesso."""
    caminho = str(tmp_path / "cluster_migracao.db")
    with patch("cabonnet.db._DB_PATH", caminho):
        con = sqlite3.connect(caminho)
        con.execute("""CREATE TABLE usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
            senha_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'viewer',
            ativo INTEGER NOT NULL DEFAULT 1, criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL)""")
        con.executemany(
            "INSERT INTO usuarios (username, senha_hash, role, criado_em, atualizado_em) VALUES (?,?,?,'x','x')",
            [("chefe", "h", "gestor"), ("campo", "h", "operador"), ("olhos", "h", "viewer")],
        )
        con.commit()
        con.close()

        db._db_init()

        por_nome = {u["username"]: u for u in db._db_list_usuarios()}
        assert por_nome["chefe"]["cluster_key"] == "TODOS"
        assert por_nome["campo"]["cluster_key"] == "VALE"
        assert por_nome["olhos"]["cluster_key"] == "VALE"


def test_migracao_e_idempotente(tmp_path):
    caminho = str(tmp_path / "cluster_idem.db")
    with patch("cabonnet.db._DB_PATH", caminho):
        db._db_init()
        uid = db._db_create_usuario("ada1", "h", "operador", None, "ADAMANTINA")
        db._db_init()  # roda de novo, como em todo startup
        assert db._db_get_usuario_by_id(uid)["cluster_key"] == "ADAMANTINA"


def test_api_valida_cluster_e_persiste(client, tmp_path):
    caminho = str(tmp_path / "cluster_api.db")
    with patch("cabonnet.db._DB_PATH", caminho):
        db._db_init()

        ruim = client.post("/api/usuarios", json={
            "username": "torto", "password": "senha12345", "role": "operador", "cluster_key": "VALE DO SOL",
        })
        assert ruim.status_code == 400

        ok = client.post("/api/usuarios", json={
            "username": "ada_op", "password": "senha12345", "role": "operador", "cluster_key": "ADAMANTINA",
        })
        assert ok.status_code in (200, 201)

        criado = next(u for u in client.get("/api/usuarios").json()["items"] if u["username"] == "ada_op")
        assert criado["cluster_key"] == "ADAMANTINA"

        movido = client.put("/api/usuarios/%d" % criado["id"], json={"cluster_key": "TODOS"})
        assert movido.status_code == 200
        assert db._db_get_usuario_by_id(criado["id"])["cluster_key"] == "TODOS"


def test_login_carrega_o_cluster_para_a_sessao(tmp_path):
    caminho = str(tmp_path / "cluster_login.db")
    with patch("cabonnet.db._DB_PATH", caminho):
        from cabonnet.auth import _authenticate
        from cabonnet.db import _hash_password
        db._db_init()
        db._db_create_usuario("ada2", _hash_password("senha12345"), "operador", None, "ADAMANTINA")
        assert _authenticate("ada2", "senha12345")["cluster_key"] == "ADAMANTINA"
