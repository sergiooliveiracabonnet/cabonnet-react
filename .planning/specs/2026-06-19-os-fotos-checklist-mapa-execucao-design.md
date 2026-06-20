# Design: OS completa (fotos/checklist/motivo) + pin de execução no Mapa

**Data:** 2026-06-19
**Status:** Aprovado para plano de implementação

## Contexto

Uma investigação no banco PostgreSQL do Interfocus/iManager (via introspecção `pg_catalog`, que não sofre o filtro de permissões do `information_schema`) revelou 46 schemas e ~2.300 tabelas/views, muito além das ~20 já usadas pelo Cabonnet. Dois blocos foram priorizados para esta rodada:

- **Bloco A — OS mais completa:** fotos da execução, checklist preenchido em campo, motivo de inconclusão.
- **Bloco B — Pin de execução no Mapa:** localização de onde cada OS em Atendimento foi iniciada.

### Achado crítico durante a investigação

Testando os templates SQL que **já estão em produção** (`SQL_OCORRENCIAS_TEMPLATE`, `SQL_MATERIAIS_UTILIZADOS_TEMPLATE`) com um `numos` real, a credencial do Grafana usada pelo Cabonnet retornou:

```
permission denied for schema mobile
```

Essas chamadas estão envoltas em `try/except Exception: pass` em `cabonnet/app.py` (`/detalhes`), que mascara o erro e retorna lista vazia. **Consequência:** as seções "Histórico" e "Materiais utilizados/retirados" no `OSDrawer` atual quase certamente aparecem vazias para todos os usuários, sempre — não é uma feature faltando, é um bug silencioso pré-existente.

Mapeamento de acesso testado (SELECT direto, role da credencial atual):

| Schema | Acesso |
|---|---|
| `public` | Liberado, mas só para tabelas específicas (ex: `osproblemas`, `osipfixo`, `osmacplacasrede`, `osdeslocamento` retornam "permission denied for table X") |
| `mobile` | Bloqueado por completo ("permission denied for **schema**") |
| `reguacobranca` | Bloqueado (mesmo em views) |
| `callcenter` | Bloqueado por completo |

**Pré-requisito de infraestrutura (fora do código, ação do DBA/fornecedor do Interfocus):**

```sql
GRANT USAGE ON SCHEMA mobile TO <usuário configurado em GRAFANA_USER>;
GRANT SELECT ON
  mobile.vis_os_ocorrencias,
  mobile.vis_os_materiais_utilizados,
  mobile.vis_os_materiais_retirados,
  mobile.vis_os_fotos,
  mobile.vis_os_checklist_status,
  mobile.vis_os_motivosinconclusivos,
  mobile.vis_os_ordemservico
TO <usuário configurado em GRAFANA_USER>;
```

Até esse GRANT ser aplicado, todo o código novo abaixo deve degradar graciosamente (ver "Tratamento de erros").

### Tabelas envolvidas (schema `mobile`, colunas confirmadas via `pg_catalog`)

```
mobile.vis_os_fotos               id, codcidade, codempresa, numos, codfoto, imagem(bytea),
                                   nomearquivo, descricao, extensaoarquivo, usuario, idos

mobile.vis_os_checklist_status    id, numos, codigochecklist, descricaochecklist,
                                   descricaoservico, codigoservico, checked(bool), idos, chave

mobile.vis_os_motivosinconclusivos id, descricao, codigo   (tabela de lookup, não tem numos)

mobile.vis_os_ordemservico        ... idmotivoinconclusivo(int4) -> join com motivosinconclusivos.id
                                   ... latitudeinicio, longitudeinicio, latitudefim, longitudefim (varchar)
                                   ... nomeexecutante, horainicio, horafim, equipeagendada
```

Decisão tomada durante o brainstorming: usar `latitudeinicio/longitudeinicio` (snapshot gravado quando o técnico inicia a execução) em vez de `mobile.localizacaotecnico` (pings periódicos). Motivo: não há chave de join confiável entre `localizacaotecnico.logintecnico` e equipe/técnico (verificado em `mobile.usuarioconfiguracao`, que só liga usuário→config de app, não usuário→equipe), e a frequência real de atualização dos pings é desconhecida. O ponto de execução é dado já confiável e usado pelo próprio app de campo.

