# Fix — Instalação/Serviço não são anomalia — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrige 3 pontos de detecção de anomalia/cluster (`clustersAtivos` em `dashboard.ts`, `bairrosAnomalia` e `picosDia` em `anomalias.ts`) pra excluir OS de Serviço (`_tipo === 'OUTRO'`) da mesma forma que já excluem Instalação — só Manutenção (e, onde já era o caso, Rede) deve disparar sinalização de anomalia/pico/cluster.

**Architecture:** Extensão cirúrgica de condições de exclusão já existentes em 2 dos 3 pontos (`clustersAtivos`, `bairrosAnomalia`); novo filtro no loop de acumulação de `picosDia` (sem tocar a variável `base` compartilhada, pra não afetar `eqAging`). Nenhuma outra lógica muda.

**Tech Stack:** React 18 + TypeScript, Vitest.

## Global Constraints

- `npm run build`, `npm run lint`, `npm run audit:ds`, `npx tsc --noEmit`, `npm test` devem passar limpos antes de qualquer commit.
- Escopo travado nos 3 pontos abaixo — não tocar em `sla.ts` `clusters` (código morto, confirmado sem consumidor na UI), nem em `useAlertasEngine.ts` (já correto por construção).
- `REDE` não entra em nenhuma exclusão nova — a regra só cobre Instalação/Serviço. Onde `isRede(r)` já era excluído (`clustersAtivos`), continua excluído do mesmo jeito; onde não era (`bairrosAnomalia`, `picosDia`), continua sem exclusão de Rede.
- `picosDia` usa a variável compartilhada `base` (também usada por `eqAging`, aging médio por equipe) — o filtro novo deve ficar dentro do próprio loop de acumulação de `picosDia`, sem alterar `base` em si.
- Não existe `_tipo === 'SERVICO'` no código — "Serviço" é `_tipo === 'OUTRO'`. Usar sempre `r._tipo === 'OUTRO'`, nunca `'SERVICO'`.
- Fixtures de teste devem usar `tiposervico: 'INSTALACAO'`/`'MANUTENCAO'` (sem acento) pra classificação correta via `getEquipeTipo` — texto acentuado ("Instalação"/"Manutenção") não dispara a classificação (achado de sessão anterior, registrado em `project_instalacao_nao_e_anomalia.md`). Pra Serviço, usar um `tiposervico` que não bate com nenhum padrão de `getEquipeTipo` (ex: `'SERVICO'`) — cai no `else` final e vira `_tipo === 'OUTRO'`.

---

### Task 1: Excluir Serviço (`_tipo === 'OUTRO'`) dos 3 detectores de anomalia/cluster

**Files:**
- Modify: `src/lib/builders/dashboard.ts` (`clustersAtivos`)
- Modify: `src/lib/builders/dashboard.test.ts` (novo teste)
- Modify: `src/lib/builders/anomalias.ts` (`bairrosAnomalia`, `picosDia`)
- Modify: `src/lib/builders/anomalias.test.ts` (novos testes)

**Interfaces:**
- Nenhuma interface nova — só extensão de condições `if` já existentes dentro de `buildDashboard`/`buildAnomalias`, ambos já exportados.

- [ ] **Step 1: Escrever o teste de `clustersAtivos` pra Serviço (deve falhar)**

Em `src/lib/builders/dashboard.test.ts`, adicionar dentro de `describe('clustersAtivos (Clusters de Falha)', ...)` (após o teste "sinaliza bairro com muitas OS de Manutenção como cluster de falha", linha 160, antes do `})` de fechamento do describe):
```ts
  it('não sinaliza bairro com muitas OS de Serviço (demanda comercial não é falha de infra)', () => {
    const rows = enrichRows(
      Array.from({ length: 6 }, (_, i) => makeOS({
        numos: `SRV${i}`, bairro: 'JARDIM SERVICO', tiposervico: 'SERVICO',
        descsituacao: 'Pendente', datacadastro: daysAgo(0), dataagendamento: '', dataexecucao: '', databaixa: '',
      }))
    )
    const { pulso } = buildDashboard(rows)
    expect((pulso as { clustersAtivos: { bairro: string }[] }).clustersAtivos).toHaveLength(0)
  })
```

- [ ] **Step 2: Escrever os testes de `anomalias.ts` pra Serviço (devem falhar)**

