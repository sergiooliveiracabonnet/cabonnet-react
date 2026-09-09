# DS Fase 4 — tracking vira token: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Colapsar as 164 ocorrências de `tracking-[...]` arbitrário em um token semântico `tracking-label`, deixando três exceções nomeadas e corrigindo um defeito silencioso no `PageHeader`.

**Architecture:** Um token CSS `--ls-label: 0.05em` na camada semântica do `index.css`, exposto como utility `tracking-label` via `letterSpacing` no `tailwind.config.js`. A varredura que impede regressão entra em `src/lib/typeScale.test.ts`, não em arquivo novo — tracking é a metade que faltou da Fase 2, não eixo novo.

**Tech Stack:** Tailwind CSS 3.4, Vitest, CSS custom properties. Sem dependência nova.

**Spec:** `docs/superpowers/specs/2026-09-09-ds-fase4-tracking-design.md`

## Global Constraints

- **Tailwind fica na 3.4.** v4 e shadcn/ui estão fora de escopo por decisão explícita do usuário.
- **Um eixo por fase.** Não tocar em `fontSize`, peso, cor ou espaçamento nesta fase.
- **O lado negativo do tracking não entra.** Os três overrides negativos são exceções nomeadas, não alvo de migração.
- **O teto da catraca nunca sobe.** `npm run audit:ds` reprova se `valoresArbitrarios` crescer.
- **Ícones só Phosphor** (não se aplica aqui, mas vale para qualquer arquivo tocado).
- **Comentários explicam POR QUÊ, não O QUÊ.**
- Rodar `npx tsc --noEmit` além de `npm run build` — o build não faz type-check.

## As três exceções nomeadas

Estes três `tracking-[...]` **permanecem** e são declarados no teste. Nenhuma task os migra:

| Arquivo | Classe | Razão |
|---|---|---|
| `src/components/layout/Sidebar.tsx:173` | `tracking-[0.08em]` | marca; deliberado |
| `src/components/layout/Navbar.tsx:86` | `tracking-[-0.015em]` | `text-title` não declara `letterSpacing` próprio |
| `src/features/dashboard/DashboardCommandCenter.tsx:90` | `tracking-[-0.04em]` | override consciente sobre o `-0.025em` do degrau `readout` |

---

### Task 1: O token existe e não se repete por densidade

**Files:**
- Modify: `src/index.css` (inserir bloco após o bloco `TIPO: PAREDE`)
- Modify: `tailwind.config.js` (novo bloco `letterSpacing`, após `fontSize`, que termina na linha 60)
- Test: `src/lib/typeScale.test.ts`

**Interfaces:**
- Produces: token CSS `--ls-label` e a utility Tailwind `tracking-label`. As Tasks 3, 4 e 5 dependem dela existir.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar ao final de `src/lib/typeScale.test.ts`:

```ts
describe('tracking é token, não valor solto', () => {
  it('o token existe e é declarado uma vez só', () => {
    // Em em, o valor acompanha o tamanho da fonte sozinho. Declarar por
    // densidade repetiria o mesmo número em dois lugares para nada.
    const css = readFileSync('src/index.css', 'utf8')
    expect(css).toMatch(/--ls-label:\s*0\.05em;/)
    expect(css.match(/--ls-label\s*:/g)).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run src/lib/typeScale.test.ts -t "o token existe"
```

Esperado: FAIL — `expected null to match /--ls-label:\s*0\.05em;/`

- [ ] **Step 3: Declarar o token**

Em `src/index.css`, logo **depois** do bloco `/* TIPO: PAREDE */` (que fecha após `--fs-readout-2xl: 86px;`), inserir:

```css
/* TIPO: TRACKING — nao varia com densidade
   O valor e em `em`, entao acompanha o tamanho da fonte sozinho. Um bloco por
   densidade repetiria o mesmo numero duas vezes sem ninguem ganhar nada. */
:root {
  --ls-label:        0.05em;  /* rotulo micro em caixa alta */
}
```

- [ ] **Step 4: Expor como utility**

Em `tailwind.config.js`, logo após o fechamento do bloco `fontSize` (linha 60, o `},` depois de `'readout-2xl'`), inserir:

```js
      // Espacamento entre letras. So o lado positivo e token: o negativo ja vem
      // embutido nos degraus headline e readout*, definidos acima.
      letterSpacing: {
        label: 'var(--ls-label)',
      },
```

- [ ] **Step 5: Rodar e ver passar**

```bash
npx vitest run src/lib/typeScale.test.ts -t "o token existe"
```

Esperado: PASS

