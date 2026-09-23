# -*- coding: utf-8 -*-
"""
cabonnet/clientes.py — Visão analítica do cliente: busca, cadastro, contratos e OS.

Lê só as tabelas que o usuário do datasource do Grafana enxerga (clientes,
contratos, ordemservico e auxiliares). Telefones, financeiro, programação (plano)
e histórico de atendimento dão `permission denied` hoje. Enquanto isso o plano
sai da ficha de venda (extrair_plano) e os reagendamentos da auditoria de OS.

Como o resto do projeto, o SQL vai pronto para a API do Grafana (sem bind
parameters). Toda entrada do usuário passa por `_termo_busca` / `int()` antes de
tocar o texto do SQL, e as cidades só podem sair de CIDADES_ATENDIDAS.
"""

import re
import unicodedata

from cabonnet.config import CIDADES_ATENDIDAS, CLUSTERS
from cabonnet.grafana import _com_cidades

# Limite do histórico de OS devolvido por cliente. O campeão do Vale tem ~150
# OS em 12 meses (contas corporativas), então 300 cobre folgado a pessoa física.
LIMITE_OS = 300
LIMITE_BUSCA = 20

_ACENTOS_DE = "ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ"
_ACENTOS_PARA = "AAAAAEEEEIIIIOOOOOUUUUC"


def cidades_da_sessao(sess: dict) -> list[str]:
    """Cidades (chave de tablocal.nome) que a sessão pode consultar."""
    cluster_key = sess.get("cluster_key")
    if not cluster_key or cluster_key == "TODOS":
        return list(CIDADES_ATENDIDAS)
    cluster = CLUSTERS.get(cluster_key)
    return list(cluster["cidades"]) if cluster else []


def _in_cidades(cidades) -> str:
    validas = [c for c in cidades if c in CIDADES_ATENDIDAS]
    if not validas:
        raise ValueError("Nenhuma cidade permitida para a consulta")
    return ",".join("'{}'".format(c) for c in validas)


def _sem_acento(texto: str) -> str:
    raw = unicodedata.normalize("NFD", texto).encode("ascii", "ignore").decode("ascii")
    return raw.upper()


def _termo_busca(q: str) -> tuple[str, list[str]]:
    """Normaliza a busca em ("digitos", [d]) ou ("texto", [palavras]).

    Só sobrevivem [A-Z0-9]: aspas, % e _ nunca chegam ao LIKE."""
    q = (q or "").strip()[:80]
    if q and not re.search(r"[A-Za-zÀ-ÿ]", q):
        digitos = re.sub(r"\D", "", q)
        return ("digitos", [digitos] if digitos else [])
    palavras = [p for p in re.split(r"[^A-Z0-9]+", _sem_acento(q)) if len(p) >= 2]
    return ("texto", palavras[:5])


def mascarar_documento(doc) -> tuple[str, str | None]:
    """CPF → ***.456.789-**, CNPJ → **.345.678/0001-**. Devolve (mascara, PF|PJ)."""
    d = re.sub(r"\D", "", str(doc or ""))
    if len(d) == 11:
        return "***.{}.{}-**".format(d[3:6], d[6:9]), "PF"
    if len(d) == 14:
        return "**.{}.{}/{}-**".format(d[2:5], d[5:8], d[8:12]), "PJ"
    return "", None


def _nome_normalizado(expr: str) -> str:
    return "translate(upper({}), '{}', '{}')".format(expr, _ACENTOS_DE, _ACENTOS_PARA)


