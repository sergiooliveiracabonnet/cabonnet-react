# -*- coding: utf-8 -*-
"""
cabonnet/zabbix.py — Chamadas ao Zabbix via proxy Grafana.
"""

import logging
from datetime import datetime, timedelta

import requests

from cabonnet.config import (
    MONITOR_URL, MONITOR_USER, MONITOR_PASS, ZABBIX_DS_UID,
    _SEV_LABELS,
)
from cabonnet.grafana import grafana_post, frames_to_dict_list

log = logging.getLogger("CaboNetServer")


def zabbix_call(method, params, timeout=20):
    """Genérico JSON-RPC Zabbix via proxy Grafana (tenta resources 10+ e fallback proxy)."""
    if not MONITOR_URL or not ZABBIX_DS_UID:
        raise RuntimeError("MONITOR_URL / ZABBIX_DS_UID não configurados no .env")
    body = {"jsonrpc": "2.0", "id": 1, "auth": None, "method": method, "params": params}
    base = MONITOR_URL.rstrip("/")
    candidates = [
        "{}/api/datasources/uid/{}/resources/zabbix-api".format(base, ZABBIX_DS_UID),
        "{}/api/datasources/proxy/uid/{}/".format(base, ZABBIX_DS_UID),
    ]
    last_err = None
    for url in candidates:
        try:
            log.info("[Zabbix] %s → %s", method, url)
            resp = requests.post(url, json=body, auth=(MONITOR_USER, MONITOR_PASS),
                                 verify=False, timeout=timeout)
            if resp.status_code == 400:
                log.warning("[Zabbix] 400 em %s: %s", url, resp.text[:400])
                last_err = RuntimeError("400 Bad Request — {}".format(resp.text[:200]))
                continue
            resp.raise_for_status()
            payload = resp.json()
            result  = payload.get("result", payload if isinstance(payload, list) else [])
            log.info("[Zabbix] %s OK — %s itens", method, len(result) if isinstance(result, list) else "?")
            return result
        except RuntimeError:
            raise
        except Exception as exc:
            log.warning("[Zabbix] Falha em %s: %s", url, exc)
            last_err = exc
    raise last_err or RuntimeError("Nenhum endpoint Zabbix disponível")


def zabbix_get_problems():
    """Problemas ativos no Zabbix."""
    return zabbix_call("problem.get", {
        "output":      ["eventid","objectid","clock","name","severity","acknowledged"],
        "selectHosts": ["hostid","host","name"],
        "suppressed":  False,
        "recent":      True,
        "sortfield":   ["severity","clock"],
        "sortorder":   ["DESC","DESC"],
        "limit":       200,
    })


def zabbix_discover():
    """Retorna grupos de hosts, lista de hosts e prefixos únicos de itens monitorados."""
    groups = zabbix_call("hostgroup.get", {
        "output":          ["groupid", "name"],
        "monitored_hosts": True,
        "sortfield":       "name",
    })
    hosts = zabbix_call("host.get", {
        "output":          ["hostid", "host", "name", "status"],
        "selectGroups":    ["name"],
        "monitored_hosts": True,
        "sortfield":       "name",
    })
    items = zabbix_call("item.get", {
        "output":    ["name"],
        "monitored": True,
        "limit":     2000,
    })

    import re as _re
    prefixes: dict = {}
    for it in items:
        raw = it.get("name", "")
        prefix = _re.split(r"[:\d]", raw)[0].strip().rstrip(" -_")
        if len(prefix) > 3:
            prefixes[prefix] = prefixes.get(prefix, 0) + 1

    top_prefixes = sorted(prefixes.items(), key=lambda x: -x[1])[:60]

    return {
        "grupos": [g["name"] for g in groups],
        "hosts":  [
            {
                "host":   h.get("host"),
                "name":   h.get("name"),
                "grupos": [g["name"] for g in h.get("groups", [])],
            }
            for h in hosts
        ],
        "item_prefixes": [{"prefix": p, "count": c} for p, c in top_prefixes],
        "total_items":   len(items),
        "total_hosts":   len(hosts),
        "total_grupos":  len(groups),
    }


