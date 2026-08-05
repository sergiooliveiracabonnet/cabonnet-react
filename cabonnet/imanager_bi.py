# -*- coding: utf-8 -*-
"""Cliente do BI Técnico oficial (iManager relatório 21 / Power BI).

A integração replica a consulta do visual ``Dados Analisar Painel``. O campo
``recorrencia`` pertence ao modelo oficial; não é recalculado neste projeto.
"""

from __future__ import annotations

import base64
import copy
import datetime as dt
import json
import math
import re
import threading
import time
import uuid
from typing import Any

import requests

from cabonnet.config import IMANAGER_CONFIG


IMANAGER_API_URL = "https://imanagergerencialcentralapi.cabonnet.com.br"
BI_REPORT_LINK_ID = 21
BI_PAGE_NAME = "Dados Analisar Painel"
BI_ENTITY = "BacklogSemDuplicacao"
MAX_POWERBI_ROWS = 30_000
_SOURCE_CACHE_TTL = 5 * 60
_source_cache: dict[str, Any] = {"rows": None, "ts": 0.0}
_source_cache_lock = threading.Lock()

_VALID_CITIES = {
    "SAO JOSE DOS CAMPOS": "São José dos Campos",
    "CACAPAVA": "Caçapava",
    "TAUBATE": "Taubaté",
    "TREMEMBE": "Tremembé",
    "PINDAMONHANGABA": "Pindamonhangaba",
}

_FIELD_MAP = {
    "empresa": "empresa",
    "cidade": "nomedacidade",
    "codigocliente": "codigocliente",
    "nomecliente": "nomecliente",
    "contrato": "codigocontrato",
    "equipevenda": "equipevenda",
    "vendedor": "vendedor",
    "datainstalacao": "datainstalacao",
    "datavenda": "datavenda",
    "endereco": "endereco",
    "numero": "numero",
    "bairro": "bairro",
    "cep": "cep",
    "datacadastro": "datacadastro",
    "data_atendimento": "dataatendimento",
    "dataagendamento": "dataagendamento",
    "periodo": "periodo",
    "dataexecucao": "dataexecucao",
    "DiferençaDias": "dias_instalacao_ate_os",
    "nomeservico": "servico",
    "nometiposervico": "tiposervico",
    "equipeagendada": "nomedaequipe",
    "equipe": "equipeexecutou",
    "data_encaminhou": "dataencaminhou",
    "usuario_encaminhou": "usuarioencaminhou",
    "grupo_usuario_encaminhou": "grupousuarioencaminhou",
    "recorrencia": "recorrencia",
    "tipopessoa": "tipopessoa",
    "tempo_maior_24_horas": "tempo_maior_24h",
    "tempo_maior_4_horas": "tempo_maior_4h",
    "tempo_maior_3_horas": "tempo_maior_3h",
    "numos": "numos",
    "nomeexecutante": "executante",
    "tiposituacao": "descsituacao",
    "motivo_sem_execucao": "motivocancelamento",
    "motivo_reagendamento": "motivoreagendamento",
    "atendimento": "atendimento",
    "execucao": "execucao",
    "data_envio_mobile": "dataenviomobile",
    "data_executada": "dataexecutada",
    "data_baixa_sistema": "databaixasistema",
    "tempo_decorrido": "tempodecorrido",
    "atendimento_ate_enviomobile": "atendimento_ate_enviomobile",
    "atendimento_ate_executada": "atendimento_ate_execucao",
    "baixa_ate_executada": "baixa_ate_execucao",
    "node": "node",
    "usuario_abriu": "usuarioabriu",
    "usuario_baixou": "usuariobaixou",
    "telefone": "telefone",
    "observacao": "observacao",
}

_DATE_FIELDS = {
    "datainstalacao", "datavenda", "datacadastro", "dataatendimento",
    "dataagendamento", "dataexecucao", "dataencaminhou", "atendimento",
    "execucao", "dataenviomobile", "dataexecutada", "databaixasistema",
}


