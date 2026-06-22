# Fila de Prioridade VT — Design

**Data:** 2026-06-22
**Status:** Aprovado para planejamento

## Contexto

O sistema já calcula campos de SLA/risco por OS (`_riskScore`, `_diasAteViolacao`, `_slaCritico` em `src/lib/transform.ts`), mas trata os prazos de VT (Visita Técnica) em **granularidade de dias**, mesmo quando o prazo real é em horas (VT 08h, VT 24h, VT 48h). Isso faz com que VT 08h e VT 24h caiam no mesmo bucket de "1 dia", perdendo a urgência real.

Não existe hoje nenhuma página dedicada a acompanhar essas OS — elas aparecem apenas como uma coluna dentro da página geral `/ordens`.

O objetivo desta feature é dar ao usuário um lugar para **priorizar agressivamente o atendimento das OS de VT**, com contagem regressiva precisa até o vencimento do prazo (24h/48h/8h), e garantir que ninguém perca o prazo via alerta automático no Telegram.

## Escopo

- **Tipos de VT incluídos:** todas (VT 08h, VT 24h, VT 48h) — qualquer OS cujo campo `servico` contenha esses textos.
- **Base do prazo:** `datacadastro` (data de abertura da OS) — mesma base já usada por todo o resto do sistema (aging, risk score, alertas).
- **Fora de escopo nesta versão:** exportação CSV/PDF da fila, configuração de horas via painel de Alertas (ficam fixas no código), alteração do motor de Alertas existente, mensagem de "resolvido" quando a OS sai da fila.

## Decisão de design: não alterar o sistema de SLA existente

`getSlaLimite`, `_SLA_DEFAULTS`, `SlaLimits` (em `alertStore`), `_slaCritico`, `_diasAteViolacao`, o Risk Score, o motor de Alertas e o template `tgCriticas` **continuam exatamente como estão hoje** (dia-based). Mudar a unidade desses campos quebraria todo o pipeline de risco/alertas existente que depende deles (qualquer OS com `servico` contendo "VT" já é classificada e consumida por essas fórmulas em dias).

Em vez disso, esta feature introduz um conjunto de **campos novos e paralelos**, usados exclusivamente pela fila VT, com zero impacto no que já existe.

## 1. Camada de dados (frontend)

### `src/lib/transform.ts`

Nova função pura:

```ts
function getVtPrazoHoras(servico: string | null | undefined): number | null {
  const s = (servico || '').toUpperCase()
  if (s.includes('VT 08H')) return 8
  if (s.includes('VT 24H')) return 24
  if (s.includes('VT 48H')) return 48
  return null
}
```

Em `enrichRows`, usando `_agingHoras` (já calculado a partir de `datacadastro`):

- `row._vtPrazoHoras`: 8 / 24 / 48 / `null` (não é VT)
- `row._vtHorasRestantes`: `_vtPrazoHoras - _agingHoras`, somente para OS ativas (Pendente/Atendimento); `null` se não for VT ou não estiver ativa. Pode ser negativo (já violado).
- `row._vtViolado: boolean`: `true` quando `_vtHorasRestantes != null && _vtHorasRestantes <= 0`

### `src/lib/types.ts`

Adicionar à interface `OSRow`:

```ts
_vtPrazoHoras:     number | null
_vtHorasRestantes: number | null
_vtViolado:        boolean
```

## 2. Página nova: `/erp/vt` — "Fila VT"

Novo diretório `src/features/erp/vt/`, arquivo principal `VTPriorityPage.tsx`, seguindo os mesmos padrões visuais e de composição das outras páginas ERP (`KPICard`, `FilterSelect`, `SearchBox`, `DataTable`, `Badge`, `OSDrawer`).

### Fonte de dados

Filtra de `useOSDerived().rows` (já filtrado pelas 5 cidades + `hideRede` via `OSDataContext`) as OS onde `_vtPrazoHoras != null` e situação ativa (Pendente/Atendimento).

