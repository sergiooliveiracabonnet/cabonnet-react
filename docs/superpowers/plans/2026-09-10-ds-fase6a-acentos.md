# DS Fase 6a — a paleta de acento: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar os oito acentos pelos valores medidos do design system, fazer nascer `--c-blue`, `--chart-1..6` e `--kpi-ink-*`, remover seis tokens semânticos mortos, e estender o teste de contraste para cobrir acento, tinta de KPI e série de gráfico.

**Architecture:** Os valores entram como primitivos novos (`--p-<matiz>-vivid` para o escuro, `--p-<matiz>-deep` para o claro, mais os de gráfico) e a camada semântica reaponta. `--c-primary` **não muda de valor** nesta fase — continua azul até a 6b, o que mantém a fase mecânica. As asserções novas entram no bloco de contraste que a Fase 5 criou em `designTokens.test.ts`.

**Tech Stack:** CSS custom properties, Tailwind CSS 3.4, Vitest. Sem dependência nova.

**Spec:** `docs/superpowers/specs/2026-09-10-ds-fase6a-acentos-design.md`

## Global Constraints

- **Nenhum arquivo `.tsx` é modificado.** Só `src/index.css`, `tailwind.config.js` e `src/lib/designTokens.test.ts`. Se um `.tsx` precisar mudar, o escopo vazou para a 6b.
- **`--c-primary` não muda de valor.** Continua apontando para o azul. A virada para laranja é da 6b.
- **Um eixo por fase.** Não tocar em superfície, borda, texto, sombra, `fontSize`, peso ou tracking.
- **Valor cru nunca aparece na camada semântica.** Todo `--c-*` nos blocos `SEMANTICOS` deve ser exatamente `var(--p-alguma-coisa)`.
- **Todo primitivo declarado precisa ser usado.** Por isso adicionar, reapontar e remover órfãos são a mesma task.
- **Tailwind fica na 3.4.** v4 e shadcn/ui fora de escopo por decisão explícita.
- **Barras de contraste:** 4.5:1 para acento como texto; 4.5:1 para tinta de KPI sobre o acento; **3:1** para série de gráfico contra a superfície. A borda não é cobrada — ver a spec da Fase 5.
- **Ícones só Phosphor** (não se aplica aqui, mas vale para qualquer arquivo tocado).
- **Comentários explicam POR QUÊ, não O QUÊ.**
- Rodar `npx tsc --noEmit` além de `npm run build` — o build não faz type-check.

## A paleta de destino

Acentos, um valor por tema, cada um servindo a texto e a preenchimento:

| Matiz | `--p-*-vivid` (escuro) | `--p-*-deep` (claro) |
|---|---|---|
| orange | `#FF5A1F` = `255 90 31` | `#CB3500` = `203 53 0` |
| blue | `#5084F0` = `80 132 240` | `#1F61EC` = `31 97 236` |
| green | `#11C7B0` = `17 199 176` | `#0B7B6D` = `11 123 109` |
| yellow | `#F5C915` = `245 201 21` | `#826A06` = `130 106 6` |
| red | `#FF6B6B` = `255 107 107` | `#DD0000` = `221 0 0` |
| purple | `#9A7AFF` = `154 122 255` | `#7245FF` = `114 69 255` |
| cyan | `#22D3EE` = `34 211 238` | `#0A7888` = `10 120 136` |
| teal | `#2DD4BF` = `45 212 191` | `#197A6D` = `25 122 109` |

Série de gráfico, escala separada, cobrada em 3:1:

| Token | Escuro | Claro |
|---|---|---|
| `--chart-1` | `255 90 31` | `255 69 2` |
| `--chart-2` | `74 128 240` | `40 100 232` |
| `--chart-3` | `17 199 176` | `14 155 137` |
| `--chart-4` | `245 201 21` | `167 133 3` |
| `--chart-5` | `255 107 107` | `224 49 49` |
| `--chart-6` | `154 122 255` | `124 77 255` |

Tinta de KPI: `--p-paper-7` (`23 23 23`) nos quatro do escuro, `--p-white` nos quatro do claro.

## Os tokens que saem

Seis semânticos, todos sem leitor: `--c-pink`, `--c-primary-light`, `--c-grp-erp`, `--c-grp-ops`, `--c-grp-anal`, `--c-grp-infra`.

Os primitivos que ficam órfãos saem junto, por exigência do teste da Fase 1: toda a escala `--p-blue-*`, `--p-cyan-*`, `--p-green-*`, `--p-yellow-*`, `--p-red-*`, `--p-orange-*`, `--p-violet-*`, `--p-pink-*` e `--p-teal-*` é substituída.

