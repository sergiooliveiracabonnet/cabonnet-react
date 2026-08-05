"""Regras determinísticas para relacionar revisitas oficiais à OS anterior.

Este módulo não tenta descobrir a causa da revisita. Ele cria o vínculo
auditável que permitirá agregar ocorrências, materiais e demais evidências.
"""

from __future__ import annotations

import datetime as dt
import unicodedata
from collections import defaultdict
from typing import Any


def _text(value: Any) -> str:
    return str(value or "").strip()


def _key_text(value: Any) -> str:
    normalized = unicodedata.normalize("NFKD", _text(value))
    return normalized.encode("ascii", "ignore").decode().upper()


def _date(row: dict[str, Any]) -> dt.datetime | None:
    value = row.get("dataexecucao") or row.get("dataexecutada") or row.get("databaixasistema")
    if not isinstance(value, str):
        return None
    for pattern in ("%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M", "%d/%m/%Y"):
        try:
            return dt.datetime.strptime(value, pattern)
        except ValueError:
            continue
    return None


def _recurrence(row: dict[str, Any]) -> int:
    try:
        return max(0, int(row.get("recorrencia") or 0))
    except (TypeError, ValueError):
        return 0


def _group_key(row: dict[str, Any]) -> tuple[str, str, str] | None:
    city = _key_text(row.get("nomedacidade"))
    contract = _key_text(row.get("codigocontrato"))
    customer = _key_text(row.get("codigocliente"))
    if not city:
        return None
    if contract:
        return (city, "contract", contract)
    if customer:
        return (city, "customer", customer)
    return None


def _same_team(origin: dict[str, Any], revisit: dict[str, Any]) -> bool | None:
    left = _key_text(origin.get("equipeexecutou") or origin.get("nomedaequipe"))
    right = _key_text(revisit.get("equipeexecutou") or revisit.get("nomedaequipe"))
    return left == right if left and right else None


