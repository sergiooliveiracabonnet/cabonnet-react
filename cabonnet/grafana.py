# -*- coding: utf-8 -*-
"""
cabonnet/grafana.py — Proxy Grafana: SQL templates, HTTP post, frames_to_csv/dict.
"""

import logging
import threading
from datetime import datetime

import requests

from cabonnet.config import (
    CONFIG, GRAFANA_URL, USERNAME, PASSWORD, DS_UID,
    _ATE_ATENDENTES, _ATE_CACHE_TTL,
)

log = logging.getLogger("CaboNetServer")


# ══════════════════════════════════════════════════════════════════════════════
#  SQL — PENDENTE
# ══════════════════════════════════════════════════════════════════════════════
SQL_PENDENTE = """
with analitico as (
  select
  cart.descricao as empresa,
  coalesce(nullif(trim(cli.nome),''), o.nomecliente, '') as nomecliente,
  o.numos,
  l.descricaodoserv_lanc as servico,
  ts.descricao as tiposervico,
  o.codigocontrato,
  o.codigoassinante as codigocliente,
  c.nomedacidade,
  coalesce(ende.tipodologradouro || ' ' || ende.nomelogradouro, '') as logradouro,
  ct.numeroconexao as numero,
  ct.complementoconexao as complemento,
  coalesce(ct.bairroconexao::text, cli.bairroresidencial::text) as bairro,
  o.situacao,
  case
    when o.d_databaixa is not null and o.situacao != 3 then 'Concluída/Sem Execução'
    when o.situacao = 1 then 'Pendente'
    when o.situacao = 2 and o.d_dataexecucao is not null then 'Atendimento/Finalizadas'
    when o.situacao = 2 then 'Atendimento'
    when o.situacao = 3 and o.d_dataexecucao is null then 'Concluída/Sem Execução'
    when o.situacao = 3 then 'Concluída'
  end as descsituacao,
  o.equipe,
  eq.nomedaequipe,
  eqe.nomedaequipe as equipeexecutou,
  to_char(o.d_datacadastro,    'DD/MM/YYYY') as datacadastro,
  to_char(o.d_dataatendimento, 'DD/MM/YYYY') as dataatendimento,
  to_char(o.d_dataagendamento, 'DD/MM/YYYY') as dataagendamento,
  case when o.t_horainicial is not null
       then to_char(o.d_datainicio,   'DD/MM/YYYY') || ' ' || to_char(o.t_horainicial, 'HH24:MI')
       else to_char(o.d_datainicio,   'DD/MM/YYYY') end as datainicio,
  case when o.t_horafinal is not null
       then to_char(o.d_dataexecucao, 'DD/MM/YYYY') || ' ' || to_char(o.t_horafinal, 'HH24:MI')
       else to_char(o.d_dataexecucao, 'DD/MM/YYYY') end as dataexecucao,
  case when o.t_horabaixa is not null
       then to_char(o.d_databaixa,    'DD/MM/YYYY') || ' ' || to_char(o.t_horabaixa, 'HH24:MI')
       else to_char(o.d_databaixa,    'DD/MM/YYYY') end as databaixa,
  coalesce(o.periodo, '') as periodo,
  case when o.t_horaatendimento is not null
       then to_char(o.t_horaatendimento, 'HH24:MI') else '' end as horaatendimento,
  coalesce(o.observacoes, '') as observacoes,
  coalesce(o.observacaocritica, '') as observacaocritica
  from ordemservico o
    join contratos ct on ct.cidade = o.cidade and ct.codempresa = o.codempresa and ct.contrato = o.codigocontrato
  left join enderecos ende on ende.codigodacidade = ct.cidade and ende.codigodologradouro = ct.enderecoconexao
        join clientes cli on cli.codigocliente = o.codigoassinante and cli.cidade = o.cidade
  left join cidade c on c.codigodacidade = o.cidade
  left join equipe eq  on eq.codigodaequipe  = o.equipe         and eq.codigocidade  = o.cidade
  left join equipe eqe on eqe.codigodaequipe = o.equipeexecutou and eqe.codigocidade = o.cidade
  left join lanceservicos l on l.codigodoserv_lanc = o.codservsolicitado
  left join tiposervico ts on l.codigotiposervico = ts.codigo
  left join tablocal t on o.cidade = t.codigo
  left join carteiracidade cc on cc.codigocarteira = ct.codcarteira and cc.codigocidade = o.cidade
  left join carteira cart on cart.codigo = cc.codigocarteira
  left join empresas e on e.codempresa = ct.codempresa and e.codcidade = t.codigo
  where
  case when t.estado is null then 'N/A' else t.estado end in ('SP') and
  case when t.nome is null then 'N/A' else t.nome end in ('TAUBATE','TREMEMBE','SAO JOSE DOS CAMPOS','PINDAMONHANGABA','CACAPAVA')
  and o.d_datacadastro >= '2025-11-01'
)
select * from analitico a where descsituacao = 'Pendente'
  and upper(coalesce(a.nomedaequipe,'')) not in (
    'ESTOQUE','COPE - RETIRADA','ATENDIMENTO','REGUA DE COBRANCA','MIGRADO'
  )
  and upper(coalesce(a.servico,'')) not like '%INADIMPLENCIA%'
  and upper(coalesce(a.servico,'')) not like '%RECONEXAO AUTOMATICA%'
  and upper(coalesce(a.servico,'')) not like '%LIBERACAO DE CONFIANCA%'
  and upper(coalesce(a.servico,'')) not like '%ALTERACAO DE PROGRAMACAO%'
  and upper(coalesce(a.servico,'')) not like '%REGUA DE CONFIANCA%'
  and upper(coalesce(a.servico,'')) not like '%RETIRADA DE EQUIPAMENTO%'
  and upper(coalesce(a.servico,'')) not like '%CONTRATO - UPGRADE%'
order by datacadastro desc
"""