class IManagerBIError(RuntimeError):
    pass


def _json_response(response: requests.Response) -> dict[str, Any]:
    response.raise_for_status()
    return json.loads(response.content.decode("utf-8-sig"))


def _powerbi_headers(embed_token: str) -> dict[str, str]:
    return {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": f"EmbedToken {embed_token}",
        "ActivityId": str(uuid.uuid4()),
        "RequestId": str(uuid.uuid4()),
        "X-PowerBI-HostEnv": "Embed for Customers",
        "Origin": "https://app.powerbi.com",
    }


def _cluster_from_embed_token(embed_token: str) -> str:
    try:
        encoded = embed_token.split(".", 1)[1]
        encoded += "=" * (-len(encoded) % 4)
        metadata = json.loads(base64.urlsafe_b64decode(encoded))
        return str(metadata["clusterUrl"]).rstrip("/")
    except (IndexError, KeyError, ValueError, TypeError, json.JSONDecodeError) as exc:
        raise IManagerBIError("Token do Power BI não contém o cluster do relatório") from exc


def decode_dsr_rows(data: dict[str, Any]) -> list[dict[str, Any]]:
    """Expande a codificação compacta DSR retornada por ``querydata``."""
    descriptors = {
        item.get("Value"): item.get("Name")
        for item in data.get("descriptor", {}).get("Select", [])
        if item.get("Value") and item.get("Name")
    }
    decoded: list[dict[str, Any]] = []

    for dataset in data.get("dsr", {}).get("DS", []):
        dictionaries = dataset.get("ValueDicts", {})
        for phase in dataset.get("PH", []):
            for key, encoded_rows in phase.items():
                if not key.startswith("DM") or not encoded_rows:
                    continue
                schema = encoded_rows[0].get("S")
                if not schema or not any(col.get("N", "").startswith("G") for col in schema):
                    continue  # subtotal/medidas agregadas (DM0)
                previous = [None] * len(schema)
                for encoded_row in encoded_rows:
                    if encoded_row.get("S"):
                        schema = encoded_row["S"]
                        previous = [None] * len(schema)
                    values = iter(encoded_row.get("C", []))
                    repeat_mask = int(encoded_row.get("R", 0) or 0)
                    null_mask = int(encoded_row.get("Ø", 0) or 0)
                    current: list[Any] = []
                    for index, column in enumerate(schema):
                        if repeat_mask & (1 << index):
                            value = previous[index]
                        elif null_mask & (1 << index):
                            value = None
                        else:
                            value = next(values, None)
                            dictionary_name = column.get("DN")
                            if dictionary_name and isinstance(value, (int, float)):
                                dictionary = dictionaries.get(dictionary_name, [])
                                value = dictionary[int(value)] if int(value) < len(dictionary) else None
                        current.append(value)
                    previous = current
                    decoded.append({
                        descriptors[column.get("N")]: current[index]
                        for index, column in enumerate(schema)
                        if descriptors.get(column.get("N"))
                    })
    return decoded


def _source_property(name: str) -> str:
    match = re.search(r"BacklogSemDuplicacao\.([^)]*)", name)
    return match.group(1) if match else name


def _city_key(value: Any) -> str:
    import unicodedata

    text = unicodedata.normalize("NFKD", str(value or ""))
    return text.encode("ascii", "ignore").decode().strip().upper()


def _format_value(field: str, value: Any) -> Any:
    if field not in _DATE_FIELDS or value in (None, ""):
        return value
    if isinstance(value, (int, float)) and math.isfinite(value):
        moment = dt.datetime.fromtimestamp(value / 1000, tz=dt.timezone.utc)
        if moment.time() == dt.time():
            return moment.strftime("%d/%m/%Y")
        return moment.strftime("%d/%m/%Y %H:%M:%S")
    return value