Em `src/lib/builders/anomalias.test.ts`, adicionar dentro de `describe('buildAnomalias — composição da anomalia de bairro', ...)` (após o teste "não sinaliza bairro com SLA estourado só por causa de arrastão de Instalação do PAP", linha 97, antes do `})` de fechamento do describe):
```ts
  it('não sinaliza bairro com SLA estourado só por causa de concentração de Serviço', () => {
    const servicoConcentrado = Array.from({ length: 6 }, (_, i) =>
      makeOS({ numos: `srv${i}`, bairro: 'SERVICOZAO', nomedaequipe: 'F20', tiposervico: 'SERVICO', datacadastro: '01/01/2026', dataagendamento: '15/03/2026' })
    )
    const normalBairros = [1, 2, 3].flatMap(n => Array.from({ length: 5 }, (_, i) =>
      makeOS({ numos: `n${n}-${i}`, bairro: `BAIRRO${n}`, nomedaequipe: 'F09' })
    ))

    const rows = enrichRows([...servicoConcentrado, ...normalBairros])
    const { bairrosAnomalia } = buildAnomalias(rows)

    expect(bairrosAnomalia.find(b => b.bairro === 'SERVICOZAO')).toBeUndefined()
  })

  it('picosDia: pico de Instalação/Serviço não conta, pico de Manutenção conta', () => {
    const picoInstalacao = Array.from({ length: 6 }, (_, i) =>
      makeOS({ numos: `pi${i}`, tiposervico: 'INSTALACAO', datacadastro: daysAgo(0), dataagendamento: daysAgo(0) })
    )
    const picoManutencao = Array.from({ length: 6 }, (_, i) =>
      makeOS({ numos: `pm${i}`, tiposervico: 'MANUTENCAO', datacadastro: daysAgo(1), dataagendamento: daysAgo(1) })
    )
    const baseline = Array.from({ length: 8 }, (_, i) =>
      makeOS({ numos: `bl${i}`, tiposervico: 'MANUTENCAO', datacadastro: daysAgo(i + 2), dataagendamento: daysAgo(i + 2) })
    )

    const rows = enrichRows([...picoInstalacao, ...picoManutencao, ...baseline])
    const { picosDia } = buildAnomalias(rows)

    expect(picosDia.find(p => p.date === daysAgo(0))).toBeUndefined()
    expect(picosDia.find(p => p.date === daysAgo(1))).toBeDefined()
  })
```

- [ ] **Step 3: Rodar os 3 testes novos e confirmar que falham**

Run: `npx vitest run src/lib/builders/dashboard.test.ts src/lib/builders/anomalias.test.ts -t "Serviço|picosDia"`
Expected: FAIL — os 3 testes novos falham (o comportamento atual ainda conta Serviço como Instalação/Manutenção sem distinção nesses 3 pontos).

- [ ] **Step 4: Corrigir `dashboard.ts` — `clustersAtivos`**

Substituir (linhas 363-367):
```ts
  // Instalação em massa no mesmo bairro é prática normal do PAP (arrastão), não indício de
  // falha de infraestrutura — só conta OS de Manutenção/Outro para "Cluster de Falha".
  const clusterBairroMap = new Map<string, { bairro: string; cidade: string; total: number }>()
  for (const r of allRows) {
    if (isCOPE(r) || isReagend(r) || isRede(r) || r._tipo === 'INSTALACAO') continue
```
por:
```ts
  // Instalação e Serviço em massa no mesmo bairro são prática comercial normal (arrastão do
  // PAP, demanda de serviço), não indício de falha de infraestrutura — só conta OS de
  // Manutenção para "Cluster de Falha".
  const clusterBairroMap = new Map<string, { bairro: string; cidade: string; total: number }>()
  for (const r of allRows) {
    if (isCOPE(r) || isReagend(r) || isRede(r) || r._tipo === 'INSTALACAO' || r._tipo === 'OUTRO') continue
```

- [ ] **Step 5: Corrigir `anomalias.ts` — `bairrosAnomalia`**

