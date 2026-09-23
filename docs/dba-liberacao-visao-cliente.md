# Pedido ao DBA — dados para a visão analítica do cliente

**Sistema:** Cabonnet React (dash de operação), tela `/clientes/:codigo`
**Banco:** `imanager` (PostgreSQL 13), via datasource Grafana `IMANAGER-MASTER`
**Usuário do datasource:** `zbx_monitor` (membro de `group_monitoramento`)
**Levantamento feito em:** 23/09/2026

## 1. O que o usuário lê hoje

| Schema | Legível | Usado pelo dash |
|---|---|---|
| `public` | `clientes`, `contratos`, `ordemservico`, `enderecos`, `equipe`, `lanceservicos`, `tiposervico`, `carteira`, `carteiracidade`, `tablocal`, `cidade`, `empresas` | sim |
| `auditoria` | `aud_ordemservico` | sim — reagendamentos e trocas de equipe por OS |
| `reguacobranca` | `agendamento`, `execucao` | não — só log agregado das rotinas, sem cliente |
| `mobile` | **nada** (`permission denied for schema mobile`) | **deveria** — ver item 3 |

Com isso a tela já mostra cadastro, contratos, histórico completo de OS,
reincidência oficial, reagendamentos, técnico e localização da execução. O plano
contratado é lido **do texto livre da ficha de venda** (acerta ~54% dos contratos
ativos) — a liberação abaixo troca isso pelo dado oficial.

## 2. Pedido: views de leitura num schema próprio

Em vez de `GRANT SELECT` nas tabelas inteiras (que trazem conta bancária, cartão,
nome da mãe, RG, senha de integrações etc.), o pedido é um schema com views que
expõem **só as colunas usadas**. Os nomes de coluna abaixo foram tirados das
tabelas-espelho do schema `auditoria` (`aud_telefones`, `aud_docreceber`...),
que o usuário enxerga no catálogo. Os pontos marcados **[confirmar]** dependem
de conhecimento do modelo que não dá para inferir de fora.

```sql
CREATE SCHEMA IF NOT EXISTS cabonnet_bi;

-- 2.1 Telefones do cliente (hoje só existem no texto livre da ficha de venda)
CREATE VIEW cabonnet_bi.v_cliente_telefone AS
SELECT t.cidade, t.codigocliente, t.ddd, t.telefone, t.fonecompleto,
       t.tipo, t.numeroprincipal, t.whatsapp, t.sms
FROM public.telefones t
WHERE t.codigocliente IS NOT NULL;

-- 2.2 Plano contratado (substitui a leitura da ficha de venda)
CREATE VIEW cabonnet_bi.v_contrato_plano AS
SELECT cp.cidade, cp.codempresa, cp.contrato, cp.situacao,
       cp.d_dataativacao, cp.d_datadesativacao, cp.d_datafimvigencia, cp.valorpacote,
       p.codigodaprogramacao, p.nomedaprogramacao, p.velocidadedown, p.velocidadeup,
       p.descricaotecnologia
FROM public.cont_prog cp
JOIN public.programacao p
  ON p.codcidade = cp.cidade
 AND p.codigodaprogramacao = cp.protabelaprecos;   -- [confirmar] coluna de ligação com programacao

-- 2.3 Situação financeira — sem nosso número, banco, agência ou conta
CREATE VIEW cabonnet_bi.v_cliente_titulo AS
SELECT d.codigodacidade, d.cliente AS codigocliente, d.fatura, d.numerodocumento,
       d.d_dataemissao, d.d_datavencimento, d.d_datapagamento, d.d_datacancelamento,
       d.valordocumento, d.valorpago, d.situacao, d.formadepagamento,
       f.numerodocontrato
FROM public.docreceber d
LEFT JOIN public.fatura f
  ON f.codigodacidade = d.codigodacidade AND f.numerofatura = d.fatura
WHERE d.d_datavencimento >= current_date - interval '24 months';

-- 2.4 Histórico de atendimento (protocolos) — já usado pela tela Atendimento
CREATE VIEW cabonnet_bi.v_cliente_atendimento AS
SELECT h.codigocidade, h.assinante AS codigocliente, h.codcontrato,
       h.d_data, h.atendente, tc.descricao AS canal
       -- [confirmar] coluna de assunto/descrição do atendimento em historicogeral
FROM public.historicogeral h
LEFT JOIN public.tipodecontato tc ON tc.codigo = h.codigocontato
WHERE h.d_data >= current_date - interval '24 months';

-- 2.5 Tabelas de descrição (os códigos já estão em contratos/ordemservico)
CREATE VIEW cabonnet_bi.v_motivo_cancelamento AS
SELECT codmotivo, descmotivo, tipomotivo FROM public.motivocancelamento;
CREATE VIEW cabonnet_bi.v_vendedor AS
SELECT codigo, nome, equipevenda, situacao FROM public.vendedores;   -- sem CPF, RG, endereço
CREATE VIEW cabonnet_bi.v_midia AS
SELECT codigo, descricao FROM public.tipodemidiautilizada;

GRANT USAGE  ON SCHEMA cabonnet_bi TO group_monitoramento;
GRANT SELECT ON ALL TABLES IN SCHEMA cabonnet_bi TO group_monitoramento;
```

