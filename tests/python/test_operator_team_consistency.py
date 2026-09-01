from cabonnet import ai, config, stats


EXPECTED_GROUPS = {
    "INSTACABLE": ["F01", "F04", "F05", "F07", "F20", "F45", "F46", "F47", "F48", "F49", "F50"],
    "WES": ["F08", "F11", "F23", "F36", "F44"],
    "THM": ["F12", "F13", "F14"],
}


def test_operator_team_sources_match_confirmed_mapping():
    assert config._OPERADORA_GRUPOS == EXPECTED_GROUPS
    assert stats._INST_CODES == set(EXPECTED_GROUPS["INSTACABLE"])
    assert stats._WES_CODES == set(EXPECTED_GROUPS["WES"])
    assert stats._THM_CODES == set(EXPECTED_GROUPS["THM"])


def test_ai_context_uses_confirmed_operator_mapping():
    prompt = ai._CHAT_SYSTEM.format(today="26/07/2026")

    for operator, teams in EXPECTED_GROUPS.items():
        assert f"- {operator}: frentes {', '.join(teams)}" in prompt
    assert "F27" not in prompt
    assert "F39" not in prompt
    assert "F12 a F19" not in prompt