def sql_busca_clientes(q: str, cidades) -> str | None:
    """SQL da busca, ou None quando o termo não basta para buscar."""
    modo, termos = _termo_busca(q)
    if not termos:
        return None
    if modo == "digitos":
        d = termos[0]
        if len(d) < 3:
            return None
        conds = []
        if len(d) <= 9:
            conds.append("cli.codigocliente = {}".format(int(d)))
            conds.append("cli.codigocliente in (select ct.codigodocliente from contratos ct "
                         "where ct.contrato = {} and ct.cidade = cli.cidade)".format(int(d)))
        if len(d) == 7:
            conds.append("cli.codigocliente in (select o.codigoassinante from ordemservico o "
                         "where o.numos = {} and o.cidade = cli.cidade)".format(int(d)))
        if len(d) >= 4:
            conds.append(r"regexp_replace(coalesce(cli.cpf_cnpj, ''), '\D', '', 'g') like '%{}%'".format(d))
        where = " or ".join(conds)
    else:
        nome = _nome_normalizado("coalesce(cli.nome, '') || ' ' || coalesce(cli.nomefantasia, '')")
        where = " and ".join("{} like '%{}%'".format(nome, p) for p in termos)

    return _com_cidades("""
with achados as (
  select
    cli.codigocliente, cli.cidade,
    coalesce(nullif(trim(cli.nome), ''), '')         as nome,
    coalesce(cli.nomefantasia, '')                   as nomefantasia,
    coalesce(cli.cpf_cnpj, '')                       as cpf_cnpj,
    coalesce(cli.bairroresidencial::text, '')        as bairro,
    case t.nome
      __CIDADES_CASE__
      else t.nome
    end                                              as nomedacidade
  from clientes cli
    join tablocal t on t.codigo = cli.cidade
  where t.nome in ({cidades})
    and ({where})
  limit 60
)
select a.*,
  (select count(*) from contratos ct
    where ct.codigodocliente = a.codigocliente and ct.cidade = a.cidade)                    as contratos,
  (select count(*) from contratos ct
    where ct.codigodocliente = a.codigocliente and ct.cidade = a.cidade and ct.situacao = 2) as contratos_ativos
from achados a
order by contratos_ativos desc, nome
limit {limite}
""", indent=6).format(cidades=_in_cidades(cidades), where=where, limite=LIMITE_BUSCA)


def sql_cliente(codigo, cidades) -> str:
    return _com_cidades("""
select
  cli.codigocliente, cli.cidade as codcidade,
  coalesce(nullif(trim(cli.nome), ''), '')                             as nome,
  coalesce(cli.nome_social, '')                                        as nome_social,
  coalesce(cli.nomefantasia, '')                                       as nomefantasia,
  coalesce(cli.cpf_cnpj, '')                                           as cpf_cnpj,
  coalesce(cli.email, '')                                              as email,
  coalesce(ende.tipodologradouro || ' ' || ende.nomelogradouro, '')    as logradouro,
  coalesce(cli.numeroresidencial, '')                                  as numero,
  coalesce(cli.complementoresidencial, '')                             as complemento,
  coalesce(cli.bairroresidencial::text, '')                            as bairro,
  coalesce(cli.cepresidencial::text, '')                               as cep,
  case t.nome
    __CIDADES_CASE__
    else t.nome
  end                                                                  as nomedacidade,
  to_char(cli.d_datacadastro, 'DD/MM/YYYY')                            as cliente_desde,
  to_char(cli.d_dataultimaatualizacao, 'DD/MM/YYYY')                   as atualizado_em,
  cli.dtvencto                                                         as dia_vencimento,
  cli.vip, cli.bloqueio_juridico, cli.enviarporwhatsapp,
  coalesce(cli.observacao, '')                                         as observacao
from clientes cli
  join tablocal t on t.codigo = cli.cidade
  left join enderecos ende on ende.codigodacidade = cli.cidade and ende.codigodologradouro = cli.enderecoresidencial
where cli.codigocliente = {codigo}
  and t.nome in ({cidades})
limit 1
""", indent=4).format(codigo=int(codigo), cidades=_in_cidades(cidades))


def sql_contratos(codigo, codcidade) -> str:
    return """
select
  ct.contrato,
  ct.situacao,
  ct.valordocontrato                                                   as valor,
  to_char(ct.d_datadavenda,      'DD/MM/YYYY')                         as datavenda,
  to_char(ct.d_datadainstalacao, 'DD/MM/YYYY')                         as datainstalacao,
  to_char(ct.d_datasituacaoanterior, 'DD/MM/YYYY')                     as datasituacaoanterior,
  ct.situacaoanterior,
  coalesce(cart.descricao, '')                                         as empresa,
  coalesce(ende.tipodologradouro || ' ' || ende.nomelogradouro, '')    as logradouro,
  coalesce(ct.numeroconexao, '')                                       as numero,
  coalesce(ct.complementoconexao, '')                                  as complemento,
  coalesce(ct.bairroconexao::text, '')                                 as bairro,
  coalesce(ct.cepconexao::text, '')                                    as cep,
  coalesce(ct.apelidocontrato, '')                                     as apelido,
  coalesce(ct.pontodereferencia, '')                                   as pontoreferencia,
  coalesce(ct.observacao, '')                                          as observacao,
  to_char(ct.d_iniciopromocao, 'DD/MM/YYYY')                           as iniciopromocao
from contratos ct
  left join carteiracidade cc on cc.codigocarteira = ct.codcarteira and cc.codigocidade = ct.cidade
  left join carteira cart     on cart.codigo = cc.codigocarteira
  left join enderecos ende    on ende.codigodacidade = ct.cidade and ende.codigodologradouro = ct.enderecoconexao
where ct.codigodocliente = {codigo}
  and ct.cidade = {codcidade}
order by (ct.situacao = 2) desc, ct.d_datadavenda desc nulls last
""".format(codigo=int(codigo), codcidade=int(codcidade))


