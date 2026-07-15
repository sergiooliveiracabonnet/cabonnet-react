# -*- coding: utf-8 -*-
"""
cabonnet/juniper.py — PPPoE/Juniper: polling e notificações.
"""

import logging
import threading
from datetime import datetime, date

import requests

from cabonnet.config import MONITOR_CONFIG, JUN_HIST_FILE, TELEGRAM_CHAT_ALERTAS
from cabonnet import state
from cabonnet.telegram import _telegram_enabled, _tg_esc, _telegram_send, _TG_DIV

log = logging.getLogger("CaboNetServer")


def _jun_circuit_label(circuit_id: str) -> str:
    """Replica a lógica JS de abreviação do circuit_id."""
    parts = [p for p in str(circuit_id or "").upper().split(";") if p]
    return parts[-1] if len(parts) > 1 else (str(circuit_id or "—").upper())


def _build_pppoe_resumo_diario() -> None:
    """Envia ao Telegram o resumo de clientes PPPoE conectados no dia."""
    hoje     = date.today()
    hoje_str = hoje.isoformat()
    hoje_fmt = hoje.strftime("%d/%m/%Y")
    cluster  = MONITOR_CONFIG["cluster_default"]

    with state._jun_diario_lock:
        usuarios = set(state._jun_diario.get(hoje_str, set()))
        pico     = state._jun_diario_pico.get(hoje_str, 0)

    total = len(usuarios)
    linhas = [
        f"📡 <b>RELATÓRIO PPPOE — {_tg_esc(cluster)}</b>",
        f"<i>{hoje_fmt} · Fechamento 18:30</i>",
        _TG_DIV,
        f"👥 Clientes únicos conectados hoje: <b>{total}</b>",
        f"📈 Pico de sessões simultâneas: <b>{pico}</b>",
    ]

    if usuarios:
        linhas += ["", "<b>Usuários do dia:</b>"]
        for u in sorted(usuarios)[:50]:
            linhas.append(f"  • <code>{_tg_esc(u)}</code>")
        if total > 50:
            linhas.append(f"  <i>... e mais {total - 50} usuário(s)</i>")

    _telegram_send("\n".join(linhas))
    log.info("[Juniper] Resumo diário enviado — %d clientes únicos", total)


def _jun_notify_new_clients(novos: list, cluster: str, ts: str) -> None:
    """Envia uma notificação Telegram para cada novo cliente PPPoE detectado."""
    if not _telegram_enabled() or not novos:
        return
    for c in novos:
        user    = _tg_esc(c.get("user_name")      or "—")
        ip      = _tg_esc(c.get("ip_address")     or "—")
        iface   = _tg_esc(c.get("interface")      or "—")
        mac     = _tg_esc(str(c.get("mac_address") or "—").upper())
        circuit = _tg_esc(_jun_circuit_label(c.get("circuit_id", "")))
        ult_con = _tg_esc(c.get("ultima_consulta") or "—")
        coleta  = _tg_esc(ts or datetime.now().strftime("%d/%m/%Y %H:%M:%S"))
        clus    = _tg_esc(cluster)

        msg = (
            "🔴 <b>Sessão PPPoE Problemática Detectada</b>\n"
            f"<code>{'─' * 28}</code>\n"
            f"👤 <b>Usuário</b>:        <code>{user}</code>\n"
            f"🌐 <b>IP Address</b>:     <code>{ip}</code>\n"
            f"🔌 <b>Interface</b>:      <code>{iface}</code>\n"
            f"💾 <b>MAC Address</b>:    <code>{mac}</code>\n"
            f"🔗 <b>Circuit ID</b>:     <code>{circuit}</code>\n"
            f"🕐 <b>Últ. Consulta</b>:  <code>{ult_con}</code>\n"
            f"<code>{'─' * 28}</code>\n"
            f"📡 <b>Cluster</b>: {clus}  |  ⏱ {coleta}"
        )
        ok = _telegram_send(msg, chat_id_override=TELEGRAM_CHAT_ALERTAS)
        log.info("[Juniper-TG] Notificação %s → %s", user, "OK" if ok else "FALHOU")