# ══════════════════════════════════════════════════════════════════════════════
#  SQL — AGENDADO
# ══════════════════════════════════════════════════════════════════════════════
SQL_AGENDADO = """
with analitico as (
  select
  cart.descricao as empresa,
  coalesce(nullif(trim(cli.nome),''), o.nomecliente, '') as nomecliente,
  o.numos,
  l.descricaodoserv_lanc as servico,
  ts.descricao as tiposervico,
  o.codigocontrato,
  o.codigoassinante as codigocliente,
  c.nomedacidade,
  coalesce(ende.tipodologradouro || ' ' || ende.nomelogradouro, '') as logradouro,
  ct.numeroconexao as numero,
  ct.complementoconexao as complemento,
  coalesce(ct.bairroconexao::text, cli.bairroresidencial::text) as bairro,
  o.situacao,
  case
    when o.d_databaixa is not null and o.situacao != 3 then 'Concluída/Sem Execução'
    when o.situacao = 1 then 'Pendente'
    when o.situacao = 2 and o.d_dataexecucao is not null then 'Atendimento/Finalizadas'
    when o.situacao = 2 then 'Atendimento'
    when o.situacao = 3 and o.d_dataexecucao is null then 'Concluída/Sem Execução'
    when o.situacao = 3 then 'Concluída'
  end as descsituacao,
  o.equipe,
  eq.nomedaequipe,
  eqe.nomedaequipe as equipeexecutou,
  to_char(o.d_datacadastro,    'DD/MM/YYYY') as datacadastro,
  to_char(o.d_dataatendimento, 'DD/MM/YYYY') as dataatendimento,
  to_char(o.d_dataagendamento, 'DD/MM/YYYY') as dataagendamento,
  case when o.t_horainicial is not null
       then to_char(o.d_datainicio,   'DD/MM/YYYY') || ' ' || to_char(o.t_horainicial, 'HH24:MI')
       else to_char(o.d_datainicio,   'DD/MM/YYYY') end as datainicio,
  case when o.t_horafinal is not null
       then to_char(o.d_dataexecucao, 'DD/MM/YYYY') || ' ' || to_char(o.t_horafinal, 'HH24:MI')
       else to_char(o.d_dataexecucao, 'DD/MM/YYYY') end as dataexecucao,
  case when o.t_horabaixa is not null
       then to_char(o.d_databaixa,    'DD/MM/YYYY') || ' ' || to_char(o.t_horabaixa, 'HH24:MI')
       else to_char(o.d_databaixa,    'DD/MM/YYYY') end as databaixa,
  coalesce(o.periodo, '') as periodo,
  case when o.t_horaatendimento is not null
       then to_char(o.t_horaatendimento, 'HH24:MI') else '' end as horaatendimento,
  coalesce(o.observacoes, '') as observacoes,
  coalesce(o.observacaocritica, '') as observacaocritica
  from ordemservico o
    join contratos ct on ct.cidade = o.cidade and ct.codempresa = o.codempresa and ct.contrato = o.codigocontrato
  left join enderecos ende on ende.codigodacidade = ct.cidade and ende.codigodologradouro = ct.enderecoconexao
        join clientes cli on cli.codigocliente = o.codigoassinante and cli.cidade = o.cidade
  left join cidade c on c.codigodacidade = o.cidade
  left join equipe eq  on eq.codigodaequipe  = o.equipe         and eq.codigocidade  = o.cidade
  left join equipe eqe on eqe.codigodaequipe = o.equipeexecutou and eqe.codigocidade = o.cidade
  left join lanceservicos l on l.codigodoserv_lanc = o.codservsolicitado
  left join tiposervico ts on l.codigotiposervico = ts.codigo
  left join tablocal t on o.cidade = t.codigo
  left join carteiracidade cc on cc.codigocarteira = ct.codcarteira and cc.codigocidade = o.cidade
  left join carteira cart on cart.codigo = cc.codigocarteira
  left join empresas e on e.codempresa = ct.codempresa and e.codcidade = t.codigo
  where
  case when t.estado is null then 'N/A' else t.estado end in ('SP') and
  case when t.nome is null then 'N/A' else t.nome end in ('TAUBATE','TREMEMBE','SAO JOSE DOS CAMPOS','PINDAMONHANGABA','CACAPAVA')
  and o.d_datacadastro >= '2025-11-01'
)
select * from analitico a
  where upper(coalesce(a.nomedaequipe,'')) not in (
    'ESTOQUE','COPE - RETIRADA','ATENDIMENTO','REGUA DE COBRANCA','MIGRADO'
  )
  and upper(coalesce(a.servico,'')) not like '%INADIMPLENCIA%'
  and upper(coalesce(a.servico,'')) not like '%RECONEXAO AUTOMATICA%'
  and upper(coalesce(a.servico,'')) not like '%LIBERACAO DE CONFIANCA%'
  and upper(coalesce(a.servico,'')) not like '%ALTERACAO DE PROGRAMACAO%'
  and upper(coalesce(a.servico,'')) not like '%REGUA DE CONFIANCA%'
  and upper(coalesce(a.servico,'')) not like '%RETIRADA DE EQUIPAMENTO%'
  and upper(coalesce(a.servico,'')) not like '%CONTRATO - UPGRADE%'
order by dataagendamento asc
"""