### KPIs (topo)

- **Violadas** (vermelho) — `_vtViolado === true`
- **Crítico <2h** (laranja) — `0 < _vtHorasRestantes <= 2`
- **Atenção <6h** (amarelo) — `2 < _vtHorasRestantes <= 6`
- **No prazo** (verde) — `_vtHorasRestantes > 6`

Esses limiares (2h/6h) são apenas para a exibição visual da fila (cores/buckets) e são independentes do limiar de 4h usado pelo alerta automático do backend (seção 5) — um define como a tela pinta a urgência, o outro define quando o Telegram dispara.

### Filtros

- Tipo de VT: 08h / 24h / 48h / Todas (`FilterSelect`)
- Fornecedor/equipe (reusa `fornecedorOptions` já existente em `OrdensPage`)
- Busca por cliente/nº OS (`SearchBox`)

### Tabela

`DataTable` com `rows` pré-ordenadas por `_vtHorasRestantes` ascendente (mais urgente primeiro — inclui violadas, que têm valor negativo, no topo). Colunas:

- Nº OS
- Cliente
- Cidade / Bairro
- Equipe (`shortEquipe`)
- Tipo VT (badge: "VT 8h" / "VT 24h" / "VT 48h")
- **Tempo Restante** (coluna principal — badge colorido):
  - 🔴 `Violado há Xh Ymin` quando `_vtHorasRestantes <= 0`
  - 🟠 `Xh Ymin restantes` quando `<= 2h`
  - 🟡 quando `<= 6h`
  - 🟢 quando `> 6h`
- Situação (`Badge` + `situacaoVariant`, igual `OrdensPage`)
- Ação: ícone "Notificar" (ver seção 3)

Clique na linha (fora do ícone de ação) → abre `OSDrawer` já existente, sem duplicar modal.

### Estado vazio

"Nenhuma OS de VT em aberto 🎉" quando a fila filtrada está vazia.

### Atualização

Segue o ciclo normal de refetch do React Query (sem timer de countdown ao vivo no navegador).

## 3. Ação manual — Notificar via Telegram

Botão por linha que monta uma mensagem formatada (novo template `tgVTUrgente(row)` em `src/lib/tgTemplates.ts`) e chama `telegram.send(texto, chat)` (client já existente em `src/lib/api.ts`).

- `chat` é derivado de `row._fornecedor` (WES → `'wes'`, Instacable → `'instacable'`, THM → `'thm'`, REDE → `'rede'`; outros fornecedores → `'alertas'`), mapeando para as chaves aceitas por `_CHAT_MAP` no backend (`cabonnet/app.py`).
- Feedback inline: ícone vira ✓ por ~2s após envio bem-sucedido (mesmo padrão de microfeedback usado em ações de cópia em outras telas).
- Registra em `useAuditStore` (`logAudit`), seguindo o padrão de outras ações de Telegram no sistema.

## 4. Navegação

- **Sidebar** (`src/components/layout/Sidebar.tsx`): novo item no grupo `erp`, ícone `Siren` (lucide-react), label "Fila VT", rota `/erp/vt`.
- **Rotas** (`src/App.tsx`): nova `<Route path="vt" element={<ERPVTPage />} />` dentro do bloco `<Route path="erp">`.
- **Lazy import** (`src/pages/index.ts`): `export const ERPVTPage = lazy(() => import('../features/erp/vt/VTPriorityPage'))`.

## 5. Alerta automático no Telegram (backend)

Novo monitor em background, seguindo exatamente o padrão dos monitores existentes em `cabonnet/monitors.py` (`_sla_monitor_loop`, `_fila_monitor_loop`).

### `_vt_monitor_loop()`