def sql_ordens_cliente(codigo, codcidade) -> str:
    # Mesmas colunas e formatos do SQL_PENDENTE: as linhas alimentam enrichRows
    # e o OSDrawer no frontend, que esperam exatamente esse contrato.
    return _com_cidades("""
select
  cart.descricao                                                       as empresa,
  coalesce(nullif(trim(cli.nome),''), o.nomecliente, '')               as nomecliente,
  o.numos,
  l.descricaodoserv_lanc                                               as servico,
  ts.descricao                                                         as tiposervico,
  o.codigocontrato,
  o.codigoassinante                                                    as codigocliente,
  case t.nome
    __CIDADES_CASE__
    else t.nome
  end                                                                  as nomedacidade,
  coalesce(ende.tipodologradouro || ' ' || ende.nomelogradouro, '')    as logradouro,
  ct.numeroconexao                                                     as numero,
  ct.complementoconexao                                                as complemento,
  coalesce(ct.bairroconexao::text, cli.bairroresidencial::text)        as bairro,
  case
    when o.d_databaixa is not null and o.situacao != 3 then 'Concluída/Sem Execução'
    when o.situacao = 1 then 'Pendente'
    when o.situacao = 2 and o.d_dataexecucao is not null then 'Atendimento/Finalizadas'
    when o.situacao = 2 then 'Atendimento'
    when o.situacao = 3 and o.d_dataexecucao is null then 'Concluída/Sem Execução'
    when o.situacao = 3 then 'Concluída'
  end                                                                  as descsituacao,
  eq.nomedaequipe,
  eqe.nomedaequipe                                                     as equipeexecutou,
  to_char(o.d_datacadastro,    'DD/MM/YYYY HH24:MI')                   as datacadastro,
  to_char(o.d_dataatendimento, 'DD/MM/YYYY')                           as dataatendimento,
  to_char(o.d_dataagendamento, 'DD/MM/YYYY')                           as dataagendamento,
  case when o.t_horainicial is not null
       then to_char(o.d_datainicio,   'DD/MM/YYYY') || ' ' || to_char(o.t_horainicial, 'HH24:MI')
       else to_char(o.d_datainicio,   'DD/MM/YYYY') end                as datainicio,
  case when o.t_horafinal is not null
       then to_char(o.d_dataexecucao, 'DD/MM/YYYY') || ' ' || to_char(o.t_horafinal, 'HH24:MI')
       else to_char(o.d_dataexecucao, 'DD/MM/YYYY') end                as dataexecucao,
  case when o.t_horabaixa is not null
       then to_char(o.d_databaixa,    'DD/MM/YYYY') || ' ' || to_char(o.t_horabaixa, 'HH24:MI')
       else to_char(o.d_databaixa,    'DD/MM/YYYY') end                as databaixa,
  coalesce(o.periodo, '')                                              as periodo,
  coalesce(o.observacoes, '')                                          as observacoes,
  coalesce(o.observacaocritica, '')                                    as observacaocritica,
  o.recorrencia,
  coalesce(o.nomeexecutante, '')                                       as nomeexecutante,
  coalesce(o.atendente, '')                                            as atendente,
  coalesce(o.latitudeinicio, '')                                       as latitude,
  coalesce(o.longitudeinicio, '')                                      as longitude
from ordemservico o
  left join contratos ct  on ct.cidade = o.cidade and ct.codempresa = o.codempresa and ct.contrato = o.codigocontrato
  left join clientes cli  on cli.codigocliente = o.codigoassinante and cli.cidade = o.cidade
  left join equipe eq     on eq.codigodaequipe  = o.equipe         and eq.codigocidade  = o.cidade
  left join equipe eqe    on eqe.codigodaequipe = o.equipeexecutou and eqe.codigocidade = o.cidade
  left join lanceservicos l  on l.codigodoserv_lanc = o.codservsolicitado
  left join tiposervico  ts  on l.codigotiposervico = ts.codigo
  left join tablocal     t   on o.cidade = t.codigo
  left join carteiracidade cc on cc.codigocarteira = ct.codcarteira and cc.codigocidade = o.cidade
  left join carteira cart    on cart.codigo = cc.codigocarteira
  left join enderecos ende   on ende.codigodacidade = ct.cidade and ende.codigodologradouro = ct.enderecoconexao
where o.codigoassinante = {codigo}
  and o.cidade = {codcidade}
order by o.d_datacadastro desc, o.numos desc
limit {limite}
""", indent=4).format(codigo=int(codigo), codcidade=int(codcidade), limite=LIMITE_OS)


