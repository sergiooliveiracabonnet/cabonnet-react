# Fix — OS Concluída/Sem Execução não conta pra equipe (Design)

**Data:** 2026-07-20
**Status:** Aprovado pelo usuário
**Escopo deste documento:** correção de regra de negócio confirmada pelo usuário em 2026-07-20 (ver `docs/superpowers/...` não aplicável — regra registrada em memória do projeto, `project_os_concluida_nao_conta_equipe.md`): quando uma OS muda pra situação **Concluída** ou **Sem Execução**, ela não deve mais ficar contabilizada como carga/atribuição atual da equipe — procedimento interno da operação.

Uma auditoria de leitura (2026-07-20, sem editar nada) encontrou 6 violações confirmadas dessa regra em `src/features/erp/alertas/`, `src/features/erp/relatorios/` e `src/lib/builders/auditoria.ts`. Este documento cobre a correção dessas 6 — nenhuma outra mudança de escopo.

---

## 1. Contexto

`_situacaoEfetiva` (`src/lib/types.ts:47`, computado em `src/lib/transform.ts:393-397` durante `enrichRows`) é o campo de status normalizado — já resolve casos especiais de COPE/Reagendamento pra um valor de status "efetivo" (`'Pendente'`, `'Reagendamento'`, etc.), diferente do `descsituacao` bruto vindo do Grafana. É o campo mais correto pra decidir "essa OS está ativa agora?", mas hoje só uma das 6 violações (`AlertasPage.tsx` `totalFila`) tentava usá-lo — e com um bug: comparação estrita `!== 'Concluída'` não pega o valor `'Concluída/Sem Execução'` (string diferente), então essas OS continuavam contadas como fila.

**Não existe hoje um helper compartilhado** pra "esta OS ainda está na fila ativa de uma equipe". O padrão correto já existe, mas duplicado localmente em 7+ lugares (`campo.ts:46-58`, `sla.ts:16-18`, `cidades.ts:36-46`, `dashboard.ts:146-150`, `FilaPage.tsx:172-173`, `RankingTecnicosPage.tsx:65-70`, `RelatoriosPage.tsx:117-127` — `slaVencMap`), todos usando a mesma checagem `['Pendente','Atendimento'].includes(r.descsituacao)` sobre o campo bruto.

`transform.ts` já centraliza dois helpers irmãos, `isConcluida` (linha 6-7) e `isExecucaoReal` (linha 12-13) — este fix segue o mesmo padrão de organização.

**Restrições permanentes (herdadas do projeto):**
- `npm run build`, `npm run lint`, `npm run audit:ds`, `npx tsc --noEmit`, `npm test` limpos antes de qualquer commit.
- Nenhuma mudança de rota, permissão ou lógica de negócio além do escopo descrito abaixo.
- Não tocar nos 5 casos ambíguos nem na regra de anomalia (ambos registrados em memória, fora deste ciclo).
- Não tocar nos 7+ lugares já corretos (Fila/SLA/Campo/Cidades/Dashboard/Ranking) — eles já filtram certo, mesmo usando `descsituacao` bruto em vez do novo helper; migrá-los pro helper novo não é necessário pra esta correção e fica fora de escopo (evita diff desnecessário em código que já funciona).

---

## 2. Decisões de escopo (resolvidas com o usuário)

1. **Escopo:** só as 6 violações confirmadas pela auditoria. Casos ambíguos e a regra de anomalia (Instalação/Serviço não são anomalia) ficam para ciclos separados.
2. **Abordagem:** criar helper compartilhado `isFilaAtiva` em `transform.ts`, ao lado de `isConcluida`/`isExecucaoReal`, e usá-lo nos 6 pontos — em vez de 6 correções locais duplicadas.
3. **Campo usado:** `_situacaoEfetiva` (não `descsituacao` bruto) nos 6 pontos corrigidos — mais correto (normaliza COPE/Reagendamento) e resolve de quebra o bug de comparação estrita do `totalFila`.

---

## 3. Mudanças

### 3.1 `src/lib/transform.ts` — novo helper

Adicionar após `isExecucaoReal` (linha 13):
```ts

// OS que ainda está na fila ativa de uma equipe (não fechada).
// Usar para: contagem de carga/fila por equipe — Concluída/Sem Execução não conta mais
// como carga da equipe assim que a OS fecha (procedimento interno da operação).
export const isFilaAtiva = (s: string | undefined | null): boolean =>
  s === 'Pendente' || s === 'Atendimento'
```

### 3.2 `src/features/erp/alertas/AlertasPage.tsx` — `metricsByCode`

Import novo: `import { isFilaAtiva } from '../../../lib/transform'` (checar caminho relativo exato na implementação).