- Roda a cada **3 minutos** (`_time_mod.sleep(180)`) — mais frequente que o monitor de SLA geral (5min), pois aqui a unidade é hora.
- Só executa se `_telegram_enabled()`.
- Lê `state._dados_cache["agendado"]` (cache já populado pelo polling existente — nenhuma chamada extra ao Grafana).
- Para cada OS ativa (Pendente/Atendimento) cujo `servico` contenha VT 08H/24H/48H:
  - `prazo_h` = 8/24/48 conforme o texto do `servico`
  - `aging_h` = horas desde `datacadastro` até agora
  - `restante_h = prazo_h - aging_h`

### Máquina de estados por OS

Estado guardado em `state._vt_alertados: dict[numos, {"estagio": "risco"|"violado", "last_sent": datetime}]`, resetado todo dia (`state._vt_alertados_data`, mesmo padrão de `_sla_alertados_data`).

| Condição | Ação |
|---|---|
| `restante_h <= 0` e estágio atual ≠ `"violado"` | Dispara alerta 🔴 **VT VIOLADO**, marca estágio `violado`, `last_sent = agora` |
| Estágio já é `"violado"` e `agora - last_sent >= 30min` | **Repete** o lembrete 🔴, atualiza `last_sent` |
| `0 < restante_h <= 4` e ainda sem entrada no dict | Dispara alerta 🟠 **VT EM RISCO** uma única vez (não repete), marca estágio `risco` |
| OS some da fila ativa (atendida/cancelada) | Simplesmente para de alertar — sem mensagem de "resolvido" |

### Destino das mensagens

Usa `_operadora_da_os(row)` (já existe em `cabonnet/telegram.py`) para resolver WES/INSTACABLE/THM/REDE e envia:
1. Para o grupo do operador responsável (`TELEGRAM_CHAT_WES` / `TELEGRAM_CHAT_INSTACABLE` / `TELEGRAM_CHAT_OPERACIONAL_THM` / `TELEGRAM_CHAT_REDE`)
2. Também para o grupo global `TELEGRAM_CHAT_ALERTAS` — mesmo padrão usado em `_tg_broadcast_status_changes`

Se não houver operadora identificável, envia só para `TELEGRAM_CHAT_ALERTAS`.

### Registro

- Novas variáveis em `cabonnet/state.py`: `_vt_alertados = {}`, `_vt_alertados_data = None`
- Novo thread em `cabonnet/app.py`, dentro do bloco `if _telegram_enabled():` do `lifespan`: `threading.Thread(target=_vt_monitor_loop, name="VTMonitor", daemon=True).start()`
- Import de `TELEGRAM_CHAT_REDE` em `cabonnet/monitors.py` (ainda não importado lá)

### Relação com a ação manual (seção 3)

O botão "Notificar" manual da tela é complementar — permite avisar antecipadamente, antes mesmo da OS cruzar os limiares automáticos de risco/violação.

## Testes

- `src/lib/transform.test.ts`: casos para `getVtPrazoHoras` (8h/24h/48h/não-VT) e para `_vtHorasRestantes`/`_vtViolado` em `enrichRows` (ativa vs. concluída, antes/depois do prazo).
- Backend: teste manual via `/setup` ou logs (`[VTMonitor]`) — sem suíte de testes automatizados em Python no projeto atualmente.

## Arquivos afetados (resumo)

| Arquivo | Tipo de mudança |
|---|---|
| `src/lib/types.ts` | Novos campos em `OSRow` |
| `src/lib/transform.ts` | Nova função `getVtPrazoHoras` + novos campos em `enrichRows` |
| `src/lib/transform.test.ts` | Novos testes |
| `src/lib/tgTemplates.ts` | Novo template `tgVTUrgente` |
| `src/features/erp/vt/VTPriorityPage.tsx` | Novo arquivo |
| `src/components/layout/Sidebar.tsx` | Novo item de menu |
| `src/App.tsx` | Nova rota |
| `src/pages/index.ts` | Novo lazy import |
| `cabonnet/state.py` | Novas variáveis de estado |
| `cabonnet/monitors.py` | Novo `_vt_monitor_loop` + helper de envio |
| `cabonnet/app.py` | Novo thread registrado no `lifespan` |
