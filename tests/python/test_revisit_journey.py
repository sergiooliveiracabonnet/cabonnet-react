from cabonnet.revisit_journey import annotate_revisit_types, build_revisit_journeys


def _row(numos, recurrence, date, **overrides):
    return {
        "numos": str(numos),
        "recorrencia": recurrence,
        "dataexecucao": date,
        "codigocontrato": "1001",
        "codigocliente": "C1",
        "nomedacidade": "Taubaté",
        "servico": "ASSISTENCIA TECNICA",
        "tiposervico": "MANUTENCAO",
        "equipeexecutou": "F01",
        # A fonte (imanager_bi) sempre entrega as três flags zeradas.
        "revisita_inst": 0,
        "revisita_manut": 0,
        "revisita_serv": 0,
        **overrides,
    }


def test_pairs_official_revisit_with_immediately_previous_contract_visit():
    rows = [
        _row(9000001, 0, "02/07/2026"),
        _row(9000002, 1, "05/07/2026", equipeexecutou="F08"),
        _row(9000003, 2, "09/07/2026", equipeexecutou="F12"),
    ]

    result = build_revisit_journeys(rows)

    assert result[0]["origin_os"] == "9000001"
    assert result[0]["revisit_os"] == "9000002"
    assert result[0]["days_between"] == 3
    assert result[0]["same_team"] is False
    assert result[0]["link_confidence"] == "high"
    assert result[1]["origin_os"] == "9000002"
    assert result[1]["revisit_os"] == "9000003"


def test_does_not_cross_contracts_for_same_customer():
    rows = [
        _row(9000010, 0, "01/07/2026", codigocontrato="A"),
        _row(9000011, 1, "03/07/2026", codigocontrato="B"),
    ]

    result = build_revisit_journeys(rows)

    assert result[0]["revisit_os"] == "9000011"
    assert result[0]["origin_os"] is None
    assert result[0]["link_confidence"] == "unlinked"


def test_can_link_across_month_boundary():
    rows = [
        _row(9000020, 0, "31/07/2026"),
        _row(9000021, 1, "01/08/2026"),
    ]

    result = build_revisit_journeys(rows)

    assert result[0]["origin_os"] == "9000020"
    assert result[0]["days_between"] == 1


def test_ignores_non_revisits_and_rejects_future_origin():
    rows = [
        _row(9000030, 1, "02/07/2026"),
        _row(9000031, 0, "05/07/2026"),
    ]

    result = build_revisit_journeys(rows)

    assert len(result) == 1
    assert result[0]["origin_os"] is None


def test_uses_customer_code_only_when_contract_is_missing_on_both_rows():
    rows = [
        _row(9000040, 0, "01/07/2026", codigocontrato=""),
        _row(9000041, 1, "04/07/2026", codigocontrato=""),
    ]

    result = build_revisit_journeys(rows)

    assert result[0]["origin_os"] == "9000040"
    assert result[0]["link_basis"] == "customer"
    assert result[0]["link_confidence"] == "medium"


def test_never_links_different_cities():
    rows = [
        _row(9000050, 0, "01/07/2026", nomedacidade="Taubaté"),
        _row(9000051, 1, "04/07/2026", nomedacidade="Caçapava"),
    ]

    result = build_revisit_journeys(rows)

    assert result[0]["origin_os"] is None


def test_origem_de_instalacao_sozinha_nao_classifica_como_instalacao():
    """A regra da origem vale para manutenção e serviço. Instalação tem marcador
    próprio — o serviço oficial de 30 dias — e só ele conta."""
    rows = [
        _row(9000060, 0, "01/07/2026", tiposervico="INSTALACAO", servico="INSTALACAO FTTH"),
        _row(9000061, 1, "05/07/2026", tiposervico="MANUTENCAO", servico="ASSISTENCIA - VT 24H",
             revisita_manut=1),
    ]

    annotated = annotate_revisit_types(rows)
    revisit = next(row for row in annotated if row["numos"] == "9000061")

    assert revisit["revisita_inst"] == 0
    assert revisit["revisita_manut"] == 1


def test_second_maintenance_return_is_revisit_maintenance():
    rows = [
        _row(9000070, 0, "01/07/2026", tiposervico="MANUTENCAO"),
        _row(9000071, 1, "05/07/2026", tiposervico="MANUTENCAO"),
    ]

    revisit = annotate_revisit_types(rows)[1]

    assert revisit["revisita_inst"] == 0
    assert revisit["revisita_manut"] == 1


# A origem pode estar fora do recorte buscado (revisita no começo da janela) ou a
# linha pode não ter data de execução parseável. Nesses casos a jornada não linka
# — e zerar a flag que a fonte já trouxe fazia a revisita sumir das três abas.
def test_keeps_source_flag_when_journey_has_no_origin():
    rows = [_row(9000080, 1, "05/07/2026", revisita_manut=1)]

    revisit = annotate_revisit_types(rows)[0]

    assert revisit["revisita_manut"] == 1


def test_keeps_source_flag_when_execution_date_is_missing():
    rows = [
        _row(9000090, 0, "01/07/2026", tiposervico="INSTALACAO", servico="INSTALACAO FTTH"),
        _row(9000091, 1, "", revisita_manut=1),
    ]

    revisit = next(row for row in annotate_revisit_types(rows) if row["numos"] == "9000091")

    assert revisit["revisita_manut"] == 1