## Arquitetura

```
Grafana (postgres datasource, schema mobile)
    │
    ├─ SQL_FOTOS_TEMPLATE / SQL_FOTO_BLOB_TEMPLATE / SQL_CHECKLIST_TEMPLATE   (grafana.py)
    ├─ SQL_DETALHES_TEMPLATE + LEFT JOIN mobile.vis_os_ordemservico/motivos  (grafana.py)
    │
    ▼
cabonnet_server.py (Python)
    ├─ GET /detalhes              → +fotos[], +checklist[], +motivoinconclusivo
    ├─ GET /detalhes/foto         → binário da imagem (Content-Type por extensaoarquivo)
    └─ GET /erp/os-execucao-geo   → numos/lat/lon das OS em Atendimento (leve, só para o Mapa)
    │
    ▼
React (useOSDetails, OSDetailModal, MapaPage)
```

## Backend (`cabonnet/`)

### 1. Fix do bug silencioso (pré-requisito, independente do GRANT)

Em `app.py`, dentro de `/detalhes`, os 4 blocos `except Exception: pass` passam a logar:

```python
except Exception:
    log.warning("Falha ao buscar ocorrências numos=%s", numos_int, exc_info=True)
```

Mesmo padrão para materiais_utilizados, materiais_retirados e equipe_reagendou. Comportamento observável não muda (ainda retorna lista vazia) — só deixa de mascarar o erro no log.

### 2. Novos templates SQL (`grafana.py`)

- `SQL_FOTOS_TEMPLATE` — metadados apenas, sem a coluna `imagem` (bytea fica de fora da listagem):
  ```sql
  SELECT id, codfoto, nomearquivo, descricao, usuario, extensaoarquivo
  FROM mobile.vis_os_fotos
  WHERE numos = {numos}
  ORDER BY id
  ```
- `SQL_FOTO_BLOB_TEMPLATE` — busca individual do binário:
  ```sql
  SELECT imagem, extensaoarquivo
  FROM mobile.vis_os_fotos
  WHERE numos = {numos} AND codfoto = {codfoto}
  LIMIT 1
  ```
- `SQL_CHECKLIST_TEMPLATE`:
  ```sql
  SELECT descricaoservico, descricaochecklist, checked
  FROM mobile.vis_os_checklist_status
  WHERE numos = {numos}
  ORDER BY codigoservico, codigochecklist
  ```
- `SQL_DETALHES_TEMPLATE` (existente) ganha:
  ```sql
  LEFT JOIN mobile.vis_os_ordemservico mo ON mo.numos = o.numos
  LEFT JOIN mobile.vis_os_motivosinconclusivos mi ON mi.id = mo.idmotivoinconclusivo
  ```
  e o SELECT ganha `mi.descricao AS motivoinconclusivo`.

### 3. Endpoint `/detalhes` (existente, estendido)

Retorno ganha 3 chaves novas, cada uma com try/except logado (mesmo padrão dos campos atuais):
```python
{"os": ..., "reagendada": ..., "equipe_reagendou": ...,
 "ocorrencias": ..., "materiais_utilizados": ..., "materiais_retirados": ...,
 "fotos": [...], "checklist": [...], "motivoinconclusivo": "..." | None}
```

### 4. Novo endpoint `GET /detalhes/foto`

```
GET /detalhes/foto?numos=<int>&codfoto=<int>
→ 200, Content-Type: image/<extensaoarquivo>, body = bytes do bytea
→ 404 se não encontrado
```
Sem cache em disco (escopo mínimo); cache HTTP padrão do browser já evita recarregar a mesma imagem na mesma sessão.

### 5. Novo endpoint `GET /erp/os-execucao-geo`