def zabbix_get_pppoe_vlans():
    """Conexões PPPoE ativas por VLAN, agrupadas por host Juniper."""
    import re as _re
    vale_hosts = zabbix_call("host.get", {
        "output":       ["hostid", "host", "name"],
        "search":       {"host": "VAL_"},
        "searchByAny":  False,
    })
    if not vale_hosts:
        return {"grand_total": 0, "hosts": [], "timestamp": datetime.now().isoformat()}

    vale_hostids = [h["hostid"] for h in vale_hosts]

    items = zabbix_call("item.get", {
        "output":      ["itemid", "name", "lastvalue", "lastclock"],
        "selectHosts": ["hostid", "host", "name"],
        "hostids":     vale_hostids,
        "search":      {"name": "Total Conexões PPPoE por VLAN"},
        "sortfield":   "name",
        "limit":       500,
    })

    hosts_data: dict = {}
    grand_total = 0

    for item in items:
        host_info = (item.get("hosts") or [{}])[0]
        host      = host_info.get("name") or host_info.get("host", "—")
        hostid    = host_info.get("hostid", "")
        name      = item.get("name", "")
        m         = _re.match(r"VLAN\s+(\d+)", name)
        if not m:
            continue
        vlan_num = int(m.group(1))
        val      = int(float(item.get("lastvalue") or 0))
        ts       = int(item.get("lastclock") or 0)

        if hostid not in hosts_data:
            hosts_data[hostid] = {"host": host, "total": 0, "vlans": []}
        hosts_data[hostid]["vlans"].append({
            "vlan":     vlan_num,
            "conexoes": val,
            "ts":       datetime.fromtimestamp(ts).isoformat() if ts else None,
        })
        hosts_data[hostid]["total"] += val
        grand_total += val

    hosts_list = []
    for hdata in hosts_data.values():
        hdata["vlans"].sort(key=lambda x: -x["conexoes"])
        hosts_list.append(hdata)
    hosts_list.sort(key=lambda x: -x["total"])

    return {
        "grand_total": grand_total,
        "hosts":       hosts_list,
        "timestamp":   datetime.now().isoformat(),
    }


def zabbix_get_mttr():
    """MTTR real por severidade — eventos resolvidos nos últimos 30 dias."""
    from_ts    = int((datetime.now() - timedelta(days=30)).timestamp())
    sev_labels = ["", "INFORMACAO", "AVISO", "MEDIO", "ALTO", "CRITICO", "DESASTRE"]
    events = zabbix_call("event.get", {
        "output":      ["eventid","clock","r_clock","name","severity","acknowledged"],
        "selectHosts": ["hostid","host","name"],
        "source":      0,
        "object":      0,
        "value":       1,
        "time_from":   from_ts,
        "sortfield":   ["clock"],
        "sortorder":   "DESC",
        "limit":       2000,
    }, timeout=30)

    resolved = [e for e in events if int(e.get("r_clock", 0)) > 0]

    by_sev: dict = {}
    for e in resolved:
        sev = int(e.get("severity", 0))
        dur = int(e["r_clock"]) - int(e["clock"])
        if sev not in by_sev:
            by_sev[sev] = {"count": 0, "total_s": 0}
        by_sev[sev]["count"]   += 1
        by_sev[sev]["total_s"] += dur

    total_s     = sum(int(e["r_clock"]) - int(e["clock"]) for e in resolved)
    mttr_global = round(total_s / len(resolved) / 60, 1) if resolved else 0

    por_severidade = sorted([
        {
            "sev":      sev_labels[sev] if sev < len(sev_labels) else str(sev),
            "sevNum":   sev,
            "count":    d["count"],
            "mttr_min": round(d["total_s"] / d["count"] / 60, 1),
        }
        for sev, d in by_sev.items()
    ], key=lambda x: -x["sevNum"])

    return {
        "total_eventos":  len(events),
        "resolvidos":     len(resolved),
        "em_aberto":      len(events) - len(resolved),
        "mttr_min":       mttr_global,
        "por_severidade": por_severidade,
    }