def sql_auditoria_cliente(codigo, codcidade) -> str:
    """Reagendamentos e trocas de equipe por OS, reconstruídos da auditoria.

    aud_ordemservico tem 12 mi de linhas e só é indexada por `id` (o id interno
    da OS, não o numos). Filtrar por numos faz seq scan e estoura os 30 s do
    Grafana; por isso as OS do cliente são resolvidas antes, pelo id."""
    return """
with os as (
  select id, numos from ordemservico
  where codigoassinante = {codigo} and cidade = {codcidade}
  order by d_datacadastro desc limit {limite}
),
h as (
  select a.id, a.d_dataagendamento, a.equipe,
         lag(a.d_dataagendamento) over w as ant_data,
         lag(a.equipe)            over w as ant_equipe
  from auditoria.aud_ordemservico a
  where a.id in (select id from os)
  window w as (partition by a.id order by a.dataaud, a.idaud)
)
select os.numos,
  count(*) filter (where h.ant_data   is not null and h.d_dataagendamento is distinct from h.ant_data) as reagendamentos,
  count(*) filter (where h.ant_equipe is not null and h.equipe is distinct from h.ant_equipe)          as trocas_equipe
from h join os on os.id = h.id
group by os.numos
""".format(codigo=int(codigo), codcidade=int(codcidade), limite=LIMITE_OS)


# A ficha de venda (observacao do contrato) traz "PLANO CONTRATADO" em ~54%
# dos contratos ativos do Vale — é a única fonte de plano enquanto a
# tabela de programação não for liberada. Formatos reais vistos:
#   PLANO CONTRATADO: 600 MB 99,90
#   PLANO CONTRATADO: 400 MEGAS POR 89.90
#   PLANO CONTRATADO (60MB MEGA FIBRA) 79,90
#   PLANO CONTRATADO: (CABONNET 600/300 M, AS 3 PRIMEIRAS MENSALIDADES R$ 59,90/MÊS, APÓS R$99,90/MÊS, ...)
_RE_LINHA_PLANO = re.compile(r"plano\s+contratado\s*:?\s*(.+)", re.I)
_RE_VELOCIDADE = re.compile(r"(\d{2,4})\s*(?:/\s*\d{2,4}\s*)?(?:MBPS|MB|MEGAS?|M)\b", re.I)
_RE_VALOR = re.compile(r"(\d{2,3})[.,](\d{1,2})(?!\d)")
_RE_FIDELIDADE = re.compile(
    r"fidelidade\D{0,30}?(\d{1,2})\s*mes|(\d{1,2})\s*mes(?:es)?\s+de\s+fidelidade", re.I)


def extrair_plano(observacao: str) -> dict | None:
    """Plano, valor e fidelidade a partir do texto livre da ficha de venda."""
    texto = observacao or ""
    m = _RE_LINHA_PLANO.search(texto)
    if not m:
        return None
    linha = " ".join(m.group(1).replace("(", " ").replace(")", " ").split()).strip(" :")
    vel = _RE_VELOCIDADE.search(linha)
    # Preço cheio: o que vem depois de "APÓS" ("3 PRIMEIRAS R$ 59,90, APÓS R$99,90");
    # senão o primeiro da linha — os seguintes costumam ser o desconto
    # ("79,90 (10,00 DE DESCONTO", "79,90 COM DESCONTO DE 50% ... 39,95").
    apos = re.search(r"ap[óo]s", linha, re.I)
    valores = _RE_VALOR.findall(linha[apos.end():] if apos else linha) or _RE_VALOR.findall(linha)
    fid = _RE_FIDELIDADE.search(texto)
    return {
        "descricao":        linha[:160],
        "velocidade_mb":    int(vel.group(1)) if vel else None,
        "valor":            float("{}.{}".format(*valores[0])) if valores else None,
        "promocional":      bool(re.search(r"desconto|primeiras", linha, re.I)),
        "fidelidade_meses": int(fid.group(1) or fid.group(2)) if fid else None,
    }


