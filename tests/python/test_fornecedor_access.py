# -*- coding: utf-8 -*-
"""Contrato de isolamento das contas externas de fornecedor."""

import sqlite3

from cabonnet import db
from cabonnet.app import _filter_csv_fornecedor, _supplier_path_allowed


CSV = "numos,nomedaequipe,cliente\n0000001,EQUIPE F08,A\n0000002,EQUIPE F01,B\n0000003,EQUIPE F12,C\n"


def test_filtra_csv_por_fornecedor_sem_expor_outros():
    wes = _filter_csv_fornecedor(CSV, "WES")
    assert "0000001" in wes
    assert "0000002" not in wes
    assert "0000003" not in wes


def test_permissoes_de_fornecedor_sao_fixas():
    assert db._db_get_permissoes("fornecedor") == ["dashboard", "ordens", "graficos", "fornecedor"]


def test_fornecedor_e_bloqueado_por_padrao_em_rotas_internas():
    assert _supplier_path_allowed("/query", "GET") is True
    assert _supplier_path_allowed("/detalhes/foto", "GET") is True
    assert _supplier_path_allowed("/notify/telegram", "POST") is False
    assert _supplier_path_allowed("/juniper", "GET") is False
    assert _supplier_path_allowed("/ai/chat", "POST") is False
    assert _supplier_path_allowed("/grafana/os-totais", "GET") is False


def test_export_bruto_exige_autenticacao(client):
    from unittest.mock import patch
    with patch("cabonnet.app._auth_enabled", return_value=True):
        response = client.get("/pendente")
    assert response.status_code == 401


def test_sessao_fornecedor_nao_pode_disparar_telegram(client):
    from cabonnet.auth import _create_session
    from unittest.mock import patch
    token = _create_session("fornecedor", "instacable_teste", "Instacable")
    with patch("cabonnet.app._auth_enabled", return_value=True):
        response = client.post(
            "/notify/telegram",
            headers={"Cookie": f"cbn_session={token}"},
            json={"text": "nao deve enviar"},
        )
    assert response.status_code == 403


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