# ══════════════════════════════════════════════════════════════════════════════
#  SQL — FUTURO
# ══════════════════════════════════════════════════════════════════════════════
SQL_FUTURO = """
with analitico as (
  select
  cart.descricao as empresa,
  coalesce(nullif(trim(cli.nome),''), o.nomecliente, '') as nomecliente,
  o.numos,
  l.descricaodoserv_lanc as servico,
  ts.descricao as tiposervico,
  o.codigocontrato,
  o.codigoassinante as codigocliente,
  c.nomedacidade,
  coalesce(ende.tipodologradouro || ' ' || ende.nomelogradouro, '') as logradouro,
  ct.numeroconexao as numero,
  ct.complementoconexao as complemento,
  coalesce(ct.bairroconexao::text, cli.bairroresidencial::text) as bairro,
  o.situacao,
  case
    when o.d_databaixa is not null and o.situacao != 3 then 'Concluída/Sem Execução'
    when o.situacao = 1 then 'Pendente'
    when o.situacao = 2 and o.d_dataexecucao is not null then 'Atendimento/Finalizadas'
    when o.situacao = 2 then 'Atendimento'
    when o.situacao = 3 and o.d_dataexecucao is null then 'Concluída/Sem Execução'
    when o.situacao = 3 then 'Concluída'
  end as descsituacao,
  o.equipe,
  eq.nomedaequipe,
  eqe.nomedaequipe as equipeexecutou,
  to_char(o.d_datacadastro,    'DD/MM/YYYY') as datacadastro,
  to_char(o.d_dataatendimento, 'DD/MM/YYYY') as dataatendimento,
  to_char(o.d_dataagendamento, 'DD/MM/YYYY') as dataagendamento,
  case when o.t_horainicial is not null
       then to_char(o.d_datainicio,   'DD/MM/YYYY') || ' ' || to_char(o.t_horainicial, 'HH24:MI')
       else to_char(o.d_datainicio,   'DD/MM/YYYY') end as datainicio,
  case when o.t_horafinal is not null
       then to_char(o.d_dataexecucao, 'DD/MM/YYYY') || ' ' || to_char(o.t_horafinal, 'HH24:MI')
       else to_char(o.d_dataexecucao, 'DD/MM/YYYY') end as dataexecucao,
  case when o.t_horabaixa is not null
       then to_char(o.d_databaixa,    'DD/MM/YYYY') || ' ' || to_char(o.t_horabaixa, 'HH24:MI')
       else to_char(o.d_databaixa,    'DD/MM/YYYY') end as databaixa,
  coalesce(o.periodo, '') as periodo,
  case when o.t_horaatendimento is not null
       then to_char(o.t_horaatendimento, 'HH24:MI') else '' end as horaatendimento
  from ordemservico o
    join contratos ct on ct.cidade = o.cidade and ct.codempresa = o.codempresa and ct.contrato = o.codigocontrato
  left join enderecos ende on ende.codigodacidade = ct.cidade and ende.codigodologradouro = ct.enderecoconexao
        join clientes cli on cli.codigocliente = o.codigoassinante and cli.cidade = o.cidade
  left join cidade c on c.codigodacidade = o.cidade
  left join equipe eq  on eq.codigodaequipe  = o.equipe         and eq.codigocidade  = o.cidade
  left join equipe eqe on eqe.codigodaequipe = o.equipeexecutou and eqe.codigocidade = o.cidade
  left join lanceservicos l on l.codigodoserv_lanc = o.codservsolicitado
  left join tiposervico ts on l.codigotiposervico = ts.codigo
  left join tablocal t on o.cidade = t.codigo
  left join carteiracidade cc on cc.codigocarteira = ct.codcarteira and cc.codigocidade = o.cidade
  left join carteira cart on cart.codigo = cc.codigocarteira
  left join empresas e on e.codempresa = ct.codempresa and e.codcidade = t.codigo
  where
  o.situacao = 2
  and o.d_dataagendamento > current_date
  and case when t.estado is null then 'N/A' else t.estado end in ('SP')
  and case when t.nome is null then 'N/A' else t.nome end in ('TAUBATE','TREMEMBE','SAO JOSE DOS CAMPOS','PINDAMONHANGABA','CACAPAVA')
)
select * from analitico a
  where upper(coalesce(a.nomedaequipe,'')) not in (
    'ESTOQUE','COPE - RETIRADA','ATENDIMENTO','REGUA DE COBRANCA','MIGRADO'
  )
  and upper(coalesce(a.servico,'')) not like '%INADIMPLENCIA%'
  and upper(coalesce(a.servico,'')) not like '%RECONEXAO AUTOMATICA%'
  and upper(coalesce(a.servico,'')) not like '%LIBERACAO DE CONFIANCA%'
  and upper(coalesce(a.servico,'')) not like '%ALTERACAO DE PROGRAMACAO%'
  and upper(coalesce(a.servico,'')) not like '%REGUA DE CONFIANCA%'
  and upper(coalesce(a.servico,'')) not like '%RETIRADA DE EQUIPAMENTO%'
  and upper(coalesce(a.servico,'')) not like '%CONTRATO - UPGRADE%'
order by dataagendamento asc
"""

