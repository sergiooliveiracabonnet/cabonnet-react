# -*- coding: utf-8 -*-
"""Potencias por cliente da PON: cadastro editavel, preenchido aos poucos."""

from unittest.mock import patch

from cabonnet import db

PON_KEY = "OLT Caçapava · 2/1"
SNAPSHOT = {
    "olt": "OLT Caçapava", "pon": "2/1", "cidade": "Cacapava", "bairro": "VITORIA VALE",
    "total": 3, "criticos": 3, "concentracao": 1.0, "rxMediano": -28.4, "piorRx": -31.2, "nivel": "alto",
}
MEDICOES = [
    {"onu_key": "ABC1", "cliente": "Cliente A", "onu": "1", "serial": "ABC1",
     "rx_antes": -29.5, "rx_depois": -22.3, "observacao": "Conector trocado"},
    {"onu_key": "ABC2", "cliente": "Cliente B", "onu": "2", "serial": "ABC2",
     "rx_antes": -31.2, "rx_depois": None, "observacao": ""},
]


def _tratar(client, medicoes=None):
    body = {"pon_key": PON_KEY, "snapshot": SNAPSHOT}
    if medicoes is not None:
        body["medicoes"] = medicoes
    return client.post("/api/nivel-sinal/pon/tratar", json=body)


def test_tratar_guarda_as_potencias_junto_da_tratativa(client, tmp_path):
    with patch("cabonnet.db._DB_PATH", str(tmp_path / "medicoes_tratar.db")):
        db._db_init()

        item = _tratar(client, MEDICOES).json()["items"][0]
        assert item["action"] == "tratada"
        assert [m["onu_key"] for m in item["medicoes"]] == ["ABC1", "ABC2"]
        assert item["medicoes"][0]["rx_depois"] == -22.3
        assert item["medicoes"][0]["observacao"] == "Conector trocado"
        # Deixar em branco e completar depois e o fluxo normal, nao um erro.
        assert item["medicoes"][1]["rx_depois"] is None


def test_medicoes_podem_ser_completadas_depois_sem_novo_ciclo(client, tmp_path):
    with patch("cabonnet.db._DB_PATH", str(tmp_path / "medicoes_editar.db")):
        db._db_init()
        _tratar(client, MEDICOES)

        completo = [dict(MEDICOES[0]), {**MEDICOES[1], "rx_depois": -24.1, "observacao": "Fusao refeita"}]
        response = client.post("/api/nivel-sinal/pon/medicoes", json={"pon_key": PON_KEY, "medicoes": completo})
        assert response.status_code == 200

        item = response.json()["items"][0]
        assert item["medicoes"][1]["rx_depois"] == -24.1
        assert item["medicoes"][1]["observacao"] == "Fusao refeita"
        # Editar potencia nao e tratar de novo: os contadores de ciclo ficam parados.
        assert item["treated_count"] == 1
        assert item["reopened_count"] == 0


def test_salvar_substitui_a_lista_inteira_da_pon(client, tmp_path):
    with patch("cabonnet.db._DB_PATH", str(tmp_path / "medicoes_replace.db")):
        db._db_init()
        _tratar(client, MEDICOES)

        client.post("/api/nivel-sinal/pon/medicoes", json={"pon_key": PON_KEY, "medicoes": [MEDICOES[0]]})
        item = client.get("/api/nivel-sinal/pons-tratadas").json()["items"][0]
        assert [m["onu_key"] for m in item["medicoes"]] == ["ABC1"]


def test_medicoes_nao_vazam_entre_pons(client, tmp_path):
    with patch("cabonnet.db._DB_PATH", str(tmp_path / "medicoes_isolamento.db")):
        db._db_init()
        _tratar(client, MEDICOES)
        client.post("/api/nivel-sinal/pon/tratar", json={"pon_key": "OLT Taubaté 1 · 3/4", "snapshot": SNAPSHOT})

        items = {item["pon_key"]: item for item in client.get("/api/nivel-sinal/pons-tratadas").json()["items"]}
        assert len(items[PON_KEY]["medicoes"]) == 2
        assert items["OLT Taubaté 1 · 3/4"]["medicoes"] == []


def test_tratar_sem_medicoes_preserva_o_que_ja_estava_salvo(client, tmp_path):
    """Reabrir e tratar de novo nao pode apagar as potencias medidas no ciclo anterior."""
    with patch("cabonnet.db._DB_PATH", str(tmp_path / "medicoes_preserva.db")):
        db._db_init()
        _tratar(client, MEDICOES)
        client.post("/api/nivel-sinal/pon/reabrir", json={"pon_key": PON_KEY, "snapshot": SNAPSHOT})

        item = _tratar(client).json()["items"][0]
        assert [m["onu_key"] for m in item["medicoes"]] == ["ABC1", "ABC2"]


def test_payload_invalido_e_recusado(client, tmp_path):
    with patch("cabonnet.db._DB_PATH", str(tmp_path / "medicoes_invalida.db")):
        db._db_init()
        assert client.post("/api/nivel-sinal/pon/medicoes", json={"pon_key": " ", "medicoes": []}).status_code == 400
        assert client.post("/api/nivel-sinal/pon/medicoes", json={"pon_key": PON_KEY, "medicoes": {}}).status_code == 400
        assert client.post("/api/nivel-sinal/pon/tratar", json={"pon_key": PON_KEY, "snapshot": {}, "medicoes": "x"}).status_code == 400