# "ASSISTENCIA - PRIMEIRA CONEXAO 30 D" é o RETORNO pós-instalação, não a
# instalação. Casar "PRIMEIRA CONEXAO" solto marcava 142 dessas como origem de
# instalação na base real — e nenhuma instalação de verdade.
def test_assistencia_pos_instalacao_nao_e_instalacao():
    rows = [
        _row(9000110, 0, "01/07/2026", tiposervico="MANUTENCAO",
             servico="ASSISTENCIA - PRIMEIRA CONEXAO 30 D"),
        _row(9000111, 1, "05/07/2026"),
    ]

    revisit = annotate_revisit_types(rows)[1]

    assert revisit["revisita_inst"] == 0


# Entre a instalação e o retorno quase sempre entram outras OS (upgrade,
# transferência, troca). Exigir que a instalação seja a visita IMEDIATAMENTE
# anterior zerava a aba: na base real só 29 de 1758 revisitas casavam.
def test_instalacao_conta_mesmo_com_outra_os_no_meio():
    rows = [
        _row(9000120, 0, "01/07/2026", tiposervico="INSTALACAO PRINCIPAL",
             servico="PRIMEIRA CONEXAO DO ASSINANTE"),
        _row(9000121, 0, "05/07/2026", tiposervico="SERVICOS",
             servico="ALTERACAO DE PROGRAMACAO - UPGRADE"),
        _row(9000122, 0, "10/07/2026", servico="ASSISTENCIA - PRIMEIRA CONEXAO 30 DIAS"),
    ]

    revisit = next(row for row in annotate_revisit_types(rows) if row["numos"] == "9000122")

    assert revisit["revisita_inst"] == 1
    assert revisit["revisita_serv"] == 0


def test_instalacao_fora_da_janela_nao_conta_como_revisita_de_instalacao():
    rows = [
        _row(9000130, 0, "01/06/2026", tiposervico="INSTALACAO PRINCIPAL",
             servico="PRIMEIRA CONEXAO DO ASSINANTE"),
        _row(9000131, 0, "20/07/2026", servico="ASSISTENCIA - PRIMEIRA CONEXAO 30 DIAS"),
    ]

    revisit = next(row for row in annotate_revisit_types(rows) if row["numos"] == "9000131")

    assert revisit["revisita_inst"] == 0


def test_instalacao_de_outro_contrato_nao_conta():
    rows = [
        _row(9000140, 0, "01/07/2026", codigocontrato="OUTRO",
             tiposervico="INSTALACAO PRINCIPAL", servico="PRIMEIRA CONEXAO DO ASSINANTE"),
        _row(9000141, 0, "10/07/2026", servico="ASSISTENCIA - PRIMEIRA CONEXAO 30 DIAS"),
    ]

    revisit = next(row for row in annotate_revisit_types(rows) if row["numos"] == "9000141")

    assert revisit["revisita_inst"] == 0


def test_duplicate_numos_does_not_move_flag_to_the_wrong_row():
    rows = [
        _row(9000100, 0, "01/07/2026", tiposervico="INSTALACAO PRINCIPAL",
             servico="PRIMEIRA CONEXAO DO ASSINANTE"),
        _row(9000101, 1, "05/07/2026", servico="ASSISTENCIA - PRIMEIRA CONEXAO 30 DIAS"),
        _row(9000101, 0, "02/07/2026", codigocontrato="OUTRO", nomedacidade="Caçapava"),
    ]

    annotated = annotate_revisit_types(rows)

    assert annotated[1]["revisita_inst"] == 1
    assert annotated[2]["revisita_inst"] == 0


# ── Revisita de instalação = o serviço oficial de 30 dias ────────────────────
# Decisão de negócio (2026-08-05): a categoria passa a ser o serviço que a
# própria operação criou para o retorno pós-instalação. O campo `recorrencia`
# deixa de ser pré-requisito aqui — dos 142 desses serviços na base real, só 9
# tinham recorrencia > 0, e a aba mostrava esses 9.

def test_servico_oficial_de_30_dias_conta_mesmo_sem_recorrencia():
    rows = [
        _row(9000200, 0, "01/07/2026", tiposervico="INSTALACAO PRINCIPAL",
             servico="PRIMEIRA CONEXAO DO ASSINANTE"),
        _row(9000201, 0, "10/07/2026", servico="ASSISTENCIA - PRIMEIRA CONEXAO 30 DIAS"),
    ]

    revisit = next(row for row in annotate_revisit_types(rows) if row["numos"] == "9000201")

    assert revisit["revisita_inst"] == 1


def test_servico_oficial_sem_instalacao_na_janela_nao_conta():
    rows = [
        _row(9000210, 0, "01/05/2026", tiposervico="INSTALACAO PRINCIPAL",
             servico="PRIMEIRA CONEXAO DO ASSINANTE"),
        _row(9000211, 0, "20/07/2026", servico="ASSISTENCIA - PRIMEIRA CONEXAO 30 DIAS"),
    ]

    revisit = next(row for row in annotate_revisit_types(rows) if row["numos"] == "9000211")

    assert revisit["revisita_inst"] == 0


def test_vt_apos_instalacao_nao_e_mais_revisita_de_instalacao():
    """Só o serviço oficial conta — um VT 24H no mesmo prazo não entra."""
    rows = [
        _row(9000220, 0, "01/07/2026", tiposervico="INSTALACAO PRINCIPAL",
             servico="PRIMEIRA CONEXAO DO ASSINANTE"),
        _row(9000221, 1, "10/07/2026", servico="ASSISTENCIA - VT 24H", revisita_manut=1),
    ]

    revisit = next(row for row in annotate_revisit_types(rows) if row["numos"] == "9000221")

    assert revisit["revisita_inst"] == 0