# ══════════════════════════════════════════════════════════════════════════════
#  SQL — REVISITAS
# ══════════════════════════════════════════════════════════════════════════════
SQL_REVISITAS = """
with analitico as (
  select
  cart.descricao as empresa,
  coalesce(nullif(trim(cli.nome),''), o.nomecliente, '') as nomecliente,
  o.numos,
  l.descricaodoserv_lanc as servico,
  ts.descricao as tiposervico,
  o.codigocontrato,
  o.codigoassinante as codigocliente,
  c.nomedacidade,
  o.situacao,
  'Concluída' as descsituacao,
  o.equipe,
  eq.nomedaequipe,
  eqe.nomedaequipe as equipeexecutou,
  to_char(o.d_datacadastro,    'DD/MM/YYYY') as datacadastro,
  to_char(o.d_dataagendamento, 'DD/MM/YYYY') as dataagendamento,
  case when o.t_horafinal is not null
       then to_char(o.d_dataexecucao, 'DD/MM/YYYY') || ' ' || to_char(o.t_horafinal, 'HH24:MI')
       else to_char(o.d_dataexecucao, 'DD/MM/YYYY') end as dataexecucao,
  case when o.t_horabaixa is not null
       then to_char(o.d_databaixa,    'DD/MM/YYYY') || ' ' || to_char(o.t_horabaixa, 'HH24:MI')
       else to_char(o.d_databaixa,    'DD/MM/YYYY') end as databaixa
  from ordemservico o
    join contratos ct on ct.cidade = o.cidade and ct.codempresa = o.codempresa and ct.contrato = o.codigocontrato
    join clientes cli on cli.codigocliente = o.codigoassinante and cli.cidade = o.cidade
  left join cidade c on c.codigodacidade = o.cidade
  left join equipe eq  on eq.codigodaequipe  = o.equipe         and eq.codigocidade  = o.cidade
  left join equipe eqe on eqe.codigodaequipe = o.equipeexecutou and eqe.codigocidade = o.cidade
  left join lanceservicos l on l.codigodoserv_lanc = o.codservsolicitado
  left join tiposervico ts on l.codigotiposervico = ts.codigo
  left join tablocal t on o.cidade = t.codigo
  left join carteiracidade cc on cc.codigocarteira = ct.codcarteira and cc.codigocidade = o.cidade
  left join carteira cart on cart.codigo = cc.codigocarteira
  where
  o.situacao = 3
  and o.d_dataexecucao is not null
  and o.d_dataexecucao >= date_trunc('month', current_date - interval '2 months')
  and case when t.estado is null then 'N/A' else t.estado end in ('SP')
  and case when t.nome is null then 'N/A' else t.nome end in ('TAUBATE','TREMEMBE','SAO JOSE DOS CAMPOS','PINDAMONHANGABA','CACAPAVA')
)
select * from analitico a
  where upper(coalesce(a.nomedaequipe,'')) not in (
    'ESTOQUE','COPE - RETIRADA','ATENDIMENTO','REGUA DE COBRANCA','MIGRADO'
  )
  and upper(coalesce(a.servico,'')) not like '%INADIMPLENCIA%'
  and upper(coalesce(a.servico,'')) not like '%RECONEXAO AUTOMATICA%'
  and upper(coalesce(a.servico,'')) not like '%LIBERACAO DE CONFIANCA%'
  and upper(coalesce(a.servico,'')) not like '%ALTERACAO DE PROGRAMACAO%'
  and upper(coalesce(a.servico,'')) not like '%REGUA DE CONFIANCA%'
  and upper(coalesce(a.servico,'')) not like '%RETIRADA DE EQUIPAMENTO%'
  and upper(coalesce(a.servico,'')) not like '%CONTRATO - UPGRADE%'
order by dataexecucao desc
"""

