import time
from unittest.mock import patch

from cabonnet import state
from cabonnet.motivos import (
    A_CONECT, A_CONFIG, A_EQUIP, A_NAOEXEC, A_REDE, A_SEMDESC,
    M_LENT, M_NAOCOMP, M_QUEDA, M_SEMDESC, M_SEMSINAL, M_WIFI,
    acao_equipe, classificar, motivo_abertura, separar,
)

OBS = (
    "CLIENTE INFORMANDO QUE ESTA SEM SINAL DESDE ONTEM\n"
    "Informações da Execução:\n"
    "Obs: TROCADO CONECTOR DA CTO, SINAL NORMALIZADO\n"
    "Nome Executante: FULANO"
)


def test_separa_abertura_e_execucao():
    abertura, execucao = separar(OBS)
    assert abertura == "CLIENTE INFORMANDO QUE ESTA SEM SINAL DESDE ONTEM"
    assert execucao == "TROCADO CONECTOR DA CTO, SINAL NORMALIZADO"


def test_sem_bloco_de_execucao_tudo_e_abertura():
    assert separar("RELATA LENTIDAO A NOITE") == ("RELATA LENTIDAO A NOITE", "")


def test_motivo_pela_caixa_marcada_no_roteiro():
    assert motivo_abertura("( ) SEM SINAL (X) QUEDAS ( ) OSCILACAO/LENTIDAO") == M_QUEDA
    assert motivo_abertura("(X) SEM SINAL ( ) QUEDAS") == M_SEMSINAL


def test_motivo_pelo_relato():
    assert motivo_abertura("cliente relatando lentidão na internet") == M_LENT
    assert motivo_abertura("ALEGA QUE ESTA SEM INTERNET") == M_SEMSINAL
    assert motivo_abertura("quer trocar a senha do wifi") == M_WIFI


def test_tecnico_nao_compareceu_tem_prioridade():
    assert motivo_abertura("OS CONSTA COMO EXECUTADA MAS NINGUEM VEIO, CLIENTE SEM SINAL") == M_NAOCOMP


def test_roteiro_padrao_sem_relato_nao_vira_motivo():
    # As perguntas fixas do roteiro ("houve queda de energia", "teste de velocidade") não são o problema.
    assert motivo_abertura("HOUVE QUEDA DE ENERGIA? NAO. TESTE DE VELOCIDADE") == M_SEMDESC


def test_acao_da_equipe():
    assert acao_equipe("TROCADO CONECTOR DA CTO") == A_CONECT
    assert acao_equipe("FEITO TROCA DA ONU, CLIENTE OK") == A_EQUIP
    assert acao_equipe("CTO SEM SINAL, PASSADO PARA REDE") == A_REDE
    assert acao_equipe("RECONFIGURADO ROTEADOR E ALTERADO CANAL") == A_CONFIG
    assert acao_equipe("CLIENTE AUSENTE") == A_NAOEXEC
    assert acao_equipe("") == A_SEMDESC


def test_classificar_junta_as_duas_partes():
    assert classificar(OBS) == {"motivo": M_SEMSINAL, "acao": A_CONECT}


def test_classificar_usa_observacao_critica_quando_nao_ha_observacao():
    assert classificar("", "CLIENTE RELATA QUEDAS CONSTANTES")["motivo"] == M_QUEDA


CSV = (
    "numos,nomecliente,observacoes,observacaocritica\n"
    '1234567,Cliente A,"' + OBS.replace('"', '""') + '",\n'
    "7654321,Cliente B,RELATA LENTIDAO,\n"
    "1111111,Cliente C,nao pedido,\n"
)


def test_endpoint_devolve_rotulos_sem_o_texto(client):
    cached = {"pendente": "", "agendado": CSV, "futuro": "", "ts": time.time()}
    with patch.dict(state._query_cache, cached, clear=True):
        response = client.post("/api/os-motivos", json={"numos": ["1234567", "7654321"]})
    assert response.status_code == 200
    items = response.json()["items"]
    assert set(items) == {"1234567", "7654321"}
    assert items["1234567"] == {"motivo": M_SEMSINAL, "acao": A_CONECT}
    assert items["7654321"]["motivo"] == M_LENT
    assert "observacoes" not in items["1234567"]


def test_endpoint_rejeita_numos_que_nao_e_lista(client):
    response = client.post("/api/os-motivos", json={"numos": "1234567"})
    assert response.status_code == 400