def _flag(v) -> bool:
    # vip / bloqueio_juridico: 1 = sim, 2 = não (84 mil clientes com 2, 59 com 1).
    try:
        return int(v) == 1
    except (TypeError, ValueError):
        return False


def _num_ou_none(v):
    if v in ("", None):
        return None
    try:
        return float(v) if isinstance(v, str) else v
    except ValueError:
        return None


def _obs_propria(obs_contrato, obs_cliente: str) -> str:
    texto = (obs_contrato or "").strip()
    return "" if texto == obs_cliente else texto


def montar_busca(rows: list[dict]) -> list[dict]:
    itens = []
    for r in rows:
        doc, tipo = mascarar_documento(r.get("cpf_cnpj"))
        itens.append({
            "codigocliente":    str(r.get("codigocliente", "")),
            "nome":             r.get("nome") or r.get("nomefantasia") or "",
            "nomefantasia":     r.get("nomefantasia") or "",
            "documento":        doc,
            "tipopessoa":       tipo,
            "bairro":           r.get("bairro") or "",
            "nomedacidade":     r.get("nomedacidade") or "",
            "contratos":        int(r.get("contratos") or 0),
            "contratos_ativos": int(r.get("contratos_ativos") or 0),
        })
    return itens


def montar_cliente(cli: dict, contratos: list[dict], ordens: list[dict],
                   auditoria: list[dict] | None = None) -> dict:
    doc, tipo = mascarar_documento(cli.get("cpf_cnpj"))
    obs_cliente = (cli.get("observacao") or "").strip()
    aud = {str(a.get("numos")): a for a in (auditoria or [])}

    def _ordem(o: dict) -> dict:
        row = {k: ("" if v is None else str(v)) for k, v in o.items()}
        if auditoria is not None:
            a = aud.get(row.get("numos", "")) or {}
            row["reagendamentos"] = str(int(a.get("reagendamentos") or 0))
            row["trocas_equipe"]  = str(int(a.get("trocas_equipe") or 0))
        return row

    return {
        "cliente": {
            "codigocliente":     str(cli.get("codigocliente", "")),
            "nome":              cli.get("nome") or "",
            "nome_social":       cli.get("nome_social") or "",
            "nomefantasia":      cli.get("nomefantasia") or "",
            "documento":         doc,
            "tipopessoa":        tipo,
            "email":             (cli.get("email") or "").strip(),
            "endereco": {
                "logradouro":    cli.get("logradouro") or "",
                "numero":        cli.get("numero") or "",
                "complemento":   cli.get("complemento") or "",
                "bairro":        cli.get("bairro") or "",
                "cep":           cli.get("cep") or "",
                "cidade":        cli.get("nomedacidade") or "",
            },
            "cliente_desde":     cli.get("cliente_desde") or None,
            "atualizado_em":     cli.get("atualizado_em") or None,
            "dia_vencimento":    _num_ou_none(cli.get("dia_vencimento")),
            "vip":               _flag(cli.get("vip")),
            "bloqueio_juridico": _flag(cli.get("bloqueio_juridico")),
            "observacao":        cli.get("observacao") or "",
        },
        "contratos": [{
            "contrato":             str(c.get("contrato", "")),
            "situacao":             _num_ou_none(c.get("situacao")),
            "situacaoanterior":     _num_ou_none(c.get("situacaoanterior")),
            "datasituacaoanterior": c.get("datasituacaoanterior") or None,
            "valor":                _num_ou_none(c.get("valor")),
            "datavenda":            c.get("datavenda") or None,
            "datainstalacao":       c.get("datainstalacao") or None,
            "empresa":              c.get("empresa") or "",
            "apelido":              c.get("apelido") or "",
            "pontoreferencia":      (c.get("pontoreferencia") or "").strip(),
            "iniciopromocao":       c.get("iniciopromocao") or None,
            "plano":                extrair_plano(c.get("observacao") or obs_cliente),
            # só quando difere da ficha do cliente — em 84% dos casos é a mesma
            "observacao":           _obs_propria(c.get("observacao"), obs_cliente),
            "endereco": {
                "logradouro":  c.get("logradouro") or "",
                "numero":      c.get("numero") or "",
                "complemento": c.get("complemento") or "",
                "bairro":      c.get("bairro") or "",
                "cep":         c.get("cep") or "",
            },
        } for c in contratos],
        "ordens":           [_ordem(o) for o in ordens],
        "ordens_truncadas": len(ordens) >= LIMITE_OS,
        "auditoria_ok":     auditoria is not None,
    }
