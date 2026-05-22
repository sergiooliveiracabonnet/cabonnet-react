# -*- coding: utf-8 -*-
"""
cabonnet/config.py — Constantes de configuração (não mudam após startup).
Nenhum import de outros módulos cabonnet.
"""

import os
import pathlib

# ══════════════════════════════════════════════════════════════════════════════
#  .ENV — carrega credenciais do arquivo .env (sem dependencia externa)
# ══════════════════════════════════════════════════════════════════════════════
_SCRIPT_DIR_ENV = os.path.dirname(os.path.abspath(__file__))
# O diretório raiz do projeto (um nível acima de cabonnet/)
_PROJECT_DIR    = os.path.dirname(_SCRIPT_DIR_ENV)

JUN_HIST_FILE = os.path.join(_PROJECT_DIR, "jun_historico.json")


def _load_env(path=None, overwrite=False):
    """Carrega variaveis de um arquivo .env para os.environ."""
    if path is None:
        path = os.path.join(_PROJECT_DIR, ".env")
    if not os.path.isfile(path):
        return
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" not in line:
                continue
            key, _, val = line.partition("=")
            key = key.strip()
            val = val.strip()
            if not key:
                continue
            if overwrite:
                os.environ[key] = val
            else:
                os.environ.setdefault(key, val)


_load_env()


def _env(key, default=""):
    """Retorna variavel de ambiente ou default."""
    return os.environ.get(key, default)


# ══════════════════════════════════════════════════════════════════════════════
#  CONFIG
# ══════════════════════════════════════════════════════════════════════════════
CONFIG = {
    "grafana_url": _env("GRAFANA_URL", "https://cabonnet-monitoramento.interfocus.com.br:3000"),
    "username":    _env("GRAFANA_USER"),
    "password":    _env("GRAFANA_PASS"),
    "ds_uid":      _env("GRAFANA_DS_UID"),
    "port":        5000,
    "port_backup": 5001,
    "timeout_s":   30,
    "log_file":    os.path.join(_PROJECT_DIR, "cabonnet_server.log"),
}

# ── Telegram — Bot e Grupos ──────────────────────────────────────────────────
TELEGRAM_BOT_TOKEN           = _env("TELEGRAM_BOT_TOKEN",       "")
TELEGRAM_CHAT_ID             = _env("TELEGRAM_CHAT_ID",         "")  # Produtividade (principal)
TELEGRAM_CHAT_INSTACABLE     = _env("TELEGRAM_CHAT_INSTACABLE",      "")
TELEGRAM_CHAT_WES            = _env("TELEGRAM_CHAT_WES",             "")
TELEGRAM_CHAT_ALERTAS        = _env("TELEGRAM_CHAT_ALERTAS",         "")
TELEGRAM_CHAT_REDE           = _env("TELEGRAM_CHAT_REDE",            "")
TELEGRAM_CHAT_OPERACIONAL_THM = _env("TELEGRAM_CHAT_OPERACIONAL_THM", "")

# ── Limites de SLA por tipo de serviço (em dias) ────────────────────────────
_SLA_LIMITS = {
    "INSTALAC": 2,   # Instalação
    "MANUTENC": 1,   # Manutenção
    "VT 24H":   1,
    "VT 08H":   1,
    "VT 48H":   2,
    "DEFAULT":  2,
}

# ── SQLite — caminho do banco ─────────────────────────────────────────────────
_DB_PATH = os.path.join(_PROJECT_DIR, "cabonnet_data.db")

# ── Autenticação do Dashboard ─────────────────────────────────────────────────
LOGIN_USER       = _env("LOGIN_USER", "admin")
LOGIN_PASS       = _env("LOGIN_PASS", "")           # vazio = sem autenticação (legado → role gestor)
SESSION_DURATION = int(_env("SESSION_DURATION", "28800"))  # 8 horas em segundos

# ── Roles de acesso (3 níveis via .env) ──────────────────────────────────────
# Exemplo no .env:
#   LOGIN_GESTOR_USER=admin      LOGIN_GESTOR_PASS=senha_forte
#   LOGIN_OPERADOR_USER=oper     LOGIN_OPERADOR_PASS=senha_oper
#   LOGIN_VIEWER_USER=viewer     LOGIN_VIEWER_PASS=senha_viewer
LOGIN_GESTOR_USER   = _env("LOGIN_GESTOR_USER",   "")
LOGIN_GESTOR_PASS   = _env("LOGIN_GESTOR_PASS",   "")
LOGIN_OPERADOR_USER = _env("LOGIN_OPERADOR_USER",  "")
LOGIN_OPERADOR_PASS = _env("LOGIN_OPERADOR_PASS",  "")
LOGIN_VIEWER_USER   = _env("LOGIN_VIEWER_USER",    "")
LOGIN_VIEWER_PASS   = _env("LOGIN_VIEWER_PASS",    "")