def zabbix_get_cidades():
    """Incidentes ativos agrupados por grupo de hosts Zabbix."""
    problems  = zabbix_call("problem.get", {
        "output":      ["eventid","objectid","clock","name","severity","acknowledged"],
        "selectHosts": ["hostid","host","name"],
        "suppressed":  False,
        "recent":      True,
        "limit":       500,
    })
    hosts_raw = zabbix_call("host.get", {
        "output":          ["hostid","host","name","status"],
        "selectGroups":    ["groupid","name"],
        "monitored_hosts": True,
    }, timeout=30)

    host_groups = {h["hostid"]: [g["name"] for g in h.get("groups", [])] for h in hosts_raw}

    group_data: dict = {}
    for p in problems:
        sev = int(p.get("severity", 0))
        ack = p.get("acknowledged") == "1"
        for host in p.get("hosts", []):
            for grp in host_groups.get(host.get("hostid", ""), ["Sem Grupo"]):
                if grp not in group_data:
                    group_data[grp] = {"total": 0, "critico": 0, "alto": 0, "medio": 0, "sem_ack": 0}
                g = group_data[grp]
                g["total"] += 1
                if sev >= 5:   g["critico"] += 1
                elif sev == 4: g["alto"]    += 1
                elif sev == 3: g["medio"]   += 1
                if not ack:    g["sem_ack"] += 1

    grupos = sorted(
        [{"grupo": grp, **counts} for grp, counts in group_data.items()],
        key=lambda x: (-x["critico"], -x["alto"], -x["total"]),
    )
    return {
        "grupos":          grupos,
        "total_hosts":     len(hosts_raw),
        "total_problemas": len(problems),
    }


def zabbix_get_top_equipamentos():
    """Top 20 equipamentos com mais ocorrências nos últimos 30 dias."""
    from_ts = int((datetime.now() - timedelta(days=30)).timestamp())
    events  = zabbix_call("event.get", {
        "output":      ["eventid","clock","r_clock","name","severity"],
        "selectHosts": ["hostid","host","name"],
        "source":      0,
        "object":      0,
        "value":       1,
        "time_from":   from_ts,
        "limit":       2000,
    }, timeout=30)

    host_stats: dict = {}
    for e in events:
        sev      = int(e.get("severity", 0))
        r_clock  = int(e.get("r_clock", 0))
        resolved = r_clock > 0
        dur      = (r_clock - int(e["clock"])) if resolved else 0
        for host in e.get("hosts", []):
            hid   = host.get("hostid", "")
            hname = host.get("name") or host.get("host", "—")
            if hid not in host_stats:
                host_stats[hid] = {"host": hname, "ocorrencias": 0,
                                   "criticos": 0, "resolvidos": 0, "mttr_s": 0}
            s = host_stats[hid]
            s["ocorrencias"] += 1
            if sev >= 5: s["criticos"] += 1
            if resolved:
                s["resolvidos"] += 1
                s["mttr_s"]     += dur

    result = []
    for hid, s in host_stats.items():
        mttr = round(s["mttr_s"] / s["resolvidos"] / 60, 1) if s["resolvidos"] else None
        result.append({
            "hostid":          hid,
            "host":            s["host"],
            "ocorrencias_30d": s["ocorrencias"],
            "criticos_30d":    s["criticos"],
            "mttr_min":        mttr,
        })

    result.sort(key=lambda x: -x["ocorrencias_30d"])
    return result[:20]


def zabbix_get_olt():
    """Status de ONUs por OLT do Vale (VAL_OLT_*)."""
    olt_hosts = zabbix_call("host.get", {
        "output": ["hostid", "host", "name"],
        "search": {"host": "VAL_OLT_"},
    })
    if not olt_hosts:
        return {"olts": [], "totais": {}, "timestamp": datetime.now().isoformat()}

    hostids  = [h["hostid"] for h in olt_hosts]
    host_map = {h["hostid"]: h.get("name") or h.get("host") for h in olt_hosts}

    items = zabbix_call("item.get", {
        "output":      ["itemid", "name", "lastvalue"],
        "selectHosts": ["hostid"],
        "hostids":     hostids,
        "search":      {"name": "ONU"},
        "limit":       2000,
    })

    olt_data = {}
    for item in items:
        hostid = (item.get("hosts") or [{}])[0].get("hostid", "")
        if hostid not in host_map:
            continue
        if hostid not in olt_data:
            olt_data[hostid] = {
                "host": host_map[hostid],
                "conectadas": 0, "offline": 0, "sem_energia": 0, "fibra_rompida": 0,
            }
        name = item.get("name", "").upper()
        val  = int(float(item.get("lastvalue") or 0))
        d = olt_data[hostid]
        if any(k in name for k in ("CONECTADA", "ON-LINE", "ONLINE", "CONNECTED")):
            d["conectadas"] += val
        elif any(k in name for k in ("SEM ENERGIA", "WITHOUT POWER", "POWER FAILURE")):
            d["sem_energia"] += val
        elif any(k in name for k in ("FIBRA ROMPIDA", "FIBER BROKEN", "LOS ")):
            d["fibra_rompida"] += val
        elif any(k in name for k in ("OFF-LINE", "OFFLINE", "DESCONECTADA")):
            d["offline"] += val

    olts = sorted(olt_data.values(), key=lambda x: -x["conectadas"])
    totais = {
        "conectadas":    sum(o["conectadas"]    for o in olts),
        "offline":       sum(o["offline"]       for o in olts),
        "sem_energia":   sum(o["sem_energia"]   for o in olts),
        "fibra_rompida": sum(o["fibra_rompida"] for o in olts),
    }
    return {"olts": olts, "totais": totais, "timestamp": datetime.now().isoformat()}


