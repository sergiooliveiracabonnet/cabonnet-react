# Fix — Instalação/Serviço não são anomalia; só Manutenção é (Design)

**Data:** 2026-07-20
**Status:** Aprovado pelo usuário
**Escopo deste documento:** correção de regra de negócio confirmada pelo usuário em 2026-07-20 (registrada em `project_instalacao_nao_e_anomalia.md`): aumento de fluxo de OS de Instalação/PRIMEIRA CONEXÃO ou Serviço nunca é anomalia — é comportamento comercial normal. A única anomalia real é aumento de fluxo em Manutenção/Assistência.

Uma auditoria de leitura (2026-07-20, sem editar nada) encontrou 2 violações confirmadas (já excluíam Instalação, mas não Serviço) mais 1 ponto sem filtro nenhum (`picosDia`). Este documento cobre a correção desses 3 — nenhuma outra mudança de escopo.

---

## 1. Contexto

`_tipo` (`src/lib/types.ts:4`) é `'REDE' | 'INSTALACAO' | 'MANUTENCAO' | 'OUTRO'` — **não existe o literal `'SERVICO'`**. O que o usuário chama de "Serviço" é `_tipo === 'OUTRO'` (valor default de `getEquipeTipo`, `src/lib/transform.ts:262-269`), que por sua vez vira `_categoria === 'SERVICO'` (`transform.ts:373`). Qualquer busca literal por `_tipo === 'SERVICO'` no código sempre daria falso negativo — é por isso que a correção anterior (2026-07-14) só excluiu `INSTALACAO` e não pegou este caso.

**3 pontos identificados:**

1. **`src/lib/builders/dashboard.ts:363-379`** (`clustersAtivos`, painel "Clusters de Falha") — já exclui `isCOPE`/`isReagend`/`isRede`/`INSTALACAO`, mas o comentário confirma que Serviço/`OUTRO` foi **incluído de propósito** junto com Manutenção ("só conta OS de Manutenção/Outro").
2. **`src/lib/builders/anomalias.ts:70-82`** (`bairrosAnomalia`, dentro de `buildAnomalias`) — exclui só `INSTALACAO`, Serviço/`OUTRO` entra na composição e infla a taxa de SLA excedido do bairro.
3. **`src/lib/builders/anomalias.ts:57-68`** (`picosDia`, detector de pico diário via Z-score) — **não filtra tipo nenhum** hoje (soma REDE+INSTALACAO+MANUTENCAO+OUTRO juntos). É o detector mais diretamente ligado à regra ("aumento de fluxo").

**Fora do escopo:** `src/lib/builders/sla.ts:56-66` (`clusters`) tem o mesmo problema, mas foi confirmado como código morto — nenhum consumidor na UI (`aiClusters.clusters` em `CidadesPage.tsx` é um objeto totalmente diferente, gerado por IA, sem relação com `buildSla`). Registrado em memória pra corrigir se algum dia for exposto.

`REDE` não entra em nenhuma das 3 exclusões novas — a regra do usuário só menciona Instalação/Serviço; Rede continua contando normalmente nos 3 pontos (comportamento inalterado).

**Restrições permanentes (herdadas do projeto):**
- `npm run build`, `npm run lint`, `npm run audit:ds`, `npx tsc --noEmit`, `npm test` limpos antes de qualquer commit.
- Nenhuma mudança de rota, permissão ou lógica de negócio além do escopo descrito abaixo.
- `useAlertasEngine.ts` (Alerta "Cluster de falhas") já filtra corretamente por construção (`includes('MANUTENCAO')`) — não precisa de mudança, confirmado na auditoria.
- `picosDia` usa a variável compartilhada `base` (também usada por `bairrosAnomalia` e `eqAging`, aging por equipe) — o filtro novo de `picosDia` deve ser feito dentro do próprio loop de acumulação de `picosDia`, SEM alterar `base` em si, pra não afetar `eqAging` (métrica diferente, fora do escopo desta regra).
- `bairrosAnomalia` já filtra dentro do próprio loop (não usa `base` diretamente pra isso) — sem risco de efeito colateral em `eqAging`.

---

## 2. Decisões de escopo (resolvidas com o usuário)

1. **Escopo:** os 3 pontos confirmados (`clustersAtivos`, `bairrosAnomalia`, `picosDia`). `sla.ts` `clusters` fica de fora (código morto).
2. **`picosDia` entra no escopo** apesar de nunca ter tido filtro de tipo — é o detector mais alinhado à regra do usuário ("aumento de fluxo").
3. **REDE não é tocado** — a exclusão nova é só `INSTALACAO`/`OUTRO` (Serviço), mantendo o comportamento já existente pra Rede.

---

## 3. Mudanças

### 3.1 `src/lib/builders/dashboard.ts` — `clustersAtivos`

Substitui (linhas 363-367):
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

### 3.2 `src/lib/builders/anomalias.ts` — `bairrosAnomalia`

Substitui (linhas 70-74):
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

### 3.3 `src/lib/builders/anomalias.ts` — `picosDia`

Substitui (linhas 57-61):
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

---

## 4. Fora do escopo desta implementação

- `src/lib/builders/sla.ts` `clusters` — código morto, registrado em memória.
- `src/hooks/usePicoAlertas.ts` / `src/components/global/PicoAlertaModal.tsx` — cálculo (`count_os`/`zscore`) vem do backend Python, fora deste repositório TS, não verificável/corrigível aqui.
- Regra de "OS Concluída não conta pra equipe" (já implementada em ciclo anterior) e seus 5 casos ambíguos pendentes.
- Qualquer mudança de rota, permissão ou lógica de dados/negócio além dos 3 pontos listados.

---

## 5. Testes

- `src/lib/builders/dashboard.test.ts`: novo teste em `describe('clustersAtivos (Clusters de Falha)', ...)` — "não sinaliza bairro com muitas OS de Serviço" (espelha o teste existente de Instalação, linha 139-148), usando `tiposervico: 'SERVICO'` explícito (produz `_tipo === 'OUTRO'` — nenhum dos padrões de `getEquipeTipo` bate com essa string, cai no `else` final).
- `src/lib/builders/anomalias.test.ts`: novo teste em `describe('buildAnomalias — composição da anomalia de bairro', ...)` — "não sinaliza bairro com SLA estourado só por causa de concentração de Serviço" (espelha o teste existente de Instalação, linha 83-97), mesma convenção de `tiposervico: 'SERVICO'`.
- `src/lib/builders/anomalias.test.ts`: novo teste cobrindo `picosDia` — dia com muitas OS de Serviço/Instalação não deve gerar pico, dia com muitas OS de Manutenção deve gerar pico (Z-score).
- Suíte completa (`npm test`) deve continuar 100% verde — nenhum fixture existente testa `_tipo === 'OUTRO'`/Serviço nesses 3 pontos hoje, então nenhuma regressão esperada nos testes já existentes.
- Verificação manual no navegador: painel "Clusters de Falha" do Dashboard e seção de anomalias (bairro/pico diário) não devem mais sinalizar concentração de Instalação ou Serviço, só de Manutenção.

---

## 6. Arquivos afetados

- `src/lib/builders/dashboard.ts` — `clustersAtivos` exclui também `OUTRO`.
- `src/lib/builders/dashboard.test.ts` — novo teste.
- `src/lib/builders/anomalias.ts` — `bairrosAnomalia` exclui também `OUTRO`; `picosDia` ganha filtro novo (excluindo `INSTALACAO`/`OUTRO`).
- `src/lib/builders/anomalias.test.ts` — novos testes.