> **Sobre a asserção 2 da spec** ("o token está declarado e resolve nos dois temas"): ela é satisfeita por construção, não por um teste de tema. O token é declarado uma vez em `:root`, fora de qualquer bloco de tema ou de densidade — logo vale nos dois temas por definição. A asserção de ocorrência única é o que garante isso, e é mais forte que testar cada tema separadamente.

- [ ] **Step 6: Confirmar que a utility é emitida**

```bash
npm run build && grep -c "tracking-label" dist/assets/*.css
```

Esperado: `0` — a classe ainda não é usada por ninguém, então o Tailwind não a emite. Isso é correto nesta etapa; a Task 3 a coloca em uso.

- [ ] **Step 7: Commit**

```bash
git add src/index.css tailwind.config.js src/lib/typeScale.test.ts
git commit -m "feat(ds): --ls-label, o token de tracking do rotulo micro"
```

---

### Task 2: A varredura que cobra (RED de propósito)

**Files:**
- Test: `src/lib/typeScale.test.ts`

**Interfaces:**
- Consumes: nada da Task 1 em código; roda contra o `src` inteiro.
- Produces: a constante `TRACKING_PERMITIDO`, lida pelas Tasks 3, 4 e 5 como definição de "pronto".

Esta task deixa a suíte **vermelha de propósito**. As Tasks 3–5 a levam ao verde. Commite mesmo vermelha: é o medidor de progresso da fase.

- [ ] **Step 1: Escrever as duas asserções**

No mesmo `describe('tracking é token, não valor solto', ...)` criado na Task 1, acrescentar antes do `it` existente:

```ts
  // As tres excecoes vivas do sistema. Qualquer outro tracking-[ e fuga.
  const TRACKING_PERMITIDO = new Map([
    ['src/components/layout/Sidebar.tsx', 'tracking-[0.08em]'],
    ['src/components/layout/Navbar.tsx', 'tracking-[-0.015em]'],
    ['src/features/dashboard/DashboardCommandCenter.tsx', 'tracking-[-0.04em]'],
  ])

  it('nenhum tracking avulso sobrou no JSX', () => {
    // Seis valores entre 0.04em e 0.09em para o mesmo rotulo em caixa alta nao
    // e escala, e deriva: ninguem escolheu a diferenca.
    const fugas: string[] = []
    for (const arquivo of tsx('src')) {
      const rel = arquivo.replace(/\\/g, '/')
      for (const m of readFileSync(arquivo, 'utf8').matchAll(/\btracking-\[[^\]]+\]/g)) {
        if (TRACKING_PERMITIDO.get(rel) === m[0]) continue
        fugas.push(`${rel}: ${m[0]}`)
      }
    }
    expect(fugas).toEqual([])
  })

  it('cada exceção declarada ainda existe onde foi declarada', () => {
    // Sem isto a lista vira paisagem: excecao para codigo que ja saiu continua
    // dando permissao a quem vier depois.
    for (const [arquivo, classe] of TRACKING_PERMITIDO) {
      expect(readFileSync(arquivo, 'utf8')).toContain(classe)
    }
  })
```

- [ ] **Step 2: Rodar e ver falhar com a conta certa**

```bash
npx vitest run src/lib/typeScale.test.ts -t "nenhum tracking avulso" 2>&1 | head -20
```

Esperado: FAIL, com 161 entradas em `fugas` — os 158 de caixa alta, os 2 do `LoginPage` e o `tracking-[-0.025em]` do `PageHeader`.

- [ ] **Step 3: Confirmar que as exceções não estão na lista**

```bash
npx vitest run src/lib/typeScale.test.ts -t "nenhum tracking avulso" 2>&1 | grep -cE "Sidebar.tsx: tracking-\[0.08em\]|Navbar.tsx: tracking-\[-0.015em\]|DashboardCommandCenter.tsx: tracking-\[-0.04em\]"
```

Esperado: `0`

- [ ] **Step 4: Commit (vermelho, deliberado)**

```bash
git add src/lib/typeScale.test.ts
git commit -m "test(ds): a varredura de tracking entra vermelha, com 161 fugas"
```

---

### Task 3: Os três primitivos de UI

**Files:**
- Modify: `src/components/ui/SectionLabel.tsx:14`
- Modify: `src/components/ui/SectionTitle.tsx:12`
- Modify: `src/components/ui/StatCard.tsx:101`

**Interfaces:**
- Consumes: a utility `tracking-label` da Task 1.

São a maior parte do alcance visual: migrá-los primeiro faz o resto da varredura render mais.