def test_potencia_ilegivel_vira_pendente_em_vez_de_quebrar(client, tmp_path):
    with patch("cabonnet.db._DB_PATH", str(tmp_path / "medicoes_ilegivel.db")):
        db._db_init()
        _tratar(client, [{"onu_key": "ABC1", "cliente": "Cliente A", "rx_antes": "-29,5", "rx_depois": "abc"}])

        medicao = client.get("/api/nivel-sinal/pons-tratadas").json()["items"][0]["medicoes"][0]
        assert medicao["rx_antes"] == -29.5
        assert medicao["rx_depois"] is None
        assert medicao["serial"] == ""


def test_medicao_sem_onu_key_e_descartada(client, tmp_path):
    with patch("cabonnet.db._DB_PATH", str(tmp_path / "medicoes_sem_chave.db")):
        db._db_init()
        _tratar(client, [{"cliente": "Sem chave"}, MEDICOES[0]])

        item = client.get("/api/nivel-sinal/pons-tratadas").json()["items"][0]
        assert [m["onu_key"] for m in item["medicoes"]] == ["ABC1"]


def test_onu_key_repetida_nao_derruba_a_gravacao_nem_trava_o_banco(client, tmp_path):
    """Dois assinantes sem serial/ONU/codigo caem na mesma chave. O UNIQUE da tabela
    nao pode estourar no meio da transacao: a conexao ficava aberta e o SQLite
    inteiro travava para toda escrita seguinte, ate reiniciar o processo."""
    with patch("cabonnet.db._DB_PATH", str(tmp_path / "medicoes_duplicada.db")):
        db._db_init()
        repetida = [
            {"onu_key": "JOSE DA SILVA", "cliente": "Jose da Silva", "rx_antes": -29.0, "rx_depois": -22.0},
            {"onu_key": "JOSE DA SILVA", "cliente": "Jose da Silva", "rx_antes": -30.0, "rx_depois": None},
        ]
        assert _tratar(client, repetida).status_code == 200

        item = client.get("/api/nivel-sinal/pons-tratadas").json()["items"][0]
        assert [m["onu_key"] for m in item["medicoes"]] == ["JOSE DA SILVA"]
        assert item["medicoes"][0]["rx_depois"] == -22.0

        # O banco continua escrevendo: nenhuma conexao ficou pendurada.
        outra = client.post("/api/nivel-sinal/pon/tratar", json={"pon_key": "OLT Taubaté 1 · 9/9", "snapshot": SNAPSHOT})
        assert outra.status_code == 200


def test_potencia_nao_finita_vira_pendente_para_o_json_seguir_valido(client, tmp_path):
    """float('nan') passa pelo float() e o json.dumps grava NaN literal — JSON invalido
    que o navegador recusa, derrubando a listagem inteira, nao so a PON ruim."""
    with patch("cabonnet.db._DB_PATH", str(tmp_path / "medicoes_nao_finita.db")):
        db._db_init()
        _tratar(client, [
            {"onu_key": "ABC1", "cliente": "Cliente A", "rx_depois": "nan"},
            {"onu_key": "ABC2", "cliente": "Cliente B", "rx_depois": "1e400"},
            {"onu_key": "ABC3", "cliente": "Cliente C", "rx_antes": "-inf", "rx_depois": -22.0},
        ])

        response = client.get("/api/nivel-sinal/pons-tratadas")
        assert "NaN" not in response.text and "Infinity" not in response.text
        medicoes = response.json()["items"][0]["medicoes"]
        assert [m["rx_depois"] for m in medicoes] == [None, None, -22.0]
        assert medicoes[2]["rx_antes"] is None


def test_chave_do_assinante_atravessa_o_banco_intacta(client, tmp_path):
    """A onu_key e o codigo do assinante, que nao muda quando a ONU e trocada.
    Se o banco a alterasse, a tela perderia o vinculo e a PON ficaria pendente."""
    with patch("cabonnet.db._DB_PATH", str(tmp_path / "medicoes_chave.db")):
        db._db_init()
        _tratar(client, [{"onu_key": "98765", "cliente": "Cliente A", "serial": "ABC1",
                          "rx_antes": -29.5, "rx_depois": -22.3}])

        medicao = client.get("/api/nivel-sinal/pons-tratadas").json()["items"][0]["medicoes"][0]
        assert medicao["onu_key"] == "98765"
        assert medicao["serial"] == "ABC1"


def test_medicoes_de_pon_desconhecida_sao_recusadas(client, tmp_path):
    """O cadastro de potencia pertence a uma tratativa: sem ela nao ha o que completar."""
    with patch("cabonnet.db._DB_PATH", str(tmp_path / "medicoes_pon_fantasma.db")):
        db._db_init()
        response = client.post("/api/nivel-sinal/pon/medicoes",
                               json={"pon_key": "OLT Fantasma · 9/9", "medicoes": MEDICOES})
        assert response.status_code == 404