def normalize_bi_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for raw in rows:
        values: dict[str, Any] = {}
        for source_name, value in raw.items():
            source_property = _source_property(source_name)
            target = _FIELD_MAP.get(source_property)
            if target:
                values[target] = _format_value(target, value)

        numos_raw = values.get("numos")
        try:
            numos = str(int(float(numos_raw)))
        except (TypeError, ValueError, OverflowError):
            continue
        if not re.fullmatch(r"\d{7}", numos):
            continue  # inclui a linha de totalização exportada pelo Power BI

        city = _VALID_CITIES.get(_city_key(values.get("nomedacidade")))
        if not city:
            continue

        recurrence = int(values.get("recorrencia") or 0)
        values.update({
            "numos": numos,
            "nomedacidade": city,
            "recorrencia": recurrence,
            "is_revisita": recurrence > 0,
            # Compatibilidade temporária com os builders existentes.
            "revisita_inst": 0,
            "revisita_manut": 0,
            "revisita_serv": 0,
        })
        if recurrence > 0:
            service_type = str(values.get("tiposervico") or "").upper()
            if "INSTALAC" in service_type:
                values["revisita_inst"] = 1
            elif "MANUTENC" in service_type:
                values["revisita_manut"] = 1
            elif "REDE" not in service_type:
                values["revisita_serv"] = 1

        start = values.get("dataatendimento") or values.get("datacadastro")
        end = values.get("dataexecucao")
        values["horas_resolucao"] = _elapsed_hours(start, end)
        normalized.append(values)
    return normalized


def _elapsed_hours(start: Any, end: Any) -> float:
    def parse(value: Any) -> dt.datetime | None:
        if not isinstance(value, str):
            return None
        for pattern in ("%d/%m/%Y %H:%M:%S", "%d/%m/%Y"):
            try:
                return dt.datetime.strptime(value, pattern)
            except ValueError:
                pass
        return None

    start_dt, end_dt = parse(start), parse(end)
    if not start_dt or not end_dt:
        return 0
    return round(max(0, (end_dt - start_dt).total_seconds() / 3600), 1)


def _find_official_visual(exploration: dict[str, Any]) -> dict[str, Any]:
    section = next(
        (item for item in exploration.get("sections", []) if item.get("displayName") == BI_PAGE_NAME),
        None,
    )
    if not section:
        raise IManagerBIError(f"Página Power BI não encontrada: {BI_PAGE_NAME}")
    for container in section.get("visualContainers", []):
        config = json.loads(container.get("config") or "{}")
        visual = config.get("singleVisual", {})
        query = visual.get("prototypeQuery", {})
        properties = {
            _source_property(item.get("Name", "")) for item in query.get("Select", [])
        }
        if visual.get("visualType") == "tableEx" and {"numos", "recorrencia"} <= properties:
            return config
    raise IManagerBIError("Tabela oficial de recorrência não encontrada no relatório")


def _query_payload(report_id: str, model: dict[str, Any], visual: dict[str, Any]) -> dict[str, Any]:
    query = copy.deepcopy(visual["singleVisual"]["prototypeQuery"])
    source = query["From"][0]["Name"]
    # O modelo reúne várias operações/empresas. Filtrar no Power BI evita que
    # o limite de linhas seja consumido por cidades fora do escopo antes do
    # filtro defensivo aplicado novamente em ``normalize_bi_rows``.
    query["Where"] = [{
        "Condition": {
            "In": {
                "Expressions": [{
                    "Column": {
                        "Expression": {"SourceRef": {"Source": source}},
                        "Property": "cidade",
                    }
                }],
                "Values": [
                    [{"Literal": {"Value": f"'{city}'"}}]
                    for city in _VALID_CITIES
                ],
            }
        }
    }]
    projections = list(range(len(query.get("Select", []))))
    command = {
        "Version": 1,
        "Query": query,
        "Binding": {
            "DataReduction": {"DataVolume": 6, "Primary": {"Window": {"Count": MAX_POWERBI_ROWS}}},
            "Primary": {"Groupings": [{"Projections": projections, "Subtotal": 1}]},
        },
        "ExecutionMetricsKind": 1,
    }
    return {
        "version": "1.0.0",
        "queries": [{
            "Query": {"Commands": [{"SemanticQueryDataShapeCommand": command}]},
            "ApplicationContext": {
                "DatasetId": model["dbName"],
                "Sources": [{"ReportId": report_id, "VisualId": visual["name"]}],
            },
        }],
        "cancelQueries": [],
        "modelId": model["id"],
    }