def _jun_poll_loop():
    """Thread de background: detecta novos clientes PPPoE e notifica via Telegram
    independente do dashboard estar aberto ou não. Intervalo: 3 minutos."""
    INTERVALO = 180
    if not MONITOR_CONFIG.get("username") or not MONITOR_CONFIG.get("ds_uid"):
        log.info("[Juniper] Monitor PPPoE não configurado — polling desativado")
        return
    log.info("[Juniper] Polling PPPoE iniciado — intervalo %ds", INTERVALO)
    import time as _time_mod
    while True:
        _time_mod.sleep(INTERVALO)
        if not _telegram_enabled():
            continue
        cluster = MONITOR_CONFIG["cluster_default"]
        try:
            result   = juniper_fetch(cluster)
            clientes = result.get("clientes") or []
            with state._jun_known_lock:
                primeira_poll = cluster not in state._jun_initialized
                conhecidos    = state._jun_known.get(cluster, set())
                novos = [] if primeira_poll else [
                    c for c in clientes
                    if c.get("user_name") and c["user_name"] not in conhecidos
                ]
                state._jun_known[cluster] = {c["user_name"] for c in clientes if c.get("user_name")}
                state._jun_initialized.add(cluster)
            if novos:
                _jun_notify_new_clients(novos, cluster, result.get("ultima_coleta", ""))
                log.info("[Juniper] %d novo(s) cliente(s) — cluster=%s", len(novos), cluster)
            else:
                log.debug("[Juniper] Poll OK — %d sessoes, 0 novos — cluster=%s", len(clientes), cluster)

            # Acumula clientes únicos do dia
            hoje_str = date.today().isoformat()
            with state._jun_diario_lock:
                if hoje_str not in state._jun_diario:
                    state._jun_diario[hoje_str] = set()
                for c in clientes:
                    if c.get("user_name"):
                        state._jun_diario[hoje_str].add(c["user_name"])
                pico_atual = state._jun_diario_pico.get(hoje_str, 0)
                if len(clientes) > pico_atual:
                    state._jun_diario_pico[hoje_str] = len(clientes)

        except Exception as ex:
            log.warning("[Juniper] Erro no poll: %s", str(ex)[:120])


def juniper_fetch(cluster=None):
    """
    Busca clientes PPPoE conectados via Grafana de monitoramento.
    Retorna dict com clientes, total, cluster e ultima_coleta.
    """
    base    = MONITOR_CONFIG["grafana_url"].rstrip("/")
    ds_uid  = MONITOR_CONFIG["ds_uid"]
    user    = MONITOR_CONFIG["username"]
    pwd     = MONITOR_CONFIG["password"]
    cluster = (cluster or MONITOR_CONFIG["cluster_default"]).strip()
    timeout = MONITOR_CONFIG["timeout_s"]

    url = "{}/api/datasources/proxy/uid/{}".format(base, ds_uid)
    log.info("[Juniper] GET %s  cluster=%s", url, cluster)

    resp = requests.get(
        url,
        auth=(user, pwd),
        timeout=timeout,
        verify=False,
    )
    resp.raise_for_status()
    data = resp.json()

    if isinstance(data, dict):
        clientes = data.get(cluster, [])
        if not isinstance(clientes, list):
            clientes = []
    elif isinstance(data, list):
        clientes = data
    else:
        clientes = []

    agora = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
    log.info("[Juniper] OK — cluster=%s  clientes=%d", cluster, len(clientes))
    return {
        "total":         len(clientes),
        "alerta":        len(clientes) == 0,
        "erro":          None,
        "clientes":      clientes,
        "cluster":       cluster,
        "ultima_coleta": agora,
    }
