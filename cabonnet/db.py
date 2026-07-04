# -*- coding: utf-8 -*-
"""
cabonnet/db.py — SQLite: persistência de cache e histórico de status.
"""

import hashlib
import hmac
import secrets
import sqlite3
import logging
import threading
from datetime import datetime, timedelta

from cabonnet.config import _DB_PATH
from cabonnet import state

log    = logging.getLogger("CaboNetServer")
log_db = logging.getLogger("CaboNetServer.DB")

# ── Módulos do app togleáveis por papel (gestor/operador/viewer) ──────────────
# Mapeados 1:1 com as rotas do Sidebar (src/components/layout/Sidebar.tsx).
ALL_MODULOS = [
    "dashboard", "ordens", "graficos", "cidades", "fornecedor", "juniper",
    "fechamento", "mapa", "noc",
    "erp_relatorios", "erp_alertas", "erp_produtividade", "erp_qualidade",
    "erp_planner", "erp_fila", "erp_ranking", "erp_acao",
]

# Defaults semeados no bootstrap — só o ponto de partida, ajustável depois pela
# própria tela de permissões.
_DEFAULT_OPERADOR_MODULOS = [
    "dashboard", "ordens", "cidades", "mapa", "juniper",
    "erp_relatorios", "erp_alertas", "erp_produtividade", "erp_qualidade",
    "erp_planner", "erp_fila", "erp_ranking", "erp_acao",
]
_DEFAULT_VIEWER_MODULOS = ["dashboard", "graficos", "cidades", "mapa"]


def _db_init():
    """Cria as tabelas SQLite se não existirem. Chamada uma vez no startup."""
    with state._db_lock:
        con = sqlite3.connect(_DB_PATH)
        con.execute("""
            CREATE TABLE IF NOT EXISTS query_cache (
                chave  TEXT PRIMARY KEY,
                csv    TEXT NOT NULL,
                ts     INTEGER NOT NULL
            )
        """)
        con.execute("""
            CREATE TABLE IF NOT EXISTS status_history (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                numos        TEXT    NOT NULL,
                de           TEXT,
                para         TEXT    NOT NULL,
                ts           INTEGER NOT NULL,
                nomedaequipe TEXT,
                nomedacidade TEXT,
                tiposervico  TEXT,
                revisita_motivo TEXT
            )
        """)
        con.execute("CREATE INDEX IF NOT EXISTS idx_sh_numos ON status_history(numos)")
        con.execute("CREATE INDEX IF NOT EXISTS idx_sh_ts    ON status_history(ts)")
        con.execute("""
            CREATE TABLE IF NOT EXISTS justificativas (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                data_pico       TEXT    NOT NULL,
                periodo_inicio  TEXT    NOT NULL,
                periodo_fim     TEXT    NOT NULL,
                count_os        INTEGER DEFAULT 0,
                zscore          REAL    DEFAULT NULL,
                contexto_real   TEXT    DEFAULT '',
                causa_principal TEXT    DEFAULT '',
                impacto         TEXT    DEFAULT '',
                contexto_ia     TEXT    DEFAULT '',
                acoes           TEXT    DEFAULT '[]',
                recomendacao    TEXT    DEFAULT '',
                criado_em       TEXT    NOT NULL
            )
        """)
        con.execute("CREATE INDEX IF NOT EXISTS idx_jus_pico ON justificativas(data_pico)")
        con.execute("""
            CREATE TABLE IF NOT EXISTS pico_alertas (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                data      TEXT    NOT NULL UNIQUE,
                count_os  INTEGER NOT NULL,
                zscore    REAL    NOT NULL,
                status    TEXT    NOT NULL DEFAULT 'pending',
                criado_em TEXT    NOT NULL
            )
        """)
        # Motivo de encerramento classificado manualmente na Ordens/OSDrawer — cobre
        # qualquer OS concluída, não só as que o bot do Telegram detectou como revisita.
        con.execute("""
            CREATE TABLE IF NOT EXISTS motivo_encerramento (
                numos       TEXT PRIMARY KEY,
                motivo      TEXT    NOT NULL,
                observacao  TEXT    DEFAULT '',
                nomedaequipe TEXT   DEFAULT '',
                nomedacidade TEXT   DEFAULT '',
                criado_em   TEXT    NOT NULL
            )
        """)
        # Cadastro leve de técnicos — "equipe" no CSV é na prática 1 código de
        # frente = 1 técnico (ex: F04). Isto só adiciona metadado humano (nome
        # real, contato) sobre o código já usado em toda parte; não substitui
        # nomedaequipe como chave, só o torna legível.
        con.execute("""
            CREATE TABLE IF NOT EXISTS tecnicos (
                codigo      TEXT PRIMARY KEY,
                nome_real   TEXT    DEFAULT '',
                contato     TEXT    DEFAULT '',
                ativo       INTEGER NOT NULL DEFAULT 1,
                atualizado_em TEXT  NOT NULL
            )
        """)
        # Cadastro de usuários — substitui as credenciais fixas do .env
        # (LOGIN_GESTOR_USER/PASS etc). Senha nunca em texto plano, ver
        # _hash_password/_verify_password.
        con.execute("""
            CREATE TABLE IF NOT EXISTS usuarios (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
                senha_hash    TEXT    NOT NULL,
                role          TEXT    NOT NULL DEFAULT 'viewer',
                ativo         INTEGER NOT NULL DEFAULT 1,
                criado_em     TEXT    NOT NULL,
                atualizado_em TEXT    NOT NULL
            )
        """)
        # Módulos liberados por papel (operador/viewer). Gestor não é gravado
        # aqui — é tratado como "todos os módulos" direto no código
        # (ver _db_get_permissoes) pra nunca haver risco de autoexclusão.
        con.execute("""
            CREATE TABLE IF NOT EXISTS role_permissoes (
                role   TEXT NOT NULL,
                modulo TEXT NOT NULL,
                PRIMARY KEY (role, modulo)
            )
        """)
        con.commit()
        con.close()