- [ ] **Step 1: `SectionLabel`**

Em `src/components/ui/SectionLabel.tsx`, linha 14, trocar `tracking-[0.09em]` por `tracking-label`:

```tsx
      <h2 className="text-caption font-semibold uppercase tracking-label text-secondary m-0">
```

- [ ] **Step 2: `SectionTitle`**

Em `src/components/ui/SectionTitle.tsx`, linha 12, trocar `tracking-[0.06em]` por `tracking-label`:

```tsx
                    uppercase tracking-label text-muted
```

- [ ] **Step 3: `StatCard`**

Em `src/components/ui/StatCard.tsx`, linha 101, trocar `tracking-[0.04em]` por `tracking-label`:

```tsx
        <span className="text-caption font-bold uppercase tracking-label text-muted">{title}:</span>
```

- [ ] **Step 4: Rodar os testes dos três componentes**

```bash
npx vitest run src/components/ui
```

Esperado: PASS. Nenhum teste de componente asserta tracking; se algum quebrar, é regressão de verdade — pare e investigue.

- [ ] **Step 5: Ver a varredura descer**

```bash
npx vitest run src/lib/typeScale.test.ts -t "nenhum tracking avulso" 2>&1 | grep -c "tracking-\["
```

Esperado: menos entradas que na Task 2 (os três primitivos saíram da lista). Ainda FAIL.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/SectionLabel.tsx src/components/ui/SectionTitle.tsx src/components/ui/StatCard.tsx
git commit -m "refactor(ds): os tres primitivos de rotulo adotam tracking-label"
```

---

### Task 4: O defeito do `PageHeader`

**Files:**
- Modify: `src/components/ui/PageHeader.tsx:20`
- Test: `src/components/ui/PageHeader.test.tsx`

**Interfaces:**
- Consumes: nada. Independente das Tasks 1 e 3.

O `h1` declara tamanho responsivo com tracking fixo. A partir de `sm`, o degrau `headline` traz `-0.015em` por definição — mas a utility arbitrária vence, e o valor do degrau **nunca se aplica**. Não há erro de build, de tipo ou de teste.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar **dentro do `describe('PageHeader', ...)` existente** em `src/components/ui/PageHeader.test.tsx`. O arquivo já importa `render` e `PageHeader`; `title` é a única prop obrigatória.

```tsx
it('deixa o degrau responsivo trazer o proprio tracking', () => {
  // text-subtitle e sm:text-headline tem trackings diferentes por definicao da
  // escala. Um tracking fixo no mesmo elemento anula os dois, em silencio.
  const { container } = render(<PageHeader title="Nível de Sinal" />)
  const h1 = container.querySelector('h1')

  expect(h1?.className).toContain('sm:text-headline')
  expect(h1?.className).not.toMatch(/tracking-\[/)
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run src/components/ui/PageHeader.test.tsx -t "degrau responsivo"
```

Esperado: FAIL — `expected "...tracking-[-0.025em]..." not to match /tracking-\[/`

- [ ] **Step 3: Remover o tracking fixo**

Em `src/components/ui/PageHeader.tsx`, linha 20, apagar `tracking-[-0.025em] ` (com o espaço à direita):

```tsx
        <h1 className={`text-subtitle sm:text-headline leading-tight font-semibold text-text ${hasTitleRow ? 'flex items-center gap-2' : ''}`}>
```

- [ ] **Step 4: Rodar e ver passar**

```bash
npx vitest run src/components/ui/PageHeader.test.tsx
```

Esperado: PASS, o arquivo inteiro.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/PageHeader.tsx src/components/ui/PageHeader.test.tsx
git commit -m "fix(ds): tracking fixo anulava o degrau responsivo do PageHeader"
```

---

### Task 5: A passada mecânica no resto

**Files:**
- Modify: os ~44 arquivos `.tsx` restantes com `tracking-[`

**Interfaces:**
- Consumes: `tracking-label` (Task 1) e `TRACKING_PERMITIDO` (Task 2) como definição de pronto.

- [ ] **Step 1: Migrar todos os valores positivos, exceto `0.08em`**

O `0.08em` fica de fora desta passada porque a ocorrência do `Sidebar.tsx` é exceção declarada. As outras quatro entram no passo seguinte.

```bash
grep -rl "tracking-\[" src --include=*.tsx \
  | xargs sed -i -E 's/tracking-\[0\.(03|04|05|06|07|09|14)em\]/tracking-label/g; s/tracking-\[0\.6px\]/tracking-label/g'
```

- [ ] **Step 2: Migrar os quatro `0.08em` que não são a marca**

```bash
grep -rl "tracking-\[0\.08em\]" src --include=*.tsx \
  | grep -v "src/components/layout/Sidebar.tsx" \
  | xargs sed -i -E 's/tracking-\[0\.08em\]/tracking-label/g'
```

- [ ] **Step 3: Conferir que só restam as três exceções**

Verificado na escrita do plano: **não há `tracking-[` em arquivos `.ts`** (só `.tsx`), então o `sed` acima alcança todas as ocorrências que o `audit:ds` conta. Se isso mudar, a conta de 293 na Task 6 não fecha.

```bash
grep -rn "tracking-\[" src --include=*.tsx
```

Esperado: exatamente três linhas — `Sidebar.tsx` com `[0.08em]`, `Navbar.tsx` com `[-0.015em]`, `DashboardCommandCenter.tsx` com `[-0.04em]`.

- [ ] **Step 4: A varredura fica verde**

```bash
npx vitest run src/lib/typeScale.test.ts
```

Esperado: PASS, o arquivo inteiro — incluindo `nenhum tracking avulso sobrou no JSX` e `cada exceção declarada ainda existe onde foi declarada`.

- [ ] **Step 5: Type-check e lint**

```bash
npx tsc --noEmit && npm run lint
```

Esperado: os dois limpos. O `sed` pode ter deixado espaço duplo em alguma `className`; o lint não reclama disso, mas se aparecer erro, corrija antes de seguir.

- [ ] **Step 6: Suíte inteira**

```bash
npm test
```

Esperado: PASS. Nenhum teste asserta tracking além dos que esta fase escreveu.

- [ ] **Step 7: Commit**

```bash
git add -A src
git commit -m "refactor(ds): os 161 tracking avulsos viram tracking-label"
```

---

### Task 6: A catraca desce e a fase fecha

**Files:**
- Modify: `scripts/audit-ds-baseline.json` (via script, não à mão)

**Interfaces:**
- Consumes: o `src` já migrado pelas Tasks 3–5.

- [ ] **Step 1: Ver o auditor pedir a catraca**

```bash
npm run audit:ds
```

Esperado: `↓ catraca: valoresArbitrarios está em 293, abaixo do teto 454 — rode "npm run audit:ds:catraca"`

Se o número não for 293, **pare**: a conta da spec não fechou e alguma ocorrência foi migrada ou perdida fora do previsto. Rode `grep -rn "tracking-\[" src --include=*.tsx` e compare com as três exceções.

- [ ] **Step 2: Baixar o teto**

```bash
npm run audit:ds:catraca
```

Esperado: `valoresArbitrarios: 454 → 293`. O `hexTolerados` deve seguir em `99 → 99`.

- [ ] **Step 3: Confirmar que o auditor passa limpo**

```bash
npm run audit:ds
```

Esperado: `audit:ds OK`, sem a linha `↓ catraca`.

- [ ] **Step 4: Build e verificação final**

```bash
npx tsc --noEmit && npm run lint && npm run build && npm test
```

Esperado: os quatro limpos.

- [ ] **Step 5: Confirmar que a utility é emitida agora**

```bash
grep -o "letter-spacing:[^;]*" dist/assets/*.css | sort -u | head
```

Esperado: aparece `letter-spacing:.05em` (ou `var(--ls-label)` resolvido) entre os valores emitidos.

- [ ] **Step 6: Commit**

```bash
git add scripts/audit-ds-baseline.json
git commit -m "chore(ds): catraca desce de 454 para 293 com a fase 4"
```

- [ ] **Step 7: Conferência visual — o passo que nenhum teste faz**

```bash
npm run dev
```

Nos **dois temas**, conferir onde o `SectionLabel` aparece (ele estreitou de `0.09em` para `0.05em`, a maior mudança da fase) e o `PageHeader` em largura `< sm` e `≥ sm`:

- `/` — dashboard
- `/ordens`
- `/graficos`
- `/fornecedor`

Se algum rótulo ficar apertado demais em caixa alta, **não ajuste o componente**: o valor é do token, e mudá-lo é decisão de sistema — volte à spec.

---

## Verificação final da fase

| Checagem | Esperado |
|---|---|
| `npx tsc --noEmit` | limpo |
| `npm run lint` | limpo |
| `npm run audit:ds` | `audit:ds OK`, sem pedir catraca |
| `npm test` | suíte inteira passando |
| `npm run build` | `letter-spacing` emitido |
| `grep -rn "tracking-\[" src --include=*.tsx` | exatamente 3 linhas |
| `valoresArbitrarios` | 293 |
