from unittest.mock import patch


ROWS = [
    {
        "numos": "9000100", "recorrencia": 0, "datacadastro": "29/07/2026",
        "dataexecucao": "31/07/2026", "codigocontrato": "77", "codigocliente": "7",
        "nomedacidade": "Taubaté", "equipeexecutou": "F01",
    },
    {
        "numos": "9000101", "recorrencia": 1, "datacadastro": "01/08/2026",
        "dataexecucao": "01/08/2026", "codigocontrato": "77", "codigocliente": "7",
        "nomedacidade": "Taubaté", "equipeexecutou": "F08",
    },
    {
        "numos": "9000102", "recorrencia": 1, "datacadastro": "01/07/2026",
        "dataexecucao": "02/07/2026", "codigocontrato": "88", "codigocliente": "8",
        "nomedacidade": "Taubaté", "equipeexecutou": "F01",
    },
]


def test_endpoint_keeps_history_for_pairing_but_filters_returned_revisits(client):
    with patch("cabonnet.imanager_bi.fetch_bi_rows", return_value=ROWS):
        response = client.get("/api/revisit-journeys?inicio=2026-08-01&fim=2026-09-01")

    assert response.status_code == 200
    data = response.json()
    assert data["n"] == 1
    assert data["linked"] == 1
    assert data["unlinked"] == 0
    assert data["journeys"][0]["origin_os"] == "9000100"
    assert data["journeys"][0]["revisit_os"] == "9000101"
    assert data["source"] == "imanager-powerbi-report-21"


def test_endpoint_rejects_invalid_period(client):
    response = client.get("/api/revisit-journeys?inicio=01/08/2026&fim=2026-09-01")

    assert response.status_code == 400