No loop que monta `metricsByCode` (linhas 37-47), adicionar guard antes de incrementar `queue`:
```ts
rows.forEach(row => {
  if (!row.nomedaequipe) return
  if (!isFilaAtiva(row._situacaoEfetiva)) return
  const code = shortEquipe(row.nomedaequipe).split(' - ')[0].trim()
  if (!map[code]) map[code] = { queue: 0, criticas: 0 }
  map[code].queue++
  ...
```
(Manter o resto do corpo do loop — `criticas` e qualquer outro campo — exatamente como está; só adicionar o guard de status antes do incremento de `queue`. Se `criticas` também depender de OS ativa, confirmar na implementação se o guard deve vir antes de todo o corpo ou só do `queue++` — o texto exato do arquivo atual decide isso.)

### 3.3 `src/features/erp/alertas/AlertasPage.tsx` — `totalFila`

Substituir (linhas 63-66):
```ts
const totalFila = useMemo(
  () => rows.filter(r => r._situacaoEfetiva !== 'Concluída').length,
  [rows]
)
```
por:
```ts
const totalFila = useMemo(
  () => rows.filter(r => isFilaAtiva(r._situacaoEfetiva)).length,
  [rows]
)
```

### 3.4 `src/features/erp/alertas/AlertasComponents.tsx` — "Equipes Sobrecarregadas"

**Nenhuma mudança de código** — consome `metricsByCode` (corrigido em 3.2) via prop, então o alerta de sobrecarga passa a refletir a fila real automaticamente. Confirmar na implementação que não há nenhuma outra contagem duplicada dentro deste arquivo além do consumo de `metricsByCode`.

### 3.5 `src/features/erp/relatorios/RelatoriosPage.tsx` — `byTeam`

Import novo: `import { isFilaAtiva } from '../../../lib/transform'` (checar caminho relativo exato).

No loop que monta `byTeam` (linhas 50-62), mesmo guard de 3.2:
```ts
filteredRows.forEach(r => {
  if (!r.nomedaequipe) return
  if (!isFilaAtiva(r._situacaoEfetiva)) return
  const code = shortEquipe(r.nomedaequipe).split(' - ')[0].trim()
  if (!map[code]) map[code] = { queue: 0, criticas: 0 }
  map[code].queue++
  ...
```

### 3.6 `src/features/erp/relatorios/RelatoriosPage.tsx` — `ranking`/`totals`

No loop que monta `ranking`/`totals` (linhas 130-159), mesmo guard antes do incremento de `queue` (linha ~143) — preservando os demais campos (`agingSum`/`agingCount`/contagem de `'Concluída'`) que já são calculados corretamente (via `_agingAbertura != null` e `descsituacao === 'Concluída'` respectivamente, ambos fora do escopo deste fix).

### 3.7 `src/lib/builders/auditoria.ts` — `semEquipe`

Import novo: `import { isFilaAtiva } from '../transform'` (checar caminho relativo exato).

Substituir (linha 5):
```ts
const semEquipe  = rows.filter(r => !r.nomedaequipe?.trim()).length
```
por:
```ts
const semEquipe  = rows.filter(r => isFilaAtiva(r._situacaoEfetiva) && !r.nomedaequipe?.trim()).length
```

---

## 4. Fora do escopo desta implementação

- Os 5 casos ambíguos (Planner, Fornecedor, gráficos, revisitas, "Sem Equipe" em Relatórios) — registrados em `project_os_concluida_nao_conta_equipe.md`, decisão de negócio separada.
- Regra de anomalia (Instalação/Serviço não são anomalia) — ciclo separado.
- Migrar os 7+ lugares já corretos pro novo helper `isFilaAtiva` — funcionam certo hoje, sem necessidade de tocar.
- Qualquer mudança de rota, permissão ou lógica de dados/negócio além dos 6 pontos listados.

---

## 5. Testes

- `src/lib/transform.test.ts`: novos testes pra `isFilaAtiva` — cobrir `'Pendente'` (true), `'Atendimento'` (true), `'Concluída'` (false), `'Concluída/Sem Execução'` (false), `'Reagendamento'` (false), `undefined`/`null` (false).
- Suíte completa (`npm test`) deve continuar 100% verde — regressão nos testes existentes de `AlertasPage`/`AlertasComponents`/`RelatoriosPage`/`auditoria.ts`, se existirem, deve refletir a nova contagem (ajustar fixtures se algum teste dependia do comportamento antigo/incorreto).
- Verificação manual no navegador: em `/erp/alertas`, KPI "OS na Fila" e alerta "Equipes Sobrecarregadas" não devem mais contar OS concluídas/sem execução; em `/erp/relatorios`, gráfico "OS por Equipe" e ranking (se visível) devem refletir só fila ativa.

---

## 6. Arquivos afetados

- `src/lib/transform.ts` — novo helper `isFilaAtiva`.
- `src/lib/transform.test.ts` — novos testes.
- `src/features/erp/alertas/AlertasPage.tsx` — `metricsByCode` e `totalFila` corrigidos.
- `src/features/erp/relatorios/RelatoriosPage.tsx` — `byTeam` e `ranking`/`totals` corrigidos.
- `src/lib/builders/auditoria.ts` — `semEquipe` corrigido.