`--c-primary-dark` fica: tem um consumidor.

---

### Task 1: A medida de acento entra e reprova o que está no ar

**Files:**
- Modify: `src/lib/designTokens.test.ts` (acrescentar ao final)

**Interfaces:**
- Consumes: `luminancia(rgb)`, `contraste(a, b)` e `tokens`, todos já definidos no arquivo pela Fase 5; `resolveTheme(tokens, tema)` devolve `{ '--c-orange': '251 146 60', ... }`.
- Produces: o predicado `ehAcento`, usado pelas Tasks 2 e 3 como definição de pronto.

Esta task deixa a suíte **vermelha de propósito**. Commite mesmo vermelha: é a prova de que o defeito existe antes de a paleta mudar.

- [ ] **Step 1: Escrever a asserção de acento como texto**

Acrescentar ao final de `src/lib/designTokens.test.ts`:

```ts
// Acento e o que pinta significado: marca, estado e categoria. Derivado do
// nome, como as superficies — acento novo entra na varredura sozinho.
// Os --c-grp-* nao aparecem aqui porque a Task 2 os remove: ninguem os le.
const ehAcento = (n: string) =>
  /^--c-(primary|blue|green|yellow|red|orange|purple|cyan|teal)$/.test(n)

describe('contraste de acento', () => {
  it.each(['dark', 'light'] as const)('%s: todo acento atinge 4.5:1 como texto', tema => {
    // Sao 198 text-primary no JSX: acento e texto com muita frequencia. A barra
    // vale contra a pior superficie, nao contra o fundo base.
    const resolvidos = resolveTheme(tokens, tema)
    const acentos = Object.keys(resolvidos).filter(ehAcento)
    const superficies = Object.keys(resolvidos).filter(ehSuperficie)

    expect(acentos.length, 'a varredura de acento esvaziou').toBeGreaterThanOrEqual(8)

    const reprovados: string[] = []
    for (const a of acentos) {
      for (const s of superficies) {
        const r = contraste(resolvidos[a], resolvidos[s])
        if (r < 4.5) reprovados.push(`${a} sobre ${s}: ${r.toFixed(2)}:1`)
      }
    }
    expect(reprovados).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run src/lib/designTokens.test.ts -t "todo acento atinge" 2>&1 | grep -c "sobre --c-"
```

Esperado: uma contagem maior que zero, com falha nos dois temas. As reprovações conhecidas são, no claro, `--c-green` (2.88:1 no pior caso), `--c-cyan` (3.22:1), `--c-red` (4.23:1) e `--c-yellow` (4.31:1); no escuro, `--c-primary` (4.43:1).

Se **nenhum** par reprovar, pare: a paleta divergiu do que a spec mediu.

- [ ] **Step 3: Commit (vermelho, deliberado)**

```bash
git add src/lib/designTokens.test.ts
git commit -m "test(ds): a medida de acento entra e reprova cinco cores"
```

---

### Task 2: A paleta de acento do design system substitui a de hoje

**Files:**
- Modify: `src/index.css` — bloco `PRIMITIVOS`, `SEMANTICOS: DARK`, `SEMANTICOS: LIGHT`
- Modify: `tailwind.config.js` — bloco `colors`
- Modify: `src/lib/designTokens.test.ts` — tabelas `DARK` e `LIGHT`

**Interfaces:**
- Consumes: a asserção `ehAcento` da Task 1, que vira o critério de pronto.
- Produces: os primitivos `--p-<matiz>-vivid` e `--p-<matiz>-deep`, e o token semântico `--c-blue`. A Fase 6b migra 198 ocorrências para `blue`; ele precisa existir antes.

- [ ] **Step 1: Trocar a escala de acento nos primitivos**

Em `src/index.css`, no bloco `/* PRIMITIVOS */`, **remover** todos os primitivos de acento de hoje — as escalas `--p-blue-*` (4 linhas), `--p-cyan-*` (2), `--p-green-*` (2), `--p-yellow-*` (2), `--p-red-*` (2), `--p-orange-*` (2), `--p-violet-*` (3), `--p-pink-*` (2) e `--p-teal-*` (2) — e inserir no lugar:

```css
  /* Acento: um valor por tema, cada um servindo aos dois papeis. O `vivid` e
     texto legivel sobre superficie escura e aceita tinta quase-preta; o `deep`
     e texto legivel sobre superficie clara e aceita tinta branca. O claro ja
     era escurecido antes desta fase (--p-orange-700 e nao 400); o que muda e
     o valor sair de medicao em vez de intuicao. */
  --p-orange-vivid: 255  90  31;
  --p-orange-deep:  203  53   0;
  --p-blue-vivid:    80 132 240;
  --p-blue-deep:     31  97 236;
  --p-green-vivid:   17 199 176;
  --p-green-deep:    11 123 109;
  --p-yellow-vivid: 245 201  21;
  --p-yellow-deep:  130 106   6;
  --p-red-vivid:    255 107 107;
  --p-red-deep:     221   0   0;
  --p-purple-vivid: 154 122 255;
  --p-purple-deep:  114  69 255;
  --p-cyan-vivid:    34 211 238;
  --p-cyan-deep:     10 120 136;
  --p-teal-vivid:    45 212 191;
  --p-teal-deep:     25 122 109;

  /* Serie de grafico: escala categorica, independente da semantica. Nao e
     texto, entao nao vai a 4.5:1 — mas e objeto grafico necessario para
     entender o conteudo, entao vai a 3:1 (WCAG 1.4.11). Tres valores claros do
     design system ficavam abaixo; o amarelo dava 1.35:1 sobre branco. */
  --p-chart-1-vivid: 255  90  31;
  --p-chart-1-deep:  255  69   2;
  --p-chart-2-vivid:  74 128 240;
  --p-chart-2-deep:   40 100 232;
  --p-chart-3-vivid:  17 199 176;
  --p-chart-3-deep:   14 155 137;
  --p-chart-4-vivid: 245 201  21;
  --p-chart-4-deep:  167 133   3;
  --p-chart-5-vivid: 255 107 107;
  --p-chart-5-deep:  224  49  49;
  --p-chart-6-vivid: 154 122 255;
  --p-chart-6-deep:  124  77 255;
```

Não tocar em `--p-carbon-*`, `--p-paper-*` nem `--p-white`: são da Fase 5.

- [ ] **Step 2: Reapontar o bloco `SEMANTICOS: DARK`**

Substituir as linhas de marca e de estado. **`--c-primary` continua azul**; o que muda é apontar para o primitivo novo.

```css
  /* Marca. O primary segue azul nesta fase: a virada para laranja e da 6b,
     depois da auditoria dos 564 usos. */
  --c-primary:       var(--p-blue-vivid);
  --c-primary-dark:  var(--p-blue-deep);
  --c-blue:          var(--p-blue-vivid);
  --c-cyan:          var(--p-cyan-vivid);

  /* Estado */
  --c-green:         var(--p-green-vivid);
  --c-yellow:        var(--p-yellow-vivid);
  --c-red:           var(--p-red-vivid);
  --c-orange:        var(--p-orange-vivid);
  --c-purple:        var(--p-purple-vivid);
  --c-teal:          var(--p-teal-vivid);

  /* Serie de grafico, para a Fase 7 */
  --c-chart-1:       var(--p-chart-1-vivid);
  --c-chart-2:       var(--p-chart-2-vivid);
  --c-chart-3:       var(--p-chart-3-vivid);
  --c-chart-4:       var(--p-chart-4-vivid);
  --c-chart-5:       var(--p-chart-5-vivid);
  --c-chart-6:       var(--p-chart-6-vivid);

  /* Tinta sobre KPI preenchido. No escuro o acento e vivido, entao a tinta e
     escura: branco reprova nos quatro, de 1.59:1 a 3.56:1. */
  --c-kpi-ink-orange: var(--p-paper-7);
  --c-kpi-ink-blue:   var(--p-paper-7);
  --c-kpi-ink-green:  var(--p-paper-7);
  --c-kpi-ink-yellow: var(--p-paper-7);
```

**Remover** deste bloco: `--c-primary-light`, `--c-pink`, e os quatro `--c-grp-*` com o comentário que os acompanha.

- [ ] **Step 3: Reapontar o bloco `SEMANTICOS: LIGHT`**

