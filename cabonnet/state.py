# -*- coding: utf-8 -*-
"""
cabonnet/state.py — Todos os globals mutáveis + locks.
Nenhum import de outros módulos cabonnet.
"""

import json
import queue as _queue
import threading

# ── Cache de dados para /status e resumo diário ───────────────────────────────
_dados_cache      = {"agendado": [], "ts": 0}
_dados_cache_lock = threading.Lock()

# ── Cache de fallback para /query (servido quando Grafana falha) ───────────────
_query_cache      = {"pendente": "", "agendado": "", "futuro": "", "ts": 0}
_query_cache_lock = threading.Lock()

# ── Snapshot para detecção de mudança de status ───────────────────────────────
_status_snapshot      = {}    # numos(str) → descsituacao(str)
_status_snapshot_lock = threading.Lock()
_status_snap_primed   = False # Primeira carga não dispara alertas

# ── Raiz de revisita — OS concluídas recentes por cliente ─────────────────────
# { codigocliente: [(numos, ts_conclusao), ...] }  — TTL 30 dias
_concluidas_recentes      = {}
_concluidas_recentes_lock = threading.Lock()

# ── Telegram session e offset ─────────────────────────────────────────────────
_tg_session = None
_tg_offset  = 0

# ── Variáveis de estado para monitors em tempo real ───────────────────────────
_sla_alertados      = set()   # numos já alertados hoje por SLA
_sla_alertados_data = None    # date do último reset
_fila_prev_count    = 0       # tamanho anterior da fila para alerta de crescimento
_atend_travados      = set()  # numos de OS em Atendimento já alertadas por travamento
_atend_travados_data = None
_sem_exec_alertadas      = {} # { equipe: quantidade alertada } para Sem Execução acumulada
_sem_exec_alertadas_data = None

# ── Estado do monitor de manutenções ─────────────────────────────────────────
_manut_vistos      = set()   # numos de manutenção já alertados hoje
_manut_vistos_data = None    # date do último reset

# ── Juniper PPPoE ─────────────────────────────────────────────────────────────
# Conjunto de user_name conhecidos na última coleta (por cluster).
_jun_known: dict = {}
_jun_initialized: set = set()   # clusters que já tiveram a primeira poll
_jun_known_lock = threading.Lock()

# Acumulador diário — rastreia todos os clientes vistos durante o dia
_jun_diario: dict = {}       # date_str → set de user_names vistos hoje
_jun_diario_pico: dict = {}  # date_str → maior nº simultâneo no dia
_jun_diario_lock = threading.Lock()

# ── Sessions de autenticação ──────────────────────────────────────────────────
_sessions      = {}   # { token: expiry_timestamp }
_sessions_lock = threading.Lock()

# ── Cache atendimento ─────────────────────────────────────────────────────────
_ate_cache      = {"data": None, "ts": 0}
_ate_cache_lock = threading.Lock()

# ── Cache AI ──────────────────────────────────────────────────────────────────
_ai_cache           = {"hash": "", "narrativa": "", "insights": [], "ts": 0.0}
_ai_cache_lock      = threading.Lock()
_ai_revisitas_cache = {"hash": "", "narrativa": "", "insights": [], "estrategia": [], "prioridades": [], "ts": 0.0}
_ai_revisitas_lock  = threading.Lock()
_ai_anomalias_cache = {"hash": "", "causa_raiz": "", "acoes": [], "prioridade": "", "ts": 0.0}
_ai_anomalias_lock  = threading.Lock()
_ai_briefing_cache  = {"texto": "", "acoes": [], "data": "", "ts": 0.0}
_ai_briefing_lock   = threading.Lock()
_ai_forecast_cache  = {"hash": "", "tendencia": "", "narrativa": "", "previsao": [], "pico_previsto": None, "ts": 0.0}
_ai_forecast_lock   = threading.Lock()

# ── PIL fontes pré-carregadas ─────────────────────────────────────────────────
_F = {}

# ── DB lock (usado em db.py mas referenciado também no bot via callback) ──────
_db_lock = threading.Lock()

# ── SSE — Server-Sent Events: um queue.Queue por cliente conectado ────────────
_sse_clients      = []
_sse_clients_lock = threading.Lock()

def sse_broadcast(event, data):
    """Envia um evento SSE para todos os clientes conectados via /events."""
    msg = f"event: {event}\ndata: {json.dumps(data)}\n\n".encode()
    with _sse_clients_lock:
        for q in list(_sse_clients):
            try:
                q.put_nowait(msg)
            except Exception:
                pass