Substituir (linhas 70-74):
```ts
  // Instalação em massa no mesmo bairro é prática normal do PAP (arrastão), não anomalia —
  // excluída para não dominar a composição nem inflar a taxa de SLA excedido do bairro.
  const bairroMap = new Map<string, { total: number; slaExc: number; rows: OSRow[] }>()
  for (const r of base) {
    if (r._tipo === 'INSTALACAO') continue
```
por:
```ts
  // Instalação e Serviço em massa no mesmo bairro são prática comercial normal (arrastão do
  // PAP, demanda de serviço), não anomalia — excluídos para não dominar a composição nem
  // inflar a taxa de SLA excedido do bairro.
  const bairroMap = new Map<string, { total: number; slaExc: number; rows: OSRow[] }>()
  for (const r of base) {
    if (r._tipo === 'INSTALACAO' || r._tipo === 'OUTRO') continue
```

- [ ] **Step 6: Corrigir `anomalias.ts` — `picosDia`**

Substituir (linhas 57-61):
```ts
  const diaCnt = new Map<string, number>()
  for (const r of base) {
    const d = (r.datacadastro || '').split(' ')[0]
    if (d) diaCnt.set(d, (diaCnt.get(d) ?? 0) + 1)
  }
```
por:
```ts
  // Instalação e Serviço em massa não são anomalia (prática comercial normal) — só
  // Manutenção/Rede entram no detector de pico de fluxo diário.
  const diaCnt = new Map<string, number>()
  for (const r of base) {
    if (r._tipo === 'INSTALACAO' || r._tipo === 'OUTRO') continue
    const d = (r.datacadastro || '').split(' ')[0]
    if (d) diaCnt.set(d, (diaCnt.get(d) ?? 0) + 1)
  }
```

**Atenção:** NÃO alterar a variável `base` (linha 55) nem o loop de `eqAging` (linhas 98-106) — o filtro de `picosDia` fica isolado dentro do próprio loop de `diaCnt`.

- [ ] **Step 7: Rodar os 3 testes novos de novo e confirmar que passam**

Run: `npx vitest run src/lib/builders/dashboard.test.ts src/lib/builders/anomalias.test.ts -t "Serviço|picosDia"`
Expected: PASS — 3/3 testes novos.

- [ ] **Step 8: Rodar a suíte completa de testes (regressão)**

Run: `npm test`
Expected: PASS — sem regressão (nenhum fixture existente testa `_tipo === 'OUTRO'`/Serviço nesses 3 pontos hoje).

- [ ] **Step 9: Type-check, lint, audit de design system e build**

Run: `npx tsc --noEmit && npm run lint && npm run audit:ds && npm run build`
Expected: sem erros.

- [ ] **Step 10: Verificação manual no navegador**

Run: `npm run dev` (porta 3000, `strictPort: true`).

No navegador, autenticado:
1. No Dashboard, painel "Clusters de Falha": nenhum bairro com muitas OS de Instalação ou Serviço deve aparecer como cluster; só bairros com concentração de Manutenção.
2. Na seção de Anomalias (se acessível na tela atual — `AnomaliaSection.tsx`): "Bairros com Anomalia" e "Picos Diários" não devem mais ser dominados por Instalação/Serviço.

Reportar o resultado de cada item antes de prosseguir. Se algo divergir do esperado, corrigir antes do commit.

- [ ] **Step 11: Commit**

```bash
git add src/lib/builders/dashboard.ts src/lib/builders/dashboard.test.ts src/lib/builders/anomalias.ts src/lib/builders/anomalias.test.ts
git commit -m "fix(anomalia): Instalacao/Servico nao sao anomalia, so Manutencao"
```

---

## Self-Review (executado ao escrever este plano)

**Cobertura do spec:** §3.1 (clustersAtivos) → Steps 1,4. §3.2 (bairrosAnomalia) → Steps 2,5. §3.3 (picosDia) → Steps 2,6. §5 (testes) → Steps 1-3 (TDD dos 3 testes) + 7 (green) + 8 (regressão) + 10 (manual).

**Placeholders:** nenhum "TBD" — código completo e literal; todos os blocos "antes" são cópia exata dos arquivos lidos durante o brainstorming/planejamento.

**Consistência de tipos:** `r._tipo === 'OUTRO'` usado nos 3 pontos, mesmo tipo `TipoEquipe` já existente (`src/lib/types.ts:4`) — nenhuma mudança de tipo necessária. Teste de `picosDia` calculado manualmente: 9 dias com contagem (1 dia=6 Manutenção, 8 dias=1 cada), média≈1,56, desvio-padrão populacional≈1,57, limiar (média+2×desvio)≈4,70 — o dia de Manutenção (6) ultrapassa o limiar, o dia de Instalação (6 OS, mas todas excluídas) nem aparece no mapa de contagem.