```css
  --c-primary:       var(--p-blue-deep);
  --c-primary-dark:  var(--p-blue-deep);
  --c-blue:          var(--p-blue-deep);
  --c-cyan:          var(--p-cyan-deep);

  --c-green:         var(--p-green-deep);
  --c-yellow:        var(--p-yellow-deep);
  --c-red:           var(--p-red-deep);
  --c-orange:        var(--p-orange-deep);
  --c-purple:        var(--p-purple-deep);
  --c-teal:          var(--p-teal-deep);

  --c-chart-1:       var(--p-chart-1-deep);
  --c-chart-2:       var(--p-chart-2-deep);
  --c-chart-3:       var(--p-chart-3-deep);
  --c-chart-4:       var(--p-chart-4-deep);
  --c-chart-5:       var(--p-chart-5-deep);
  --c-chart-6:       var(--p-chart-6-deep);

  /* No claro o acento foi escurecido para passar como texto, entao a tinta e
     branca: a escura reprova nos quatro, de 3.40:1 a 3.47:1. */
  --c-kpi-ink-orange: var(--p-white);
  --c-kpi-ink-blue:   var(--p-white);
  --c-kpi-ink-green:  var(--p-white);
  --c-kpi-ink-yellow: var(--p-white);
```

**Remover** deste bloco: `--c-primary-light`, `--c-pink`, e os quatro `--c-grp-*`.

Note que `--c-primary-dark` aponta para o mesmo `--p-blue-deep` que `--c-primary` no claro. Isso é deliberado: a escala de três degraus do azul deixou de existir e o único consumidor de `primary-dark` não depende de ele ser mais escuro que `primary`. A 6b decide se ele sobrevive.

- [ ] **Step 4: Expor `blue` e os tokens novos no Tailwind**

Em `tailwind.config.js`, no bloco `colors`, **remover** as linhas `'primary-light'` e `pink`, e acrescentar:

```js
        blue:           'rgb(var(--c-blue) / <alpha-value>)',
        'chart-1':      'rgb(var(--c-chart-1) / <alpha-value>)',
        'chart-2':      'rgb(var(--c-chart-2) / <alpha-value>)',
        'chart-3':      'rgb(var(--c-chart-3) / <alpha-value>)',
        'chart-4':      'rgb(var(--c-chart-4) / <alpha-value>)',
        'chart-5':      'rgb(var(--c-chart-5) / <alpha-value>)',
        'chart-6':      'rgb(var(--c-chart-6) / <alpha-value>)',
        'kpi-ink-orange': 'rgb(var(--c-kpi-ink-orange) / <alpha-value>)',
        'kpi-ink-blue':   'rgb(var(--c-kpi-ink-blue) / <alpha-value>)',
        'kpi-ink-green':  'rgb(var(--c-kpi-ink-green) / <alpha-value>)',
        'kpi-ink-yellow': 'rgb(var(--c-kpi-ink-yellow) / <alpha-value>)',
```

- [ ] **Step 5: O contraste de acento fica verde**

```bash
npx vitest run src/lib/designTokens.test.ts -t "todo acento atinge"
```

Esperado: PASS nos dois temas.

- [ ] **Step 6: A arquitetura de três camadas segue intacta**

```bash
npx vitest run src/lib/designTokens.test.ts --reporter=verbose 2>&1 | grep "três camadas"
```

Esperado: as quatro asserções passando. Se `todo primitivo declarado é usado por alguém` falhar, sobrou primitivo de acento antigo declarado sem uso — remova-o.

- [ ] **Step 7: Commit da migração (a trava de valores fica vermelha)**

```bash
git add src/index.css tailwind.config.js
git commit -m "feat(ds): os oito acentos adotam a paleta medida do design system"
```

- [ ] **Step 8: Ver a trava disparar e conferir a conta**

```bash
npx vitest run src/lib/designTokens.test.ts -t "valores resolvidos" 2>&1 | grep -c "AssertionError"
```

Esperado: **30**. São 15 por tema, de duas naturezas:

- **9 mudam de valor:** `--c-primary`, `--c-primary-dark`, `--c-cyan`, `--c-green`, `--c-yellow`, `--c-red`, `--c-orange`, `--c-purple`, `--c-teal`.
- **6 deixam de existir** e a tabela ainda os cobra, então a asserção recebe `undefined`: `--c-primary-light`, `--c-pink` e os quatro `--c-grp-*`.

`--c-blue` não entra na conta: é token novo, e a tabela ainda não o menciona.

Se o número não for 30, compare a tabela do teste com os blocos do CSS antes de seguir.

- [ ] **Step 9: Atualizar a trava**

Em `src/lib/designTokens.test.ts`, na tabela `const DARK`, trocar os valores de acento e **remover** as linhas `'--c-primary-light'`, `'--c-pink'` e as quatro `'--c-grp-*'`:

```ts
  '--c-primary': '80 132 240',
  '--c-primary-dark': '31 97 236',
  '--c-blue': '80 132 240',
  '--c-cyan': '34 211 238',
  '--c-green': '17 199 176',
  '--c-yellow': '245 201 21',
  '--c-red': '255 107 107',
  '--c-orange': '255 90 31',
  '--c-purple': '154 122 255',
  '--c-teal': '45 212 191',
```

E na tabela `const LIGHT`, o mesmo tratamento:

```ts
  '--c-primary': '31 97 236',
  '--c-primary-dark': '31 97 236',
  '--c-blue': '31 97 236',
  '--c-cyan': '10 120 136',
  '--c-green': '11 123 109',
  '--c-yellow': '130 106 6',
  '--c-red': '221 0 0',
  '--c-orange': '203 53 0',
  '--c-purple': '114 69 255',
  '--c-teal': '25 122 109',
```

Não acrescentar os `--c-chart-*` nem os `--c-kpi-ink-*` a essas tabelas: a Task 3 os cobre com asserções próprias, e duplicar o valor em dois lugares é o que a Fase 4 aprendeu a não fazer.

- [ ] **Step 10: O arquivo inteiro fica verde**

```bash
npx vitest run src/lib/designTokens.test.ts
```

Esperado: PASS, tudo.

- [ ] **Step 11: Commit da trava, separado de propósito**

```bash
git add src/lib/designTokens.test.ts
git commit -m "chore(ds): a trava de valores resolvidos registra a paleta de acento"
```

---

### Task 3: Tinta de KPI, série de gráfico e o fim do token morto

**Files:**
- Test: `src/lib/designTokens.test.ts`

**Interfaces:**
- Consumes: os tokens `--c-chart-*` e `--c-kpi-ink-*` criados na Task 2, e o predicado `ehAcento` da Task 1.
- Produces: nada para fases seguintes além das travas.

As três asserções desta task já devem passar assim que escritas — a Task 2 criou os valores corretos. Elas existem para que a Fase 7, ao consumir esses tokens, não possa afrouxá-los sem que o teste reclame.

- [ ] **Step 1: Escrever as três asserções**

Acrescentar ao final de `src/lib/designTokens.test.ts`:

```ts
describe('tinta de KPI e serie de grafico', () => {
  it.each(['dark', 'light'] as const)('%s: a tinta de KPI passa sobre o acento', tema => {
    // O par vem do sufixo: --c-kpi-ink-orange e medido contra --c-orange.
    // A escolha nao e preferencia — a tinta oposta reprova nos oito casos.
    const resolvidos = resolveTheme(tokens, tema)
    const tintas = Object.keys(resolvidos).filter(n => n.startsWith('--c-kpi-ink-'))

    expect(tintas.length, 'a varredura de tinta esvaziou').toBe(4)

    for (const tinta of tintas) {
      const acento = tinta.replace('--c-kpi-ink-', '--c-')
      expect(resolvidos[acento], `${tinta} nao tem acento ${acento}`).toBeDefined()
      const r = contraste(resolvidos[tinta], resolvidos[acento])
      expect(r, `${tinta} sobre ${acento}: ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it.each(['dark', 'light'] as const)('%s: a serie de grafico se ve e se distingue', tema => {
    // Serie nao e texto, entao nao vai a 4.5:1. Mas e objeto grafico necessario
    // para entender o conteudo (WCAG 1.4.11), entao vai a 3:1 — o amarelo do
    // design system dava 1.35:1 sobre branco, uma barra que nao aparecia.
    const resolvidos = resolveTheme(tokens, tema)
    const series = Object.keys(resolvidos).filter(n => /^--c-chart-\d$/.test(n))
    const superficies = Object.keys(resolvidos).filter(ehSuperficie)

    expect(series.length).toBe(6)
    expect(new Set(series.map(s => resolvidos[s])).size, 'duas series com a mesma cor').toBe(6)

    const invisiveis: string[] = []
    for (const serie of series) {
      for (const s of superficies) {
        const r = contraste(resolvidos[serie], resolvidos[s])
        if (r < 3) invisiveis.push(`${serie} sobre ${s}: ${r.toFixed(2)}:1`)
      }
    }
    expect(invisiveis).toEqual([])
  })

  it('todo acento declarado e consumido por alguem', () => {
    // Os --c-grp-* eram declarados, corrigidos pela Fase 1 e lidos por ninguem:
    // as classes .grp-* do proprio index.css usam rgba cravado. Token sem
    // leitor nao e sistema, e paisagem.
    const css = readFileSync('src/index.css', 'utf8')
    const config = readFileSync('tailwind.config.js', 'utf8')
    const resolvidos = resolveTheme(tokens, 'dark')

    const orfaos = Object.keys(resolvidos)
      .filter(ehAcento)
      .filter(nome => {
        const usos = (css.match(new RegExp(`var\\(${nome}\\)`, 'g')) ?? []).length
        return usos === 0 && !config.includes(`var(${nome})`)
      })
    expect(orfaos).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar e ver passar**

```bash
npx vitest run src/lib/designTokens.test.ts -t "tinta de KPI e serie"
```

Esperado: PASS nos cinco casos. Se `a tinta de KPI passa` falhar, o par tinta/acento não bate — confira que `--c-kpi-ink-blue` existe e que `--c-blue` foi criado na Task 2.

- [ ] **Step 3: Confirmar que a asserção de órfão pega de verdade**

Teste da trava, sem commitar: acrescente temporariamente `--c-magenta: var(--p-red-vivid);` aos dois blocos semânticos e ao `ehAcento`, rode, e veja `todo acento declarado e consumido` reprovar. Depois desfaça.

```bash
git diff --stat src/index.css
```

Esperado após desfazer: sem alterações pendentes em `src/index.css`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/designTokens.test.ts
git commit -m "test(ds): tinta de KPI, serie de grafico e a trava de token sem leitor"
```

---

### Task 4: Verificação e conferência visual

**Files:** nenhum — esta task só verifica.

**Interfaces:**
- Consumes: o resultado das Tasks 1 a 3.

- [ ] **Step 1: A bateria completa**

```bash
npx tsc --noEmit && npm run lint && npm run build && npm test
```

Esperado: os quatro limpos. A suíte tinha 951 testes ao fim da Fase 5; agora tem 951 mais os sete casos novos — dois de acento, dois de tinta, dois de série e um de órfão.

- [ ] **Step 2: A catraca não se move**

```bash
npm run audit:ds
```

Esperado: `audit:ds OK`, **sem** a linha `↓ catraca`. Esta fase troca valor de token, não a contagem de valores arbitrários.

- [ ] **Step 3: Confirmar que nenhum `.tsx` foi tocado**

```bash
git diff --name-only main...HEAD -- 'src/**/*.tsx'
```

Esperado: saída vazia. Qualquer `.tsx` aqui significa que a 6b vazou para dentro desta fase.

- [ ] **Step 4: Confirmar que `--c-primary` continua azul**

```bash
npx vitest run src/lib/designTokens.test.ts -t "valores resolvidos" --reporter=verbose 2>&1 | grep "c-primary ="
```

Esperado: `dark --c-primary = 80 132 240` e `light --c-primary = 31 97 236`. Se algum deles for `255 90 31`, a virada da 6b entrou por engano.

- [ ] **Step 5: Conferência visual nos dois temas**

```bash
npm run dev
```

Atenção: isso sobe o Python como subprocesso, e com ele o bot e o notificador do Telegram, que enviam mensagem para os grupos reais. Confirme com o responsável antes.

Em `/`, `/ordens`, `/graficos` e `/fornecedor`:

| O que olhar | Esperado |
|---|---|
| Tema claro | verde, ciano, vermelho e amarelo **escurecem de forma perceptível** |
| Amarelo no claro | vira um ocre escuro, `#826A06` — é a mudança mais forte da fase |
| Tema escuro | quase igual; só o azul muda, em 2% de luminosidade |
| Botão primário | continua **azul** nos dois temas — se estiver laranja, a 6b vazou |
| Badge de status | verde/vermelho/amarelo mudam de tom, mas seguem distinguíveis entre si |

- [ ] **Step 6: Conferir no navegador, não só no teste**

Com o DevTools aberto, nos dois temas:

```js
getComputedStyle(document.documentElement).getPropertyValue('--c-yellow')
```

Esperado: ` 245 201 21` no escuro, ` 130 106 6` no claro.

---

## Verificação final da fase

| Checagem | Esperado |
|---|---|
| `npx tsc --noEmit` | limpo |
| `npm run lint` | limpo |
| `npm run audit:ds` | `audit:ds OK`, sem pedir catraca |
| `npm test` | suíte inteira passando |
| `git diff --name-only main...HEAD -- 'src/**/*.tsx'` | vazio |
| `--c-primary` | azul nos dois temas |
| Acentos que reprovavam AA | zero |
| Séries de gráfico abaixo de 3:1 | zero |
| Tokens semânticos sem leitor | zero |
