# -*- coding: utf-8 -*-
"""
Testes dos endpoints de dados: /query, /revisitas, /detalhes.

grafana_post mockada para retornar {} → frames_to_csv({}) → None → CSV vazio.
Os endpoints degradam graciosamente: retornam estrutura válida com dados vazios.
"""


def test_query_returns_expected_keys(client):
    r = client.get("/query")
    assert r.status_code == 200
    data = r.json()
    for key in ("pendente", "agendado", "futuro", "n_pendente", "n_agendado", "n_futuro", "date"):
        assert key in data, f"chave ausente: {key}"
    assert isinstance(data["n_pendente"], int)


def test_query_v1_path(client):
    """Mesmo endpoint acessível via prefixo versionado."""
    r = client.get("/api/v1/query")
    assert r.status_code == 200
    assert "pendente" in r.json()


def test_query_legacy_and_v1_consistent(client):
    r_legacy = client.get("/query")
    r_v1     = client.get("/api/v1/query")
    assert r_legacy.status_code == r_v1.status_code == 200


def test_query_with_date_param(client):
    r = client.get("/query?date=hoje")
    assert r.status_code == 200


def test_query_invalid_date_param(client):
    r = client.get("/query?date=INVALIDO_QUE_NAO_EXISTE")
    assert r.status_code == 400


def test_revisitas_returns_expected_keys(client):
    r = client.get("/revisitas")
    assert r.status_code == 200
    data = r.json()
    assert "concluidas" in data
    assert "n" in data
    assert isinstance(data["n"], int)


def test_revisitas_v1_path(client):
    r = client.get("/api/v1/revisitas")
    assert r.status_code == 200
    assert "concluidas" in r.json()


def test_detalhes_non_numeric_numos_returns_400(client):
    r = client.get("/detalhes?numos=abc")
    assert r.status_code == 400


def test_detalhes_numeric_numos_not_found(client):
    """Numos numérico válido que não existe no Grafana mockado → 404."""
    r = client.get("/detalhes?numos=1234567")
    assert r.status_code == 404


def test_stats_returns_expected_keys(client):
    r = client.get("/stats")
    assert r.status_code == 200
    data = r.json()
    assert "fila" in data
    assert "por_cidade" in data
    assert "por_tipo" in data
    fila = data["fila"]
    for key in ("pendente", "atendimento", "total", "rede", "criticas",
                "sem_equipe", "sem_agendamento", "sla_pct", "aging_med", "aging_dist"):
        assert key in fila, f"chave ausente em fila: {key}"
    assert isinstance(fila["total"], int)
    assert isinstance(fila["sla_pct"], int)
    assert isinstance(data["por_cidade"], list)
    assert isinstance(data["por_tipo"], list)


def test_stats_v1_path(client):
    r = client.get("/api/v1/stats")
    assert r.status_code == 200
    assert "fila" in r.json()


def test_stats_fila_totals_consistent(client):
    """pendente + atendimento deve ser igual a total."""
    data = client.get("/stats").json()
    f = data["fila"]
    assert f["pendente"] + f["atendimento"] == f["total"]


def test_stats_sla_pct_range(client):
    """SLA % deve estar entre 0 e 100."""
    data = client.get("/stats").json()
    assert 0 <= data["fila"]["sla_pct"] <= 100


from unittest.mock import patch


def _grafana_frame(fields_values):
    """Monta um payload Grafana válido a partir de {nome_coluna: [valores]}."""
    fields = [{"name": k} for k in fields_values]
    values = list(fields_values.values())
    return {"results": {"A": {"frames": [{"schema": {"fields": fields}, "data": {"values": values}}]}}}


def test_detalhes_loga_warning_quando_mobile_falha(client, caplog):
    """Quando as queries do schema mobile falham (ex: permission denied),
    o erro deve ser logado, não silenciado."""
    main_row = _grafana_frame({"numos": [9999999], "nomecliente": ["Cliente Teste"]})
    with patch(
        "cabonnet.app.grafana_post",
        side_effect=[
            main_row,
            Exception("permission denied for schema mobile"),  # ocorrencias
            Exception("permission denied for schema mobile"),  # equipe_reagendou
            Exception("permission denied for schema mobile"),  # materiais_utilizados
            Exception("permission denied for schema mobile"),  # materiais_retirados
            Exception("permission denied for schema mobile"),  # fotos
            Exception("permission denied for schema mobile"),  # checklist
        ],
    ):
        with caplog.at_level("WARNING"):
            r = client.get("/detalhes?numos=9999999")
    assert r.status_code == 200
    assert "permission denied" in caplog.text