# ══════════════════════════════════════════════════════════════════════════════
#  SQL — DETALHES (busca completa por numos)
# ══════════════════════════════════════════════════════════════════════════════
SQL_DETALHES_TEMPLATE = """
SELECT
  cart.descricao                                                     as empresa,
  coalesce(nullif(trim(cli.nome),''), o.nomecliente, '')             as nomecliente,
  o.numos,
  o.codigocontrato,
  o.codigoassinante                                                  as codigocliente,
  l.descricaodoserv_lanc                                             as servico,
  ts.descricao                                                       as tiposervico,
  c.nomedacidade,
  coalesce(ende.tipodologradouro || ' ' || ende.nomelogradouro, '')  as logradouro,
  ct.numeroconexao                                                   as numero,
  ct.complementoconexao                                              as complemento,
  coalesce(ct.bairroconexao::text, cli.bairroresidencial::text)      as bairro,
  ct.cepconexao                                                      as cep,
  case
    when o.situacao = 1 then 'Pendente'
    when o.situacao = 2 and o.d_dataexecucao is not null then 'Atendimento/Finalizadas'
    when o.situacao = 2 then 'Atendimento'
    when o.situacao = 3 and o.d_dataexecucao is null then 'Concluída/Sem Execução'
    when o.situacao = 3 then 'Concluída'
  end                                                                as descsituacao,
  eq.nomedaequipe,
  eqe.nomedaequipe                                                   as equipeexecutou,
  to_char(o.d_datacadastro,    'DD/MM/YYYY') as datacadastro,
  to_char(o.d_dataatendimento, 'DD/MM/YYYY') as dataatendimento,
  to_char(o.d_dataagendamento, 'DD/MM/YYYY') as dataagendamento,
  case when o.t_horainicial is not null
       then to_char(o.d_datainicio,   'DD/MM/YYYY') || ' ' || to_char(o.t_horainicial, 'HH24:MI')
       else to_char(o.d_datainicio,   'DD/MM/YYYY') end as datainicio,
  case when o.t_horafinal is not null
       then to_char(o.d_dataexecucao, 'DD/MM/YYYY') || ' ' || to_char(o.t_horafinal, 'HH24:MI')
       else to_char(o.d_dataexecucao, 'DD/MM/YYYY') end as dataexecucao,
  case when o.t_horabaixa is not null
       then to_char(o.d_databaixa,    'DD/MM/YYYY') || ' ' || to_char(o.t_horabaixa, 'HH24:MI')
       else to_char(o.d_databaixa,    'DD/MM/YYYY') end as databaixa,
  coalesce(o.periodo, '')                                                as periodo,
  case when o.t_horaatendimento is not null
       then to_char(o.t_horaatendimento, 'HH24:MI') else '' end         as horaatendimento,
  coalesce(o.observacoes, '')                                            as observacoes,
  coalesce(o.observacaocritica, '')                                      as observacaocritica
FROM ordemservico o
  JOIN contratos ct  ON ct.cidade = o.cidade AND ct.codempresa = o.codempresa AND ct.contrato = o.codigocontrato
  JOIN clientes  cli ON cli.codigocliente = o.codigoassinante AND cli.cidade = o.cidade
  LEFT JOIN cidade c    ON c.codigodacidade = o.cidade
  LEFT JOIN equipe eq   ON eq.codigodaequipe  = o.equipe         AND eq.codigocidade  = o.cidade
  LEFT JOIN equipe eqe  ON eqe.codigodaequipe = o.equipeexecutou AND eqe.codigocidade = o.cidade
  LEFT JOIN lanceservicos l  ON l.codigodoserv_lanc = o.codservsolicitado
  LEFT JOIN tiposervico  ts  ON l.codigotiposervico = ts.codigo
  LEFT JOIN tablocal     t   ON o.cidade = t.codigo
  LEFT JOIN carteiracidade cc ON cc.codigocarteira = ct.codcarteira AND cc.codigocidade = o.cidade
  LEFT JOIN carteira cart    ON cart.codigo = cc.codigocarteira
  LEFT JOIN enderecos ende   ON ende.codigodacidade = ct.cidade AND ende.codigodologradouro = ct.enderecoconexao
WHERE o.numos = {numos}
LIMIT 1
"""

SQL_DIAG_TEMPLATE = """
SELECT
  current_setting('TimeZone')                                        as db_timezone,
  to_char(now(), 'DD/MM/YYYY HH24:MI:SS')                           as agora_db,
  to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI:SS') as agora_brasilia,
  to_char(o.d_datacadastro, 'DD/MM/YYYY HH24:MI:SS')                as cadastro_bruto,
  to_char(o.d_dataagendamento, 'DD/MM/YYYY HH24:MI:SS')             as agendamento_bruto,
  to_char(o.d_datacadastro AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI:SS') as cadastro_tz,
  to_char(o.d_dataagendamento AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI:SS') as agendamento_tz,
  extract(epoch from o.d_datacadastro)::bigint                      as cadastro_epoch,
  pg_typeof(o.d_datacadastro)::text                                 as tipo_coluna
FROM ordemservico o
WHERE o.numos = {numos}
LIMIT 1
"""

