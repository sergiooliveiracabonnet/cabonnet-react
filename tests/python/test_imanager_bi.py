from cabonnet.imanager_bi import decode_dsr_rows, normalize_bi_rows


def test_decode_dsr_rows_expands_dictionary_repeats_and_nulls():
    data = {
        "descriptor": {
            "Select": [
                {"Value": "G0", "Name": "BacklogSemDuplicacao.cidade"},
                {"Value": "G1", "Name": "Sum(BacklogSemDuplicacao.numos)"},
                {"Value": "M0", "Name": "Sum(BacklogSemDuplicacao.recorrencia)"},
            ]
        },
        "dsr": {
            "DS": [{
                "PH": [{"DM0": [{"S": [{"N": "A0"}], "C": [1]}]}, {
                    "DM1": [
                        {
                            "S": [
                                {"N": "G0", "DN": "D0"},
                                {"N": "G1"},
                                {"N": "M0"},
                            ],
                            "C": [0, 9123456, 0],
                        },
                        # cidade repetida (R bit 0), recorrencia nula (null bit 2)
                        {"C": [9123457], "R": 1, "Ø": 4},
                    ]
                }],
                "ValueDicts": {"D0": ["TAUBATE"]},
            }]
        },
    }

    assert decode_dsr_rows(data) == [
        {
            "BacklogSemDuplicacao.cidade": "TAUBATE",
            "Sum(BacklogSemDuplicacao.numos)": 9123456,
            "Sum(BacklogSemDuplicacao.recorrencia)": 0,
        },
        {
            "BacklogSemDuplicacao.cidade": "TAUBATE",
            "Sum(BacklogSemDuplicacao.numos)": 9123457,
            "Sum(BacklogSemDuplicacao.recorrencia)": None,
        },
    ]


def test_normalize_bi_rows_uses_official_recurrence_and_discards_totals():
    rows = [
        {
            "BacklogSemDuplicacao.cidade": "TAUBATE",
            "Sum(BacklogSemDuplicacao.numos)": 9123456,
            "BacklogSemDuplicacao.nometiposervico": "MANUTENCAO",
            "Sum(BacklogSemDuplicacao.recorrencia)": 0,
        },
        {
            "BacklogSemDuplicacao.cidade": "TREMEMBE",
            "Sum(BacklogSemDuplicacao.numos)": 9123457,
            "BacklogSemDuplicacao.nometiposervico": "MANUTENCAO",
            "Sum(BacklogSemDuplicacao.recorrencia)": 2,
        },
        # subtotal do Power BI: sem OS valida e recorrencia agregada
        {"Sum(BacklogSemDuplicacao.recorrencia)": 509},
        # cidade fora do escopo Cabonnet React
        {
            "BacklogSemDuplicacao.cidade": "TUPA",
            "Sum(BacklogSemDuplicacao.numos)": 9123458,
            "Sum(BacklogSemDuplicacao.recorrencia)": 1,
        },
    ]

    normalized = normalize_bi_rows(rows)

    assert [row["numos"] for row in normalized] == ["9123456", "9123457"]
    assert normalized[0]["recorrencia"] == 0
    assert normalized[0]["is_revisita"] is False
    assert normalized[1]["recorrencia"] == 2
    assert normalized[1]["is_revisita"] is True
    assert normalized[1]["revisita_manut"] == 1