def test_detalhes_inclui_fotos_checklist_e_motivo(client):
    main_row = _grafana_frame({
        "numos": [9999999],
        "nomecliente": ["Cliente Teste"],
        "motivoinconclusivo": ["Cliente ausente no local"],
    })
    fotos_frame = _grafana_frame({
        "id": [1], "codfoto": [10], "nomearquivo": ["foto1.jpg"],
        "descricao": ["Fachada"], "usuario": ["tecnico1"], "extensaoarquivo": ["jpg"],
    })
    checklist_frame = _grafana_frame({
        "descricaoservico": ["Instalação"],
        "descricaochecklist": ["Testou sinal de internet"],
        "checked": [True],
    })
    with patch(
        "cabonnet.app.grafana_post",
        side_effect=[
            main_row,
            Exception("sem ocorrencias"),
            Exception("sem equipe_reagendou"),
            Exception("sem materiais_utilizados"),
            Exception("sem materiais_retirados"),
            fotos_frame,
            checklist_frame,
        ],
    ):
        r = client.get("/detalhes?numos=9999999")
    assert r.status_code == 200
    data = r.json()
    assert data["motivoinconclusivo"] == "Cliente ausente no local"
    assert data["fotos"] == [
        {"id": 1, "codfoto": 10, "nomearquivo": "foto1.jpg", "descricao": "Fachada", "usuario": "tecnico1", "extensaoarquivo": "jpg"}
    ]
    assert data["checklist"] == [
        {"servico": "Instalação", "descricao": "Testou sinal de internet", "checked": True}
    ]


def test_detalhes_motivo_inconclusivo_null_quando_vazio(client):
    """frames_to_dict_list converte NULL em '' — o endpoint deve normalizar para None."""
    main_row = _grafana_frame({"numos": [8888888], "nomecliente": ["Outro Cliente"]})
    with patch(
        "cabonnet.app.grafana_post",
        side_effect=[main_row, Exception(), Exception(), Exception(), Exception(), {}, {}],
    ):
        r = client.get("/detalhes?numos=8888888")
    assert r.status_code == 200
    assert r.json()["motivoinconclusivo"] is None


import base64 as _b64


def test_detalhes_foto_parametros_invalidos_retorna_400(client):
    assert client.get("/detalhes/foto?numos=abc&codfoto=1").status_code == 400
    assert client.get("/detalhes/foto?numos=123&codfoto=abc").status_code == 400


def test_detalhes_foto_nao_encontrada_retorna_404(client):
    with patch("cabonnet.app.grafana_post", return_value={}):
        r = client.get("/detalhes/foto?numos=9999999&codfoto=1")
    assert r.status_code == 404


def test_detalhes_foto_retorna_bytes_corretos(client):
    fake_bytes = b"FAKEJPEGDATA12345"
    b64 = _b64.b64encode(fake_bytes).decode("ascii")
    frame = _grafana_frame({"imagem_b64": [b64], "extensaoarquivo": ["jpg"]})
    with patch("cabonnet.app.grafana_post", return_value=frame):
        r = client.get("/detalhes/foto?numos=9999999&codfoto=10")
    assert r.status_code == 200
    assert r.content == fake_bytes
    assert r.headers["content-type"] == "image/jpg"


def test_detalhes_foto_extensao_nao_permitida_cai_para_jpg(client):
    """extensaoarquivo fora do allowlist (incluindo valores com caracteres
    de controle embutidos) nunca deve ser refletido cru no content-type."""
    fake_bytes = b"FAKEDATA"
    b64 = _b64.b64encode(fake_bytes).decode("ascii")
    frame = _grafana_frame({"imagem_b64": [b64], "extensaoarquivo": ["jpg\r\nX-Evil: 1"]})
    with patch("cabonnet.app.grafana_post", return_value=frame):
        r = client.get("/detalhes/foto?numos=9999999&codfoto=10")
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/jpg"


def test_detalhes_foto_extensao_ausente_usa_fallback_jpg(client):
    fake_bytes = b"FAKEDATA"
    b64 = _b64.b64encode(fake_bytes).decode("ascii")
    frame = _grafana_frame({"imagem_b64": [b64], "extensaoarquivo": [""]})
    with patch("cabonnet.app.grafana_post", return_value=frame):
        r = client.get("/detalhes/foto?numos=9999999&codfoto=10")
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/jpg"


def test_os_execucao_geo_retorna_lista_vazia_quando_sem_dados(client):
    with patch("cabonnet.app.grafana_post", return_value={}):
        r = client.get("/erp/os-execucao-geo")
    assert r.status_code == 200
    assert r.json() == []


def test_os_execucao_geo_retorna_pontos(client):
    frame = _grafana_frame({
        "numos": [9999999],
        "latitudeinicio": ["-23.1896"],
        "longitudeinicio": ["-45.8841"],
        "equipeagendada": ["F01 - Equipe Teste"],
    })
    with patch("cabonnet.app.grafana_post", return_value=frame):
        r = client.get("/erp/os-execucao-geo")
    assert r.status_code == 200
    assert r.json() == [{
        "numos": 9999999,
        "latitudeinicio": "-23.1896",
        "longitudeinicio": "-45.8841",
        "equipeagendada": "F01 - Equipe Teste",
    }]


def test_os_execucao_geo_degrada_sem_erro_quando_falha(client):
    with patch("cabonnet.app.grafana_post", side_effect=Exception("permission denied for schema mobile")):
        r = client.get("/erp/os-execucao-geo")
    assert r.status_code == 200
    assert r.json() == []
