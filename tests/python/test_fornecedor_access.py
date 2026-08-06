# -*- coding: utf-8 -*-
"""Contrato de isolamento das contas externas de fornecedor."""

import sqlite3

from cabonnet import db
from cabonnet.app import _filter_csv_fornecedor


CSV = "numos,nomedaequipe,cliente\n0000001,EQUIPE F08,A\n0000002,EQUIPE F01,B\n0000003,EQUIPE F12,C\n"


def test_filtra_csv_por_fornecedor_sem_expor_outros():
    wes = _filter_csv_fornecedor(CSV, "WES")
    assert "0000001" in wes
    assert "0000002" not in wes
    assert "0000003" not in wes


def test_permissoes_de_fornecedor_sao_fixas():
    assert db._db_get_permissoes("fornecedor") == ["dashboard", "ordens", "graficos", "fornecedor"]


def test_usuario_fornecedor_persiste_vinculo():
    db._db_init()
    username = "fornecedor_vinculo_teste"
    uid = db._db_create_usuario(username, db._hash_password("senha-segura"), "fornecedor", "THM")
    try:
        user = db._db_get_usuario_by_username(username)
        assert user["role"] == "fornecedor"
        assert user["fornecedor_key"] == "THM"
    finally:
        with db.state._db_lock:
            con = sqlite3.connect(db._DB_PATH)
            con.execute("DELETE FROM usuarios WHERE id=?", (uid,))
            con.commit()
            con.close()