SQL_OCORRENCIAS_TEMPLATE = """
SELECT oc.*
FROM mobile.vis_os_ocorrencias oc
WHERE oc.idos IN (SELECT id FROM public.ordemservico WHERE numos = {numos})
ORDER BY oc.id
"""

SQL_EQUIPE_REAGENDOU_TEMPLATE = """
SELECT oc.descricao
FROM mobile.vis_os_ocorrencias oc
WHERE oc.idos IN (SELECT id FROM public.ordemservico WHERE numos = {numos})
ORDER BY oc.id DESC
LIMIT 1
"""

SQL_MATERIAIS_UTILIZADOS_TEMPLATE = """
SELECT material, identificadorunico, quantidade
FROM mobile.vis_os_materiais_utilizados
WHERE numos = {numos}
ORDER BY id
"""

SQL_MATERIAIS_RETIRADOS_TEMPLATE = """
SELECT material, identificadorunico, quantidade
FROM mobile.vis_os_materiais_retirados
WHERE numos = {numos}
ORDER BY id
"""

SQL_ATENDIMENTO = """
SELECT
    h.d_data,
    h.atendente,
    c.nomedacidade  AS cidade,
    tc.descricao    AS canal,
    h.assinante     AS codigo_cliente,
    cli.nome        AS nomecliente,
    CASE
        WHEN EXISTS (
            SELECT 1
            FROM public.aditivoscontratos ac
            JOIN public.aditivos ad ON ad.codaditivo = ac.codaditivo
            WHERE ac.numcontrato = h.codcontrato
              AND ac.codcidade   = h.codigocidade
              AND ad.fidelidadedias > 0
              AND (ac.d_datainicio + ad.fidelidadedias) >= h.d_data
        ) THEN 1 ELSE 0
    END AS fidelizado
FROM public.historicogeral h
LEFT JOIN public.cidade        c   ON c.codigodacidade  = h.codigocidade
LEFT JOIN public.tipodecontato tc  ON tc.codigo         = h.codigocontato
LEFT JOIN (SELECT DISTINCT ON (codigocliente) codigocliente, nome FROM public.clientes ORDER BY codigocliente) cli ON cli.codigocliente::text = h.assinante::text
WHERE h.d_data >= '2026-01-01'
  AND h.atendente IN ('{ate}')
  AND h.codigocontato IS NOT NULL
ORDER BY h.d_data ASC
""".format(ate="','".join(_ATE_ATENDENTES))

SQL_ERP_OS_TOTAIS = """
SELECT
  COUNT(DISTINCT o.numos) FILTER (WHERE o.situacao IN ('P','A'))                                        AS pendentes,
  COUNT(DISTINCT o.numos) FILTER (WHERE o.situacao = 'F'
    AND o.datadofechamento >= CURRENT_DATE - INTERVAL '7 days')                                         AS fechados_7d,
  COUNT(DISTINCT o.numos) FILTER (WHERE o.situacao IN ('P','A')
    AND o.databerabertura < CURRENT_TIMESTAMP - INTERVAL '72 hours')                                    AS aging_critico,
  COUNT(DISTINCT o.numos) FILTER (WHERE o.situacao IN ('P','A') AND (o.equipe IS NULL OR o.equipe = 0)) AS sem_equipe
FROM ordemservico o
JOIN lanceservicos l ON l.codigodoserv_lanc = o.codservsolicitado
WHERE l.nomecategoriaservico IN ('INSTALAÇÃO','MANUTENÇÃO','REDE')
  AND o.cidade IN (SELECT codigo FROM tablocal WHERE nomedacidade IN ('São José dos Campos','Caçapava','Taubaté','Tremembé','Pindamonhangaba'))
"""

SQL_ERP_OS_CIDADES = """
SELECT
  tl.nomedacidade                                                                                         AS cidade,
  COUNT(DISTINCT o.numos) FILTER (WHERE o.situacao IN ('P','A'))                                        AS pendentes,
  COUNT(DISTINCT o.numos) FILTER (WHERE o.situacao = 'F'
    AND o.datadofechamento >= CURRENT_DATE - INTERVAL '7 days')                                         AS fechados_7d,
  COUNT(DISTINCT o.numos) FILTER (WHERE o.situacao IN ('P','A')
    AND o.databerabertura < CURRENT_TIMESTAMP - INTERVAL '72 hours')                                    AS aging_critico
FROM ordemservico o
JOIN lanceservicos l ON l.codigodoserv_lanc = o.codservsolicitado
JOIN tablocal tl ON tl.codigo = o.cidade
WHERE l.nomecategoriaservico IN ('INSTALAÇÃO','MANUTENÇÃO','REDE')
  AND tl.nomedacidade IN ('São José dos Campos','Caçapava','Taubaté','Tremembé','Pindamonhangaba')
GROUP BY tl.nomedacidade
ORDER BY pendentes DESC
"""