def fetch_bi_rows(session: requests.Session | None = None) -> list[dict[str, Any]]:
    now = time.monotonic()
    with _source_cache_lock:
        cached = _source_cache["rows"]
        if cached is not None and now - _source_cache["ts"] < _SOURCE_CACHE_TTL:
            return list(cached)

        rows = _fetch_bi_rows(session)
        _source_cache["rows"] = rows
        _source_cache["ts"] = time.monotonic()
        return list(rows)


def _fetch_bi_rows(session: requests.Session | None = None) -> list[dict[str, Any]]:
    username = IMANAGER_CONFIG.get("username")
    password = IMANAGER_CONFIG.get("password")
    if not username or not password:
        raise IManagerBIError("IMANAGER_USER/IMANAGER_PASS não configurados")

    client = session or requests.Session()
    timeout = 60
    auth = _json_response(client.post(
        f"{IMANAGER_API_URL}/api/token/login",
        json={"login": username, "senha": password}, timeout=timeout,
    ))
    contracts = auth.get("contratos") or []
    if not contracts:
        raise IManagerBIError("Login do iManager não retornou contrato")
    token = auth.get("token") or auth.get("access_token")
    embed = _json_response(client.post(
        f"{IMANAGER_API_URL}/api/Link/GetEmbedConfig",
        json={"linkId": BI_REPORT_LINK_ID},
        headers={"Token": token, "ContratoId": str(contracts[0]["id"])},
        timeout=timeout,
    ))

    report_id = embed["id"]
    embed_token = embed["embedToken"]["token"]
    cluster = _cluster_from_embed_token(embed_token)
    headers = _powerbi_headers(embed_token)
    metadata = _json_response(client.get(
        f"{cluster}/explore/reports/{report_id}/modelsAndExploration",
        params={"preferReadOnlySession": "true", "skipQueryData": "true"},
        headers=headers, timeout=timeout,
    ))
    model = metadata["models"][0]
    visual = _find_official_visual(metadata["exploration"])
    query_result = _json_response(client.post(
        f"{cluster}/explore/querydata?synchronous=true",
        json=_query_payload(report_id, model, visual), headers=headers, timeout=120,
    ))
    data = query_result["results"][0]["result"]["data"]
    return normalize_bi_rows(decode_dsr_rows(data))


_REDE_EQUIPE_RE = re.compile(r"\bREDE\b")


def is_rede_row(row: dict[str, Any]) -> bool:
    """Mesma regra do getEquipeTipo (src/lib/transform.ts): REDE vem do nome da
    equipe, não do serviço. As duas telas precisam esconder o mesmo conjunto."""
    return bool(_REDE_EQUIPE_RE.search(str(row.get("nomedaequipe") or "").upper()))


def drop_rede(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [row for row in rows if not is_rede_row(row)]


def filter_bi_period(rows: list[dict[str, Any]], inicio: str, fim: str) -> list[dict[str, Any]]:
    start = dt.datetime.strptime(inicio, "%Y-%m-%d").date()
    end = dt.datetime.strptime(fim, "%Y-%m-%d").date()
    result = []
    for row in rows:
        value = row.get("datacadastro")
        if not isinstance(value, str):
            continue
        try:
            day = dt.datetime.strptime(value[:10], "%d/%m/%Y").date()
        except ValueError:
            continue
        if start <= day < end:
            result.append(row)
    return result