def _resolve_role(user, pwd):
    """Verifica credenciais e retorna 'gestor'|'operador'|'viewer'|None.
    Compatibilidade com LOGIN_USER/PASS legados (mantidos como gestor)."""
    if not user or not pwd:
        return None
    # Novos roles (prioridade)
    if LOGIN_GESTOR_PASS and user == LOGIN_GESTOR_USER and pwd == LOGIN_GESTOR_PASS:
        return "gestor"
    if LOGIN_OPERADOR_PASS and user == LOGIN_OPERADOR_USER and pwd == LOGIN_OPERADOR_PASS:
        return "operador"
    if LOGIN_VIEWER_PASS and user == LOGIN_VIEWER_USER and pwd == LOGIN_VIEWER_PASS:
        return "viewer"
    # Legado: LOGIN_USER/PASS → gestor (backward-compat)
    if LOGIN_PASS and user == LOGIN_USER and pwd == LOGIN_PASS:
        return "gestor"
    return None

# ── Grafana de Monitoramento (PPPoE / Juniper) ────────────────────────────────
MONITOR_CONFIG = {
    "grafana_url":     _env("MONITOR_URL", "https://monitoramento.cabonnet.com.br"),
    "username":        _env("MONITOR_USER"),
    "password":        _env("MONITOR_PASS"),
    "ds_uid":          _env("MONITOR_DS_UID"),
    "cluster_default": "Vale",
    "timeout_s":       20,
}

# ── iManager BI (Detalhes de OS) ─────────────────────────────────────────────
IMANAGER_CONFIG = {
    "url":      _env("IMANAGER_URL", "https://imanagergerencialcentral.cabonnet.com.br"),
    "username": _env("IMANAGER_USER"),
    "password": _env("IMANAGER_PASS"),
}

PORT_BACKUP = CONFIG["port_backup"]
SCRIPT_DIR  = pathlib.Path(_PROJECT_DIR).resolve()

# ── Pasta de backups ──────────────────────────────────────────────────────────
_env_backup = os.environ.get("CABONNET_BACKUP_DIR", "").strip()
BACKUP_DIR  = pathlib.Path(_env_backup) if _env_backup else SCRIPT_DIR / "Backup"

GRAFANA_URL  = CONFIG["grafana_url"]
USERNAME     = CONFIG["username"]
PASSWORD     = CONFIG["password"]
DS_UID       = CONFIG["ds_uid"]
PORT         = CONFIG["port"]

MONITOR_URL    = _env("MONITOR_URL",    "")
MONITOR_USER   = _env("MONITOR_USER",   "")
MONITOR_PASS   = _env("MONITOR_PASS",   "")
MONITOR_DS_UID = _env("MONITOR_DS_UID", "")
ZABBIX_DS_UID  = _env("ZABBIX_DS_UID",  "") or MONITOR_DS_UID

# ── AI ────────────────────────────────────────────────────────────────────────
ANTHROPIC_API_KEY = _env("ANTHROPIC_API_KEY", "")

# ── Lockfile ──────────────────────────────────────────────────────────────────
LOCK_FILE = os.path.join(_PROJECT_DIR, "cabonnet_server.lock")

# ── Lista de atendentes Atendimento ──────────────────────────────────────────
_ATE_ATENDENTES = (
    'HELENSILVA', 'DEBORAREIS', 'DEBORAHVICTORIA', 'NAYARADIAS',
    'AMANDACANDIA', 'FERNANDARAMOS', 'CRISTIANEMARINHO', 'JOYCEMIMOSO',
    'JAQUELINELEMES', 'RAFAELABETONI', 'MICHELLESILVA'
)

# ── Cache TTL atendimento ─────────────────────────────────────────────────────
_ATE_CACHE_TTL = 900  # segundos

# ── AI cache TTL ─────────────────────────────────────────────────────────────
_AI_CACHE_TTL = 300   # 5 minutos

# ── Constantes Telegram ───────────────────────────────────────────────────────
_TG_DIV  = "─" * 24
_TG_DIVS = "─" * 20