Também faltam as descrições dos códigos de `contratos.situacao` (o 7 não tem
nome confirmado), `clientes.tipoassinante` e `contratos.tipodevenda`. Se
existirem tabelas para eles, uma view `codigo, descricao` de cada basta.

**Índices:** `historicogeral` tem ~33 mi de linhas e `docreceber` ~7 mi. As
consultas do dash filtram por cliente + cidade; vale confirmar que existe índice
em `historicogeral (assinante, codigocidade)` e `docreceber (cliente, codigodacidade)`.

## 3. Regressão: acesso ao schema `mobile`

Desde pelo menos **10/09/2026** o log do servidor registra
`permission denied for schema mobile`. Com isso **fotos, checklist, ocorrências,
materiais e motivo de inconclusão** do detalhe da OS chegam vazios, sem erro
visível. Pedido: restaurar

```sql
GRANT USAGE ON SCHEMA mobile TO group_monitoramento;
GRANT SELECT ON mobile.vis_os_fotos, mobile.vis_os_checklist_status, mobile.vis_os_ocorrencias,
               mobile.vis_os_materiais_utilizados, mobile.vis_os_materiais_retirados,
               mobile.vis_os_ordemservico, mobile.vis_os_motivosinconclusivos
  TO group_monitoramento;
```

## 4. Achados de segurança — para a TI, independentes deste pedido

Encontrados durante o levantamento. **Nenhuma coluna de credencial foi lida**; o
que segue vem só do catálogo (nomes de tabela e de coluna).

1. **O datasource Grafana `Taubate-Provisionamento-Reset` conecta como `postgres`
   (superusuário).** Qualquer conta desse Grafana com acesso ao datasource pode
   ler, alterar e apagar a base `provisionamento_core_taubate`. A base tem colunas
   de credencial (`configuracaoprofile.senha`, `configuracaofiberhome.senha`,
   `reiniciarradiuspppoe.senhaconcentrador`). Recomendação: usuário dedicado só
   de leitura e revisar se as credenciais precisam ser trocadas.
2. **O datasource `INOTIFICACAO`** expõe tabelas com colunas de senha de banco,
   e-mail e SMS (`regra.senhaDb`, `email.senha`, `sms.senha`).
3. **A conta de API do Grafana usada pelo dash enxerga 22 datasources**, e o
   dash usa 1. Vale restringir as permissões de datasource dessa conta.
4. No banco `imanager`, **`zbx_monitor` pode executar 39 das 41 funções do
   `dblink`** (grant padrão a `PUBLIC`). Isso deixa um usuário de monitoramento
   abrir conexões de dentro do servidor de banco para outros hosts. Recomendação:
   `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC` para as funções
   do `dblink` (ou mover a extensão para um schema sem acesso) e conceder só a
   quem usa. `plpython3u`/`plperlu` estão instaladas, mas, por serem linguagens
   não confiáveis, só superusuário cria funções nelas; o `postgres_fdw` não tem
   servidor liberado para este usuário (`srvins`: sem `USAGE`).

## 5. O que foi deixado de fora de propósito (LGPD)

O cadastro tem data de nascimento, RG, profissão, estado civil, sexo, nome dos
pais e dados bancários/cartão. Nada disso é necessário para a operação e **não é
exibido**; as views acima também não os incluem.