def build_revisit_journeys(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Retorna um registro auditável para cada linha com ``recorrencia > 0``.

    O pareamento usa a visita imediatamente anterior dentro da mesma cidade e
    contrato. Código do cliente só é usado quando o contrato está ausente nas
    duas linhas. Nome do cliente nunca é chave de correlação.
    """
    grouped: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
    revisits: list[dict[str, Any]] = []

    for row in rows:
        key = _group_key(row)
        if key and _date(row):
            grouped[key].append(row)
        if _recurrence(row) > 0:
            revisits.append(row)

    # Chaveado pela identidade da linha, não pelo numos: a mesma OS pode aparecer
    # duplicada entre contratos/cidades e uma chave textual faria a segunda
    # ocorrência sobrescrever o vínculo da primeira.
    previous_by_row: dict[int, tuple[dict[str, Any], str] | None] = {}
    for key, group in grouped.items():
        ordered = sorted(group, key=lambda item: (_date(item), _text(item.get("numos"))))
        for index, row in enumerate(ordered):
            previous_by_row[id(row)] = (ordered[index - 1], key[1]) if index else None

    result: list[dict[str, Any]] = []
    for revisit in sorted(revisits, key=lambda item: (_date(item) or dt.datetime.max, _text(item.get("numos")))):
        revisit_os = _text(revisit.get("numos"))
        linked = previous_by_row.get(id(revisit))
        origin, basis = linked if linked else (None, None)
        origin_date = _date(origin) if origin else None
        revisit_date = _date(revisit)

        confidence = "unlinked"
        if origin:
            sequence_matches = _recurrence(origin) == _recurrence(revisit) - 1
            if basis == "contract" and sequence_matches:
                confidence = "high"
            elif basis == "customer" and sequence_matches:
                confidence = "medium"
            else:
                confidence = "low"

        result.append({
            "origin_os": _text(origin.get("numos")) if origin else None,
            "revisit_os": revisit_os,
            "recurrence": _recurrence(revisit),
            "link_basis": basis,
            "link_confidence": confidence,
            "days_between": (revisit_date.date() - origin_date.date()).days
            if origin_date and revisit_date else None,
            "same_team": _same_team(origin, revisit) if origin else None,
            "origin": origin,
            "revisit": revisit,
        })

    return result


# Janela da regra de negócio: instalação que gera chamado técnico em até N dias.
# Mesmo prazo do SQL original (grafana.py, "revisita_inst").
_INSTALL_REVISIT_WINDOW_DAYS = 30


def _is_installation(row: dict[str, Any] | None) -> bool:
    """"ASSISTENCIA - PRIMEIRA CONEXAO 30 D" é o retorno pós-instalação, não a
    instalação — casar "PRIMEIRA CONEXAO" solto marcava essas como origem."""
    if not row:
        return False
    service = _key_text(row.get("servico"))
    if "ASSISTENCIA" in service:
        return False
    return "INSTALAC" in _key_text(row.get("tiposervico")) or "PRIMEIRA CONEXAO" in service


def _technical_type(row: dict[str, Any] | None) -> str:
    if not row:
        return "servico"
    if _is_installation(row):
        return "instalacao"
    service_type = _key_text(row.get("tiposervico"))
    service = _key_text(row.get("servico"))
    if "MANUTENC" in service_type or "ASSISTENCIA" in service or " VT " in f" {service} ":
        return "manutencao"
    return "servico"


def _installations_by_group(rows: list[dict[str, Any]]) -> dict[tuple[str, str, str], list[dict[str, Any]]]:
    grouped: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        key = _group_key(row)
        if key and _date(row) and _is_installation(row):
            grouped[key].append(row)
    for group in grouped.values():
        group.sort(key=lambda item: _date(item))
    return grouped


def _installation_before(
    revisit: dict[str, Any],
    installations: dict[tuple[str, str, str], list[dict[str, Any]]],
    window_days: int,
) -> dict[str, Any] | None:
    """A instalação não precisa ser a visita imediatamente anterior: entre ela e
    o retorno quase sempre entram upgrade, transferência ou troca. Exigir
    adjacência zerava a categoria."""
    key = _group_key(revisit)
    revisit_date = _date(revisit)
    if not key or not revisit_date:
        return None
    found = None
    for candidate in installations.get(key, []):
        candidate_date = _date(candidate)
        if candidate_date is None or candidate_date >= revisit_date:
            break
        if (revisit_date.date() - candidate_date.date()).days <= window_days:
            found = candidate
    return found


_TYPE_FLAG = {
    "instalacao": "revisita_inst",
    "manutencao": "revisita_manut",
    "servico": "revisita_serv",
}


def annotate_revisit_types(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Refina a classificação do retorno usando o serviço que o originou.

    Só reescreve as flags quando a jornada linka com uma origem. Sem origem —
    revisita no começo da janela buscada, ou linha sem data de execução
    parseável — mantém o que a fonte já trouxe: zerar aqui fazia a revisita
    sumir das três abas em vez de apenas ficar sem refinamento.
    """
    copies = [dict(row) for row in rows]
    installations = _installations_by_group(copies)
    zeradas = {"revisita_inst": 0, "revisita_manut": 0, "revisita_serv": 0}

    for journey in build_revisit_journeys(copies):
        # `revisit` é a própria linha de `copies`; usar a referência evita que
        # numos duplicado mande a flag para a linha errada.
        revisit = journey.get("revisit")
        if not isinstance(revisit, dict):
            continue

        # A janela manda na categoria de instalação: instalação mais velha que
        # ela não faz do retorno uma revisita de instalação, mesmo sendo a
        # origem imediata.
        if _installation_before(revisit, installations, _INSTALL_REVISIT_WINDOW_DAYS):
            revisit.update(zeradas)
            revisit["revisita_inst"] = 1
            continue

        origin = journey.get("origin")
        if not origin or _is_installation(origin):
            continue
        revisit.update(zeradas)
        revisit[_TYPE_FLAG[_technical_type(origin)]] = 1
    return copies