def grafana_post(sql, ref_id="A"):
    url  = "{}/api/ds/query".format(GRAFANA_URL)
    body = {
        "queries": [{
            "refId":      ref_id,
            "datasource": {"type": "postgres", "uid": DS_UID},
            "rawSql":     sql,
            "format":     "table",
            "rawQuery":   True,
        }],
        "from": "now-60d",
        "to":   "now",
    }
    try:
        resp = requests.post(
            url, json=body,
            auth=(USERNAME, PASSWORD),
            verify=False,
            timeout=CONFIG["timeout_s"],
        )
    except requests.exceptions.ReadTimeout:
        raise RuntimeError("Grafana externo indisponível (timeout após {}s)".format(CONFIG["timeout_s"]))
    except requests.exceptions.ConnectionError as exc:
        raise RuntimeError("Grafana externo inacessível (erro de rede): {}".format(exc))
    if not resp.ok:
        try:
            err = resp.json()
        except Exception:
            err = resp.text[:500]
        log.error("Grafana HTTP %s: %s", resp.status_code, str(err)[:300])
        resp.raise_for_status()
    return resp.json()


def frames_to_csv(json_data, ref_id="A"):
    results = json_data.get("results", {})
    frames  = results.get(ref_id, {}).get("frames", [])
    if not frames:
        frames = json_data.get("data", {}).get("frames", [])
    if not frames:
        return None
    frame  = frames[0]
    fields = frame.get("schema", {}).get("fields", [])
    values = frame.get("data",   {}).get("values",  [])
    if not fields or not values:
        return None
    headers = [f.get("name", "").lower() for f in fields]
    n_rows  = len(values[0]) if values else 0
    lines   = [",".join(headers)]
    for i in range(n_rows):
        row = []
        for col in values:
            v = col[i] if col[i] is not None else ""
            row.append('"{}"'.format(str(v).replace('"', '""')))
        lines.append(",".join(row))
    return "\n".join(lines)


def frames_to_dict_list(json_data, ref_id="A"):
    """Converte resposta Grafana em lista de dicts (sem passar por CSV)."""
    results = json_data.get("results", {})
    frames  = results.get(ref_id, {}).get("frames", [])
    if not frames:
        frames = json_data.get("data", {}).get("frames", [])
    if not frames:
        return []
    frame  = frames[0]
    fields = frame.get("schema", {}).get("fields", [])
    values = frame.get("data",   {}).get("values",  [])
    if not fields or not values:
        return []
    headers = [f.get("name", "").lower() for f in fields]
    n_rows  = len(values[0]) if values else 0
    rows = []
    for i in range(n_rows):
        row = {}
        for j, h in enumerate(headers):
            v = values[j][i] if j < len(values) and i < len(values[j]) else None
            row[h] = v if v is not None else ""
        rows.append(row)
    return rows


def _ate_tipo_canal(canal):
    """Classifica o canal de atendimento em tipo."""
    c = (canal or "").upper()
    if "PRESENCIAL" in c:
        return "Presencial"
    if any(x in c for x in ("WHATSAPP", "HI ", "HSM", "SITE", "WEBSITE", "RECLAME", "CHAT",
                              "FACEBOOK", "INSTAGRAM", "GOOGLE", "REDE SOCIAL", "LEADS")):
        return "Online"
    if any(x in c for x in ("TELEFONE", "CALL CENTER", "ANATEL", "LEUCOTRON", "DISCADORA")):
        return "Telefone"
    return "Outros"