def _db_save_cache(chave, csv_text, ts):
    """Persiste um CSV de /query no SQLite para sobreviver a restarts."""
    try:
        with state._db_lock:
            con = sqlite3.connect(_DB_PATH)
            con.execute("INSERT OR REPLACE INTO query_cache(chave,csv,ts) VALUES(?,?,?)",
                        (chave, csv_text, int(ts)))
            con.commit()
            con.close()
    except Exception as ex:
        log_db.warning("Falha ao salvar cache SQLite: %s", ex)


def _db_load_cache(chave):
    """Carrega CSV persistido do SQLite. Retorna (csv_text, ts) ou ('', 0)."""
    try:
        with state._db_lock:
            con = sqlite3.connect(_DB_PATH)
            row = con.execute("SELECT csv, ts FROM query_cache WHERE chave=?", (chave,)).fetchone()
            con.close()
        return (row[0], row[1]) if row else ("", 0)
    except Exception as ex:
        log_db.warning("Falha ao carregar cache SQLite: %s", ex)
        return ("", 0)


def _db_save_justificativa(data_pico, periodo_inicio, periodo_fim, count_os, zscore,
                           contexto_real, causa_principal, impacto, contexto_ia, acoes, recomendacao):
    """Insere ou substitui justificativa para uma data de pico."""
    import json as _json
    criado_em = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    acoes_json = _json.dumps(acoes, ensure_ascii=False) if isinstance(acoes, list) else (acoes or "[]")
    try:
        with state._db_lock:
            con = sqlite3.connect(_DB_PATH)
            cur = con.execute(
                """INSERT INTO justificativas
                   (data_pico, periodo_inicio, periodo_fim, count_os, zscore,
                    contexto_real, causa_principal, impacto, contexto_ia, acoes, recomendacao, criado_em)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                (data_pico, periodo_inicio, periodo_fim, count_os, zscore,
                 contexto_real, causa_principal, impacto, contexto_ia, acoes_json, recomendacao, criado_em)
            )
            new_id = cur.lastrowid
            con.commit()
            con.close()
        return new_id
    except Exception as ex:
        log_db.warning("Falha ao salvar justificativa: %s", ex)
        return None


def _db_list_justificativas(limit=100):
    """Lista justificativas salvas ordenadas por data_pico desc."""
    import json as _json
    try:
        with state._db_lock:
            con = sqlite3.connect(_DB_PATH)
            rows = con.execute(
                "SELECT id,data_pico,periodo_inicio,periodo_fim,count_os,zscore,"
                "contexto_real,causa_principal,impacto,contexto_ia,acoes,recomendacao,criado_em "
                "FROM justificativas ORDER BY data_pico DESC LIMIT ?", (limit,)
            ).fetchall()
            con.close()
        cols = ["id","data_pico","periodo_inicio","periodo_fim","count_os","zscore",
                "contexto_real","causa_principal","impacto","contexto_ia","acoes","recomendacao","criado_em"]
        result = []
        for r in rows:
            d = dict(zip(cols, r))
            try:
                d["acoes"] = _json.loads(d["acoes"] or "[]")
            except Exception:
                d["acoes"] = []
            result.append(d)
        return result
    except Exception as ex:
        log_db.warning("Falha ao listar justificativas: %s", ex)
        return []


def _db_delete_justificativa(jid):
    """Remove justificativa por ID. Retorna True se removeu."""
    try:
        with state._db_lock:
            con = sqlite3.connect(_DB_PATH)
            cur = con.execute("DELETE FROM justificativas WHERE id=?", (jid,))
            affected = cur.rowcount
            con.commit()
            con.close()
        return affected > 0
    except Exception as ex:
        log_db.warning("Falha ao deletar justificativa %s: %s", jid, ex)
        return False


def _db_save_pico_alerta(data_str, count_os, zscore):
    """Insere alerta de pico (UNIQUE por data — ignora se já existir)."""
    criado_em = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    try:
        with state._db_lock:
            con = sqlite3.connect(_DB_PATH)
            con.execute(
                "INSERT OR IGNORE INTO pico_alertas(data, count_os, zscore, status, criado_em) VALUES(?,?,?,?,?)",
                (data_str, count_os, round(zscore, 2), "pending", criado_em)
            )
            con.commit()
            con.close()
        log_db.info("[PicoAlerta] Alerta salvo — %s | %d OS | Z=%.2f", data_str, count_os, zscore)
    except Exception as ex:
        log_db.warning("Falha ao salvar pico_alerta: %s", ex)


def _db_list_pico_alertas_pending():
    """Lista alertas com status='pending'."""
    try:
        with state._db_lock:
            con = sqlite3.connect(_DB_PATH)
            rows = con.execute(
                "SELECT id, data, count_os, zscore, status, criado_em FROM pico_alertas WHERE status='pending' ORDER BY data DESC"
            ).fetchall()
            con.close()
        return [{"id": r[0], "data": r[1], "count_os": r[2], "zscore": r[3], "status": r[4], "criado_em": r[5]} for r in rows]
    except Exception as ex:
        log_db.warning("Falha ao listar pico_alertas: %s", ex)
        return []


def _db_update_pico_alerta_status(alerta_id, status):
    """Atualiza status de um alerta (dismissed | justified)."""
    try:
        with state._db_lock:
            con = sqlite3.connect(_DB_PATH)
            con.execute("UPDATE pico_alertas SET status=? WHERE id=?", (status, alerta_id))
            con.commit()
            con.close()
        return True
    except Exception as ex:
        log_db.warning("Falha ao atualizar pico_alerta %s: %s", alerta_id, ex)
        return False


def _db_save_status_changes(changes):
    """Registra mudanças de status OS no histórico SQLite."""
    if not changes:
        return
    ts = int(datetime.now().timestamp())
    rows = [
        (r.get("numos",""), old, new, ts,
         r.get("nomedaequipe",""), r.get("nomedacidade",""), r.get("tiposervico",""), None)
        for r, old, new in changes
    ]
    try:
        with state._db_lock:
            con = sqlite3.connect(_DB_PATH)
            con.executemany(
                "INSERT INTO status_history(numos,de,para,ts,nomedaequipe,nomedacidade,tiposervico,revisita_motivo) VALUES(?,?,?,?,?,?,?,?)",
                rows
            )
            con.commit()
            con.close()
    except Exception as ex:
        log_db.warning("Falha ao salvar status_history: %s", ex)


_MOTIVO_LABEL = {
    "Material": "Material / Equipamento",
    "Técnico":  "Execução / Técnico",
    "Cliente":  "Cliente",
    "Outro":    "Outro",
}


def _db_list_revisita_motivos(dias=90):
    """Causa raiz REAL de revisitas/encerramentos — nunca estimada. Duas fontes:
    1. status_history.revisita_motivo — Telegram detecta o retorno do cliente e
       pergunta o motivo automaticamente (bot.py).
    2. motivo_encerramento — classificação manual feita no OSDrawer para qualquer
       OS concluída, cobrindo encerramentos que o bot não capturou.
    Quando as duas existem para a mesma OS, a manual prevalece (mais deliberada).
    """
    ts_min = int(datetime.now().timestamp()) - dias * 86400
    criado_min = (datetime.now() - timedelta(days=dias)).strftime("%Y-%m-%d %H:%M:%S")
    try:
        with state._db_lock:
            con = sqlite3.connect(_DB_PATH)
            tg_rows = con.execute(
                """SELECT numos, revisita_motivo, MAX(ts) as ts, nomedaequipe, nomedacidade
                   FROM status_history
                   WHERE revisita_motivo IS NOT NULL AND ts >= ?
                   GROUP BY numos""",
                (ts_min,)
            ).fetchall()
            manual_rows = con.execute(
                """SELECT numos, motivo, criado_em, nomedaequipe, nomedacidade
                   FROM motivo_encerramento
                   WHERE criado_em >= ?""",
                (criado_min,)
            ).fetchall()
            con.close()
    except Exception as ex:
        log_db.warning("Falha ao listar revisita_motivos: %s", ex)
        return {"total": 0, "distribuicao": [], "itens": []}

    por_numos = {}
    for r in tg_rows:
        por_numos[r[0]] = {
            "numos": r[0], "motivo": r[1], "ts": r[2],
            "nomedaequipe": r[3] or "", "nomedacidade": r[4] or "", "origem": "telegram",
        }
    for r in manual_rows:
        por_numos[r[0]] = {
            "numos": r[0], "motivo": r[1], "ts": r[2],
            "nomedaequipe": r[3] or "", "nomedacidade": r[4] or "", "origem": "manual",
        }

    itens = sorted(por_numos.values(), key=lambda i: i["ts"] or "", reverse=True)
    total = len(itens)
    contagem = {}
    for it in itens:
        contagem[it["motivo"]] = contagem.get(it["motivo"], 0) + 1
    distribuicao = sorted(
        (
            {
                "motivo": _MOTIVO_LABEL.get(m, m),
                "count":  c,
                "pct":    round(c / total * 100) if total else 0,
            }
            for m, c in contagem.items()
        ),
        key=lambda d: d["count"], reverse=True,
    )
    return {"total": total, "distribuicao": distribuicao, "itens": itens}


def _db_save_motivo_encerramento(numos, motivo, observacao="", nomedaequipe="", nomedacidade=""):
    """Classificação manual de motivo de encerramento (OSDrawer). INSERT OR REPLACE
    — reclassificar a mesma OS substitui o registro anterior."""
    criado_em = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    try:
        with state._db_lock:
            con = sqlite3.connect(_DB_PATH)
            con.execute(
                """INSERT OR REPLACE INTO motivo_encerramento
                   (numos, motivo, observacao, nomedaequipe, nomedacidade, criado_em)
                   VALUES (?,?,?,?,?,?)""",
                (numos, motivo, observacao, nomedaequipe, nomedacidade, criado_em)
            )
            con.commit()
            con.close()
        return True
    except Exception as ex:
        log_db.warning("Falha ao salvar motivo_encerramento: %s", ex)
        return False


def _db_get_motivo_encerramento(numos):
    """Retorna a classificação manual salva para uma OS, se existir."""
    try:
        with state._db_lock:
            con = sqlite3.connect(_DB_PATH)
            row = con.execute(
                "SELECT motivo, observacao, criado_em FROM motivo_encerramento WHERE numos=?",
                (numos,)
            ).fetchone()
            con.close()
        if not row:
            return None
        return {"motivo": row[0], "observacao": row[1], "criado_em": row[2]}
    except Exception as ex:
        log_db.warning("Falha ao buscar motivo_encerramento %s: %s", numos, ex)
        return None


def _db_list_tecnicos():
    """Lista o cadastro de técnicos (código de frente → nome real/contato)."""
    try:
        with state._db_lock:
            con = sqlite3.connect(_DB_PATH)
            rows = con.execute(
                "SELECT codigo, nome_real, contato, ativo, atualizado_em FROM tecnicos ORDER BY codigo"
            ).fetchall()
            con.close()
        return [
            {"codigo": r[0], "nome_real": r[1], "contato": r[2], "ativo": bool(r[3]), "atualizado_em": r[4]}
            for r in rows
        ]
    except Exception as ex:
        log_db.warning("Falha ao listar tecnicos: %s", ex)
        return []


def _db_upsert_tecnico(codigo, nome_real="", contato="", ativo=True):
    """Cria ou atualiza o cadastro de um técnico pelo código de frente."""
    atualizado_em = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    try:
        with state._db_lock:
            con = sqlite3.connect(_DB_PATH)
            con.execute(
                """INSERT INTO tecnicos (codigo, nome_real, contato, ativo, atualizado_em)
                   VALUES (?,?,?,?,?)
                   ON CONFLICT(codigo) DO UPDATE SET
                     nome_real=excluded.nome_real,
                     contato=excluded.contato,
                     ativo=excluded.ativo,
                     atualizado_em=excluded.atualizado_em""",
                (codigo, nome_real, contato, 1 if ativo else 0, atualizado_em)
            )
            con.commit()
            con.close()
        return True
    except Exception as ex:
        log_db.warning("Falha ao salvar tecnico %s: %s", codigo, ex)
        return False


def _db_delete_tecnico(codigo):
    """Remove o cadastro de um técnico (não afeta o histórico de OS, só o metadado)."""
    try:
        with state._db_lock:
            con = sqlite3.connect(_DB_PATH)
            cur = con.execute("DELETE FROM tecnicos WHERE codigo=?", (codigo,))
            affected = cur.rowcount
            con.commit()
            con.close()
        return affected > 0
    except Exception as ex:
        log_db.warning("Falha ao deletar tecnico %s: %s", codigo, ex)
        return False


# ═══════════════════════════════════════════════════════════════════════════
#  Usuários, senhas e permissões por papel
# ═══════════════════════════════════════════════════════════════════════════
#
# Nota sobre tratamento de erro: as funções de leitura acima seguem o padrão
# do arquivo (engolir exceção, logar, devolver valor vazio) porque falhar
# "aberto" nessas telas não é grave. Nas funções de escrita abaixo que mexem
# com autenticação (criar usuário, trocar senha) a exceção é propagada de
# propósito — o endpoint precisa saber a causa real (ex: username duplicado
# → 409) em vez de um "False" genérico que esconderia o motivo.

_PBKDF2_ITERATIONS = 200_000


def _hash_password(plain):
    """Gera um hash PBKDF2-HMAC-SHA256 com salt aleatório (stdlib apenas).
    Formato auto-descritivo: pbkdf2_sha256$<iteracoes>$<salt_hex>$<hash_hex>."""
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", plain.encode("utf-8"), salt, _PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${_PBKDF2_ITERATIONS}${salt.hex()}${dk.hex()}"


def _verify_password(plain, stored):
    """Verifica senha em tempo constante. Retorna False (não lança) para
    qualquer hash malformado/desconhecido — nunca deixa um formato inesperado
    virar autenticação bem-sucedida."""
    try:
        algo, iterations_str, salt_hex, hash_hex = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        salt = bytes.fromhex(salt_hex)
        dk = hashlib.pbkdf2_hmac("sha256", plain.encode("utf-8"), salt, int(iterations_str))
        return hmac.compare_digest(dk.hex(), hash_hex)
    except (ValueError, AttributeError):
        return False


def _db_list_usuarios():
    """Lista usuários cadastrados. Nunca inclui senha_hash."""
    try:
        with state._db_lock:
            con = sqlite3.connect(_DB_PATH)
            rows = con.execute(
                "SELECT id, username, role, ativo, criado_em, atualizado_em "
                "FROM usuarios ORDER BY username COLLATE NOCASE"
            ).fetchall()
            con.close()
        return [
            {"id": r[0], "username": r[1], "role": r[2], "ativo": bool(r[3]),
             "criado_em": r[4], "atualizado_em": r[5]}
            for r in rows
        ]
    except Exception as ex:
        log_db.warning("Falha ao listar usuarios: %s", ex)
        return []


def _db_get_usuario_by_username(username):
    """Uso interno de login — inclui senha_hash e ativo. Não expor via API."""
    with state._db_lock:
        con = sqlite3.connect(_DB_PATH)
        row = con.execute(
            "SELECT id, username, senha_hash, role, ativo FROM usuarios WHERE username=?",
            (username,)
        ).fetchone()
        con.close()
    if not row:
        return None
    return {"id": row[0], "username": row[1], "senha_hash": row[2], "role": row[3], "ativo": bool(row[4])}


def _db_get_usuario_by_id(uid):
    with state._db_lock:
        con = sqlite3.connect(_DB_PATH)
        row = con.execute(
            "SELECT id, username, role, ativo FROM usuarios WHERE id=?", (uid,)
        ).fetchone()
        con.close()
    if not row:
        return None
    return {"id": row[0], "username": row[1], "role": row[2], "ativo": bool(row[3])}


def _db_create_usuario(username, senha_hash, role):
    """Cria um usuário. Propaga sqlite3.IntegrityError se o username já existe
    (COLLATE NOCASE) — o endpoint traduz isso para HTTP 409."""
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with state._db_lock:
        con = sqlite3.connect(_DB_PATH)
        try:
            cur = con.execute(
                "INSERT INTO usuarios (username, senha_hash, role, ativo, criado_em, atualizado_em) "
                "VALUES (?,?,?,1,?,?)",
                (username, senha_hash, role, now, now)
            )
            con.commit()
            return cur.lastrowid
        finally:
            con.close()


def _db_update_usuario(uid, role=None, ativo=None):
    """Atualização parcial de papel/status. Username é imutável (evita
    re-chavear sessões em memória, que guardam o username no token)."""
    fields, values = [], []
    if role is not None:
        fields.append("role=?")
        values.append(role)
    if ativo is not None:
        fields.append("ativo=?")
        values.append(1 if ativo else 0)
    if not fields:
        return _db_get_usuario_by_id(uid)
    fields.append("atualizado_em=?")
    values.append(datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    values.append(uid)
    with state._db_lock:
        con = sqlite3.connect(_DB_PATH)
        con.execute(f"UPDATE usuarios SET {', '.join(fields)} WHERE id=?", values)
        con.commit()
        con.close()
    return _db_get_usuario_by_id(uid)


def _db_set_password(uid, senha_hash):
    with state._db_lock:
        con = sqlite3.connect(_DB_PATH)
        cur = con.execute(
            "UPDATE usuarios SET senha_hash=?, atualizado_em=? WHERE id=?",
            (senha_hash, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), uid)
        )
        affected = cur.rowcount
        con.commit()
        con.close()
    return affected > 0


def _db_count_usuarios():
    """Total de usuários cadastrados (qualquer status) — usado no bootstrap
    e em _auth_enabled()."""
    with state._db_lock:
        con = sqlite3.connect(_DB_PATH)
        n = con.execute("SELECT COUNT(*) FROM usuarios").fetchone()[0]
        con.close()
    return n


def _db_count_ativos_por_role(role):
    """Quantos usuários ATIVOS existem com o papel dado — usado no guard
    'não desative/rebaixe o último gestor ativo'."""
    with state._db_lock:
        con = sqlite3.connect(_DB_PATH)
        n = con.execute(
            "SELECT COUNT(*) FROM usuarios WHERE role=? AND ativo=1", (role,)
        ).fetchone()[0]
        con.close()
    return n


def _db_get_permissoes(role):
    """Módulos liberados para o papel. Gestor sempre é 'todos', nunca lido
    da tabela (evita qualquer estado inconsistente derrubar o próprio acesso
    de gestor)."""
    if role == "gestor":
        return list(ALL_MODULOS)
    try:
        with state._db_lock:
            con = sqlite3.connect(_DB_PATH)
            rows = con.execute(
                "SELECT modulo FROM role_permissoes WHERE role=?", (role,)
            ).fetchall()
            con.close()
        return [r[0] for r in rows]
    except Exception as ex:
        log_db.warning("Falha ao ler permissoes do papel %s: %s", role, ex)
        return []


def _db_set_permissoes(role, modulos):
    """Substitui a lista de módulos liberados para o papel. Gestor é
    imutável — o caller deve rejeitar antes de chamar (ValueError aqui é
    defesa em profundidade caso algo chame direto)."""
    if role == "gestor":
        raise ValueError("Permissões do papel gestor não são editáveis")
    validos = [m for m in modulos if m in ALL_MODULOS]
    with state._db_lock:
        con = sqlite3.connect(_DB_PATH)
        con.execute("DELETE FROM role_permissoes WHERE role=?", (role,))
        if validos:
            con.executemany(
                "INSERT INTO role_permissoes (role, modulo) VALUES (?,?)",
                [(role, m) for m in validos]
            )
        con.commit()
        con.close()
    return validos


def _db_bootstrap_admin():
    """Primeira execução com o banco de usuários vazio: cria um gestor
    'admin' com senha aleatória (logada uma única vez) e semeia defaults de
    permissão pra operador/viewer. Idempotente — só age se a tabela estiver
    vazia. Retorna a senha gerada, ou None se já havia usuários."""
    if _db_count_usuarios() > 0:
        return None

    senha = secrets.token_urlsafe(12)
    _db_create_usuario("admin", _hash_password(senha), "gestor")
    _db_set_permissoes("operador", _DEFAULT_OPERADOR_MODULOS)
    _db_set_permissoes("viewer", _DEFAULT_VIEWER_MODULOS)

    log.warning("=" * 64)
    log.warning("  USUARIO ADMIN CRIADO (primeiro boot do banco de usuarios)")
    log.warning("  login: admin   senha: %s", senha)
    log.warning("  troque a senha em /erp/usuarios assim que possivel")
    log.warning("=" * 64)
    print(f"\n[BOOTSTRAP] usuario admin criado — senha: {senha}\n", flush=True)
    return senha