_STATUS_CHANGE_BATCH_LIMIT = 8  # Acima disso envia resumo em vez de msgs individuais

_STATUS_EMOJI = {
    "Pendente":                "🟡",
    "Atendimento":             "🔵",
    "Atendimento/Finalizadas": "🟢",
    "Concluída":               "✅",
    "Concluída/Sem Execução":  "⚠️",
}

# Grupos de operadoras: alias → frentes INST vinculadas
_OPERADORA_GRUPOS = {
    "INSTACABLE": ["F01", "F04", "F05", "F07", "F20", "F45", "F46", "F47", "F48", "F49", "F50"],
    "WES":        ["F08", "F11", "F23", "F36", "F44"],
    "THM":        ["F12", "F13", "F14"],
}

# ── Revisitas ─────────────────────────────────────────────────────────────────
_REVISITA_TTL_DIAS = 30

# ── Imagem PIL ────────────────────────────────────────────────────────────────
_SC = 2      # escala 2× (alta qualidade)
_IW = 740    # largura lógica (px)

_IC = {
    "bg":       (13,  17,  23 ), "bg_hdr":   (17,  24,  39 ),
    "bg_col":   (15,  26,  39 ), "bg_alt":   (15,  21,  32 ),
    "bg_total": (19,  31,  46 ), "bg_eq":    (13,  25,  44 ),
    "bg_foot":  (8,   15,  26 ), "border":   (28,  40,  58 ),
    "text":     (226, 232, 240), "dim":      (148, 163, 184),
    "muted":    (74,  100, 128), "red":      (239, 68,  68 ),
    "yellow":   (234, 179, 8  ), "green":    (34,  197, 94 ),
    "cyan":     (14,  165, 233),
}

_OPERADORA_COR = {
    "WES":        (167, 139, 250),
    "INSTACABLE": (234, 179, 8  ),
    "REDE":       (34,  197, 94 ),
    None:         (14,  165, 233),
}
_OPERADORA_LABEL = {
    "WES": "WES", "INSTACABLE": "Instacable", "REDE": "Rede", None: "Todos os Fornecedores",
}

_FONT_PAIRS = [
    ("C:/Windows/Fonts/arial.ttf",    "C:/Windows/Fonts/arialbd.ttf"),
    ("C:/Windows/Fonts/segoeui.ttf",  "C:/Windows/Fonts/segoeuib.ttf"),
    ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
     "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
]

_RCOLS = [
    {"key": "equipe",   "label": "EQUIPE",       "x": 16,  "w": 218, "al": "left"  },
    {"key": "total",    "label": "OS",            "x": 238, "w": 52,  "al": "center"},
    {"key": "pendente", "label": "PENDENTE",      "x": 294, "w": 80,  "al": "center"},
    {"key": "atend",    "label": "ATENDIMENTO",   "x": 378, "w": 80,  "al": "center"},
    {"key": "aging",    "label": "AGING MÉD.",    "x": 462, "w": 85,  "al": "center"},
    {"key": "criticas", "label": "SLA CRÍTICO",   "x": 551, "w": 80,  "al": "center"},
]
_R_FOOT_H = 28

_DCOLS = [
    {"key": "numos",   "label": "Nº OS",    "x": 16,  "w": 72,  "al": "left"  },
    {"key": "cliente", "label": "Cliente",  "x": 92,  "w": 175, "al": "left"  },
    {"key": "cidade",  "label": "Cidade",   "x": 271, "w": 100, "al": "left"  },
    {"key": "tipo",    "label": "Tipo",     "x": 375, "w": 88,  "al": "left"  },
    {"key": "aging",   "label": "Aging",    "x": 467, "w": 52,  "al": "center"},
    {"key": "agend",   "label": "Agend.",   "x": 523, "w": 72,  "al": "center"},
    {"key": "status",  "label": "Situação", "x": 599, "w": 125, "al": "left"  },
]
_D_FOOT_H = 26

_D_STATUS_COLOR = {
    "Pendente":     (234, 179, 8  ),
    "Atendimento":  (14,  165, 233),
    "Concluída":    (34,  197, 94 ),
    "Reagendamento":(249, 115, 22 ),
}

# ── SEV labels Zabbix ─────────────────────────────────────────────────────────
_SEV_LABELS = ["", "INFORMACAO", "AVISO", "MEDIO", "ALTO", "CRITICO", "DESASTRE"]