def build_atendimento_json(rows):
    """
    Agrega linhas brutas do SQL_ATENDIMENTO no mesmo formato de atendimento-data.json.
    rows: lista de dicts com chaves: d_data (epoch ms), atendente, cidade, canal, codigo_cliente
    """
    import collections

    if not rows:
        return None

    records = []
    for r in rows:
        ts_ms = r.get("d_data")
        if ts_ms is None:
            continue
        try:
            dt = datetime.utcfromtimestamp(int(ts_ms) / 1000.0)
            data_str = dt.strftime("%Y-%m-%d")
        except Exception:
            continue
        atendente      = (r.get("atendente")   or "").strip().upper()
        cidade         = (r.get("cidade")      or "").strip().upper()
        canal          = (r.get("canal")       or "").strip()
        codigo_cliente = r.get("codigo_cliente") or 0
        nomecliente    = (r.get("nomecliente") or "").strip()[:40]
        if not atendente:
            continue
        records.append({
            "data":           data_str,
            "atendente":      atendente,
            "cidade":         cidade,
            "canal":          canal,
            "tipo":           _ate_tipo_canal(canal),
            "presencial":     1 if _ate_tipo_canal(canal) == "Presencial" else 0,
            "fid":            int(r.get("fidelizado") or 0),
            "codigo_cliente": codigo_cliente,
            "nomecliente":    nomecliente,
        })

    if not records:
        return None

    atendentes_cnt = collections.Counter(r["atendente"] for r in records)
    cidades_cnt    = collections.Counter(r["cidade"]    for r in records)
    canais_cnt     = collections.Counter(r["canal"]     for r in records)
    tipos_list     = sorted(set(r["tipo"] for r in records))

    atendentes_list = [k for k, _ in atendentes_cnt.most_common()]
    cidades_list    = [k for k, _ in cidades_cnt.most_common()]
    canais_list     = [k for k, _ in canais_cnt.most_common(20)]
    datas_list      = sorted(set(r["data"] for r in records))

    ate_idx = {a: i for i, a in enumerate(atendentes_list)}
    cid_idx = {c: i for i, c in enumerate(cidades_list)}
    can_idx = {c: i for i, c in enumerate(canais_list)}
    tip_idx = {t: i for i, t in enumerate(tipos_list)}
    dat_idx = {d: i for i, d in enumerate(datas_list)}

    registros = []
    for r in records:
        registros.append([
            dat_idx.get(r["data"],      0),
            r.get("codigo_cliente", 0),
            r.get("nomecliente", ""),
            cid_idx.get(r["cidade"],   0),
            can_idx.get(r["canal"],    len(canais_list)),
            tip_idx.get(r["tipo"],     0),
            r["fid"],
            ate_idx.get(r["atendente"], 0),
        ])

    total       = len(records)
    total_pre   = sum(r["presencial"] for r in records)
    fidelizados = sum(r["fid"] for r in records)
    descobertos = total - fidelizados

    dt_min = datas_list[0]  if datas_list else ""
    dt_max = datas_list[-1] if datas_list else ""

    from collections import defaultdict
    days_map = defaultdict(lambda: {"tot":0,"pre":0,"fid":0,"des":0,"a":{},"ci":{},"ch":{},"tp":{}})
    for r in records:
        d = r["data"]
        dm = days_map[d]
        dm["tot"] += 1
        dm["pre"] += r["presencial"]
        dm["fid"] += r["fid"]
        dm["des"] += (1 - r["fid"])
        dm["a"][r["atendente"]] = dm["a"].get(r["atendente"], 0) + 1
        dm["ci"][r["cidade"]]   = dm["ci"].get(r["cidade"], 0) + 1
        dm["ch"][r["canal"]]    = dm["ch"].get(r["canal"], 0) + 1
        dm["tp"][r["tipo"]]     = dm["tp"].get(r["tipo"], 0) + 1

    days_out = [{"d": d, **days_map[d]} for d in sorted(days_map)]

    atendente_detail = {}
    for ate in atendentes_list[:100]:
        sub = [r for r in records if r["atendente"] == ate]
        atendente_detail[ate] = {
            "tot": len(sub),
            "pre": sum(r["presencial"] for r in sub),
            "fid": 0,
            "des": len(sub),
            "dias":    dict(collections.Counter(r["data"]   for r in sub)),
            "cidades": dict(collections.Counter(r["cidade"] for r in sub).most_common()),
            "canais":  dict(collections.Counter(r["canal"]  for r in sub).most_common(12)),
            "tipos":   dict(collections.Counter(r["tipo"]   for r in sub)),
        }

    cidade_detail = {}
    for ci in cidades_list:
        sub = [r for r in records if r["cidade"] == ci]
        cidade_detail[ci] = {
            "tot": len(sub),
            "pre": sum(r["presencial"] for r in sub),
            "fid": 0,
            "des": len(sub),
            "dias":       dict(collections.Counter(r["data"]      for r in sub)),
            "atendentes": dict(collections.Counter(r["atendente"] for r in sub).most_common(20)),
            "canais":     dict(collections.Counter(r["canal"]     for r in sub).most_common(12)),
            "tipos":      dict(collections.Counter(r["tipo"]      for r in sub)),
        }

    return {
        "meta": {
            "total":            total,
            "total_presencial": total_pre,
            "fidelizados":      fidelizados,
            "descobertos":      descobertos,
            "periodo":          "2026",
            "dt_min":           dt_min,
            "dt_max":           dt_max,
        },
        "atendentes":       atendentes_list,
        "cidades":          cidades_list,
        "canais":           canais_list,
        "tipos":            tipos_list,
        "datas":            datas_list,
        "registros":        registros,
        "dias":             days_out,
        "atendente_detail": atendente_detail,
        "cidade_detail":    cidade_detail,
        "por_contato":      [{"canal": k, "qtd": v} for k, v in canais_cnt.most_common(15)],
        "canal_tipo":       [{"tipo":  k, "qtd": v} for k, v in collections.Counter(r["tipo"] for r in records).most_common()],
        "por_atendente":    [{"nome": k, "qtd": v}  for k, v in atendentes_cnt.most_common()],
        "por_cidade":       [{"cidade": k, "qtd": v} for k, v in cidades_cnt.most_common()],
        "fidelizado":       [{"label":"Fidelizado","qtd":fidelizados},{"label":"Descoberto","qtd":descobertos}],
    }