def zabbix_get_infra():
    """Status de switches core e roteadores BGP do Vale."""
    all_hosts = zabbix_call("host.get", {
        "output":          ["hostid", "host", "name", "available", "snmp_available"],
        "search":          {"host": "VAL_"},
        "monitored_hosts": True,
    })
    infra = [h for h in all_hosts if any(
        t in h.get("host", "").upper() for t in ("_SWT_", "_BGP_", "_RTR_")
    )]
    if not infra:
        return {"hosts": [], "timestamp": datetime.now().isoformat()}

    hostids = [h["hostid"] for h in infra]

    problems = zabbix_call("problem.get", {
        "output":      ["eventid", "severity"],
        "selectHosts": ["hostid"],
        "hostids":     hostids,
        "suppressed":  False,
        "recent":      True,
    })

    host_data = {}
    for h in infra:
        hid      = h["hostid"]
        snmp_av  = int(h.get("snmp_available") or 0)
        agent_av = int(h.get("available") or 0)
        avail    = snmp_av if snmp_av > 0 else agent_av
        host_data[hid] = {
            "host":       h.get("name") or h.get("host"),
            "disponivel": avail == 1,
            "avail_raw":  avail,
            "problemas":  0,
            "max_sev":    0,
        }

    for p in problems:
        for h in p.get("hosts", []):
            hid = h.get("hostid", "")
            if hid in host_data:
                host_data[hid]["problemas"] += 1
                sev = int(p.get("severity", 0))
                if sev > host_data[hid]["max_sev"]:
                    host_data[hid]["max_sev"] = sev

    return {
        "hosts":     sorted(host_data.values(), key=lambda x: x["host"]),
        "timestamp": datetime.now().isoformat(),
    }


def zabbix_get_assinantes():
    """Total de conexões PPPoE ativas (assinantes) no Vale."""
    vale_hosts = zabbix_call("host.get", {
        "output": ["hostid", "host", "name"],
        "search": {"host": "VAL_"},
    })
    if not vale_hosts:
        return {"total": 0, "pct": None, "timestamp": datetime.now().isoformat()}

    hostids = [h["hostid"] for h in vale_hosts]

    items = zabbix_call("item.get", {
        "output":  ["name", "lastvalue"],
        "hostids": hostids,
        "search":  {"name": "Total de Conexões PPPoE Ativas"},
        "limit":   100,
    })
    items_pct = zabbix_call("item.get", {
        "output":  ["name", "lastvalue"],
        "hostids": hostids,
        "search":  {"name": "% Total de Conexões PPPoE Ativas"},
        "limit":   50,
    })

    grand_total = sum(int(float(i.get("lastvalue") or 0)) for i in items)
    pcts = [float(i.get("lastvalue") or 0) for i in items_pct if i.get("lastvalue")]
    avg_pct = round(sum(pcts) / len(pcts), 1) if pcts else None

    return {
        "total":     grand_total,
        "pct":       avg_pct,
        "timestamp": datetime.now().isoformat(),
    }


def _map_problems(raw):
    out = []
    for p in raw:
        sev_num = int(p.get("severity", 0))
        out.append({
            "id":     p.get("eventid", ""),
            "host":   (p.get("hosts") or [{}])[0].get("name") or (p.get("hosts") or [{}])[0].get("host", "—"),
            "desc":   p.get("name", ""),
            "sev":    _SEV_LABELS[sev_num] if sev_num < len(_SEV_LABELS) else "DESCONHECIDO",
            "sevNum": sev_num,
            "ack":    p.get("acknowledged") == "1",
            "ts":     "{}".format(datetime.fromtimestamp(int(p.get("clock", 0))).isoformat()),
        })
    return out