```
GET /erp/os-execucao-geo
→ [{numos, latitudeinicio, longitudeinicio, equipeagendada}, ...]
```
Filtra `situacao = 2` (Atendimento) e as 5 cidades do Vale do Paraíba, via `mobile.vis_os_ordemservico`. Endpoint leve e isolado — não entra no pipeline pesado do `/query` principal (`SQL_PENDENTE`/`SQL_AGENDADO`), só é chamado pela página Mapa quando a camada está ativa.

## Frontend (`src/`)

### 1. `useOSDetails.ts`

Adiciona ao retorno:
```ts
fotos:              { id: number; codfoto: number; nomearquivo: string; descricao: string|null }[]
checklist:          { servico: string; descricao: string; checked: boolean }[]
motivoInconclusivo: string | null
```
Mapeados do mesmo payload de `/detalhes` já carregado — sem chamada de rede extra.

### 2. `OSDetailModal.tsx`

3 novas `SectionDivider`, cada uma **condicional** (só renderiza se houver dado — evita poluir a maioria das OS que não têm fotos/checklist/motivo):

- **Fotos** — grid de thumbnails, `<img src="/detalhes/foto?numos={numos}&codfoto={id}" loading="lazy" onError={mostraPlaceholder}>`. Clique abre lightbox (reaproveita componente `Modal` existente, sem novo componente de UI).
- **Checklist** — lista agrupada por serviço, ícone ✓ verde / ✗ cinza por item conforme `checked`.
- **Motivo de Inconclusão** — badge (vermelho se inconclusiva), só renderiza se `motivoInconclusivo` não for null.

### 3. `MapaPage.tsx`

Novo toggle de camada, ao lado dos existentes (Heatmap/Cluster): **"Em atendimento agora"**.
- Hook novo `useOSExecucaoGeo()` (React Query, `staleTime` ~2 min) busca `/erp/os-execucao-geo`.
- Um marcador por OS retornada, ícone distinto (ex: ícone de técnico/ferramenta).
- Clique no marcador abre o `OSDrawer` já existente — zero componente novo de detalhe, reaproveita 100%.
- Sem dados: camada vazia mostra "Nenhuma OS em campo agora" no painel do toggle (não é erro, é estado vazio normal).

## Tratamento de erros e estados vazios

- **GRANT ainda não liberado:** `/detalhes` retorna as 3 chaves novas vazias/null; seções somem do modal sem erro visível. `/erp/os-execucao-geo` retorna lista vazia; camada do mapa fica vazia com a mensagem de estado vazio.
- **Foto individual falha ao carregar:** `onError` do `<img>` substitui por placeholder discreto, não quebra o grid.
- **numos inválido em `/detalhes/foto`:** 404 com mensagem clara (mesmo padrão de `/detalhes`).

## Testes

- **Backend:** teste de `/detalhes/foto` (bytes corretos quando existe, 404 quando não existe); teste de `/detalhes` garantindo que as 3 chaves novas existem no JSON mesmo quando o schema `mobile` retorna erro (fixture simulando "permission denied", igual à condição atual de produção).
- **Frontend:** `vitest` para `useOSDetails` (mapeamento de fotos/checklist/motivo) e para a renderização condicional das 3 seções no `OSDetailModal` (nada renderiza quando os campos vêm vazios — evita regressão de poluição visual).

## Fora de escopo (decisões explícitas para não inflar o projeto)

- Rastreamento contínuo ao vivo via `mobile.localizacaotecnico` — descartado nesta rodada por falta de chave de join confiável e frequência de atualização desconhecida. Pode ser retomado como evolução futura se o app de campo vier a gravar `idequipe`/`idtecnico` diretamente na tabela de pings.
- Blocos C (Inadimplência/Cobrança) e D (Atendimento/Retenção) — schemas `reguacobranca` e `callcenter` também estão bloqueados para a credencial atual; ficam para uma rodada futura, condicionados a um GRANT adicional.
- Geração de thumbnails/compressão de imagem no backend — fora de escopo; o navegador já redimensiona via CSS, e o volume de fotos por OS é baixo.
