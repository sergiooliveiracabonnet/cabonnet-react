# DS Fase 5 — superfície e texto: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar as seis superfícies, a borda, os quatro níveis de texto e as três sombras para a paleta do design system de 2026-09-01, corrigindo de passagem uma reprovação de contraste AA que está em produção, e trancar o resultado com um teste que mede todos os pares texto × superfície.

**Architecture:** Os valores do DS entram como primitivos novos (`--p-carbon-0..9` no escuro, `--p-paper-0..7` no claro); a camada semântica `--c-*` reaponta para eles. Nenhum `.tsx` muda. As sombras vão para a camada de componente, junto com `--c-border-hairline`, porque a camada semântica é proibida de conter valor cru. O teste de contraste entra em `src/lib/designTokens.test.ts` e usa o `resolveTheme()` que já existe.

**Tech Stack:** CSS custom properties, Tailwind CSS 3.4, Vitest. Sem dependência nova.

**Spec:** `docs/superpowers/specs/2026-09-09-ds-fase5-superficie-texto-design.md`

## Global Constraints

- **Nenhum arquivo `.tsx` ou `.ts` de aplicação é modificado.** Só `src/index.css`, `tailwind.config.js` e `src/lib/designTokens.test.ts`. Se um `.tsx` precisar mudar, o escopo vazou.
- **Um eixo por fase.** Não tocar em `--c-primary`, nos acentos (orange, blue, green, yellow, red, purple, pink, teal, cyan), nos `--c-grp-*`, nem em `fontSize`, peso ou tracking.
- **Valor cru nunca aparece na camada semântica.** Todo `--c-*` nos blocos `SEMANTICOS` deve ser exatamente `var(--p-alguma-coisa)` — `designTokens.test.ts` reprova o contrário.
- **Todo primitivo declarado precisa ser usado.** Primitivo órfão reprova. Por isso adicionar e reapontar são a mesma task.
- **Tailwind fica na 3.4.** v4 e shadcn/ui fora de escopo por decisão explícita.
- **A barra de contraste é WCAG AA:** 4.5:1 para texto normal. `--c-disabled` é isento por WCAG 1.4.3.
- **A borda não é cobrada em 3:1.** Medido, fica entre 1.06:1 e 1.35:1; é separador decorativo. Ver a spec, seção "Por que a borda não é cobrada em 3:1".
- **Ícones só Phosphor** (não se aplica aqui, mas vale para qualquer arquivo tocado).
- **Comentários explicam POR QUÊ, não O QUÊ.**
- Rodar `npx tsc --noEmit` além de `npm run build` — o build não faz type-check.

## A paleta de destino

Tudo abaixo vem do commit `e441dd1` da branch `origin/archive/design-system-2026-09-historia-original`, com uma única alteração: `#6E6E6E` vira `#6D6D6D` no texto atenuado do claro, para passar AA sobre a superfície ativa.

| Escuro | Hex | RGB | Papel |
|---|---|---|---|
| `--p-carbon-0` | `#020202` | `2 2 2` | fundo |
| `--p-carbon-1` | `#080808` | `8 8 8` | shell |
| `--p-carbon-2` | `#0C0C0C` | `12 12 12` | card |
| `--p-carbon-3` | `#121212` | `18 18 18` | popover |
| `--p-carbon-4` | `#181818` | `24 24 24` | hover |
| `--p-carbon-5` | `#202020` | `32 32 32` | ativo |
| `--p-carbon-6` | `#252525` | `37 37 37` | borda |
| `--p-carbon-7` | `#505050` | `80 80 80` | texto desabilitado |
| `--p-carbon-8` | `#8A8A8A` | `138 138 138` | texto atenuado |
| `--p-carbon-9` | `#B5B5B5` | `181 181 181` | texto secundário |

| Claro | Hex | RGB | Papel |
|---|---|---|---|
| `--p-paper-0` | `#F3F4F6` | `243 244 246` | fundo |
| `--p-paper-1` | `#F6F7F8` | `246 247 248` | hover |
| `--p-paper-2` | `#EEF0F2` | `238 240 242` | ativo |
| `--p-paper-3` | `#E8E8E8` | `232 232 232` | borda |
| `--p-paper-4` | `#A5A5A5` | `165 165 165` | texto desabilitado |
| `--p-paper-5` | `#6D6D6D` | `109 109 109` | texto atenuado |
| `--p-paper-6` | `#444444` | `68 68 68` | texto secundário |
| `--p-paper-7` | `#171717` | `23 23 23` | texto |

O branco das superfícies 1 a 3 do claro e o branco do texto do escuro usam o `--p-white` que já existe.

## Os primitivos que saem

Todos os neutros de hoje ficam órfãos e devem ser removidos na mesma task, ou o teste `todo primitivo declarado é usado por alguém` reprova. Verificado: cada um tem 1 ou 2 usos, todos na camada semântica.

`--p-zinc-950`, `--p-zinc-900`, `--p-zinc-800`, `--p-zinc-700`, `--p-zinc-600`, `--p-zinc-500`, `--p-zinc-400`, `--p-zinc-300`, `--p-zinc-200`, `--p-zinc-100`, `--p-zinc-50`, `--p-gray-50`, `--p-gray-100`, `--p-gray-200`.

Os `--p-carbon-1..4` de hoje são redefinidos, não removidos. O `--p-white` fica — a camada de componente o usa em três lugares.

---

### Task 1: A medida de contraste entra e reprova o que está no ar

**Files:**
- Modify: `src/lib/designTokens.test.ts` (acrescentar ao final)

**Interfaces:**
- Consumes: `resolveTheme(tokens, tema)` e `lerIndexCss()`, ambos já importados no topo do arquivo; `resolveTheme` devolve um objeto `{ '--c-bg': '9 9 11', ... }` com os valores finais em RGB separados por espaço.
- Produces: as funções `luminancia(rgb)` e `contraste(a, b)`, e os predicados `ehSuperficie` / `ehTextoAtivo`. A Task 2 depende deste teste existir para provar que a migração conserta o defeito.

Esta task deixa a suíte **vermelha de propósito**, com exatamente duas falhas — as duas que estão em produção. Commite mesmo vermelha: é a prova de que o problema existe antes de a paleta mudar.

- [ ] **Step 1: Escrever o bloco de contraste**

Acrescentar ao final de `src/lib/designTokens.test.ts`:

```ts
// Formula de luminancia relativa e de razao de contraste da WCAG 2.2,
// definicoes 1.4.3 e 1.4.11. Os valores chegam como "9 9 11" do resolveTheme.
function luminancia(rgb: string): number {
  const [r, g, b] = rgb.split(' ').map(Number).map(v => {
    const s = v / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contraste(a: string, b: string): number {
  const la = luminancia(a)
  const lb = luminancia(b)
  const [alto, baixo] = la > lb ? [la, lb] : [lb, la]
  return (alto + 0.05) / (baixo + 0.05)
}

// Derivado do nome, nao escrito a mao: superficie nova entra na varredura
// sozinha. As contagens minimas abaixo sao o que impede a lista de esvaziar
// em silencio depois de um rename.
const ehSuperficie = (n: string) => /^--c-(bg|elevated|surface|card)(-|$)/.test(n)
const ehTextoAtivo = (n: string) => /^--c-(text|secondary|muted)$/.test(n)

describe('contraste de texto sobre superficie', () => {
  it.each(['dark', 'light'] as const)('%s: todo par atinge 4.5:1', tema => {
    // O comentario do design system media cada texto contra UM fundo. O par
    // que reprova e sempre o extremo: atenuado sobre a superficie ativa.
    const resolvidos = resolveTheme(tokens, tema)
    const superficies = Object.keys(resolvidos).filter(ehSuperficie)
    const textos = Object.keys(resolvidos).filter(ehTextoAtivo)

    expect(superficies.length, 'a varredura de superficie esvaziou').toBeGreaterThanOrEqual(6)
    expect(textos.length, 'a varredura de texto esvaziou').toBe(3)

    const reprovados: string[] = []
    for (const t of textos) {
      for (const s of superficies) {
        const r = contraste(resolvidos[t], resolvidos[s])
        if (r < 4.5) reprovados.push(`${t} sobre ${s}: ${r.toFixed(2)}:1`)
      }
    }
    expect(reprovados).toEqual([])
  })

  it.each(['dark', 'light'] as const)('%s: a borda nao some dentro da superficie', tema => {
    // Borda com o mesmo valor do fundo desaparece sem erro nenhum. Nao se
    // cobra 3:1 aqui: medida, a borda fica em 1.06-1.35:1 nos dois temas, e
    // e separador decorativo, nao o que identifica o componente.
    const resolvidos = resolveTheme(tokens, tema)
    const borda = resolvidos['--c-border']
    for (const s of Object.keys(resolvidos).filter(ehSuperficie)) {
      expect(resolvidos[s], `--c-border igual a ${s}`).not.toBe(borda)
    }
  })
})
```

- [ ] **Step 2: Rodar e ver falhar com a conta certa**

```bash
npx vitest run src/lib/designTokens.test.ts -t "todo par atinge"
```

Esperado: **2 falhas**, uma por tema, com estas linhas em `reprovados`:

```
dark:  --c-muted sobre --c-card-highest: 3.32:1
light: --c-muted sobre --c-card-highest: 3.90:1
```

Se aparecer qualquer outro par, **pare**: a paleta divergiu do que a spec mediu.

- [ ] **Step 3: Confirmar que a asserção da borda já passa hoje**

```bash
npx vitest run src/lib/designTokens.test.ts -t "a borda nao some"
```

Esperado: PASS nos dois temas. Ela é uma trava preventiva, não um defeito atual.

- [ ] **Step 4: Commit (vermelho, deliberado)**

```bash
git add src/lib/designTokens.test.ts
git commit -m "test(ds): a medida de contraste entra e reprova o --c-muted dos dois temas"
```

---

### Task 2: A paleta do design system substitui a neutra

**Files:**
- Modify: `src/index.css` — bloco `PRIMITIVOS` (linhas 30-80), `SEMANTICOS: DARK` (82-119), `SEMANTICOS: LIGHT` (121-157)
- Modify: `src/lib/designTokens.test.ts` — as tabelas `DARK` (linha 18) e `LIGHT` (linha 47)

**Interfaces:**
- Consumes: o teste de contraste da Task 1, que vira o critério de pronto.
- Produces: os primitivos `--p-carbon-0..9` e `--p-paper-0..7`. A Task 3 não depende deles, mas nenhuma outra fase deve reintroduzir os neutros removidos.

Adicionar primitivo e reapontar semântico são a mesma task porque `todo primitivo declarado é usado por alguém` reprova qualquer estado intermediário.

- [ ] **Step 1: Trocar a escala neutra nos primitivos**

Em `src/index.css`, no bloco `/* PRIMITIVOS */`, **remover** os dois blocos de neutros de hoje — a escala `--p-zinc-*` inteira (11 linhas, de `--p-zinc-950` a `--p-zinc-50`), os quatro `--p-carbon-*` e os três `--p-gray-*` — e **manter** `--p-white`.

No lugar deles, inserir:

```css
  /* Escala escura do design system. Sete degraus de superficie mais tres de
     texto: o painel de operacao empilha muita superficie, e sem degrau proprio
     cada componente inventava o seu. */
  --p-carbon-0:    2   2   2;
  --p-carbon-1:    8   8   8;
  --p-carbon-2:   12  12  12;
  --p-carbon-3:   18  18  18;
  --p-carbon-4:   24  24  24;
  --p-carbon-5:   32  32  32;
  --p-carbon-6:   37  37  37;
  --p-carbon-7:   80  80  80;
  --p-carbon-8:  138 138 138;
  --p-carbon-9:  181 181 181;

  /* Escala clara. O 5 e #6D6D6D, nao o #6E6E6E do design system original:
     sobre a superficie ativa o #6E6E6E da 4.46:1 e reprova AA. */
  --p-paper-0:  243 244 246;
  --p-paper-1:  246 247 248;
  --p-paper-2:  238 240 242;
  --p-paper-3:  232 232 232;
  --p-paper-4:  165 165 165;
  --p-paper-5:  109 109 109;
  --p-paper-6:   68  68  68;
  --p-paper-7:   23  23  23;

  --p-white:    255 255 255;
```

Manter intactos, logo abaixo, o azul de marca e todos os primitivos de estado (`--p-blue-*`, `--p-cyan-*`, `--p-green-*`, `--p-yellow-*`, `--p-red-*`, `--p-orange-*`, `--p-violet-*`, `--p-pink-*`, `--p-teal-*`). Eles são da Fase 6.

- [ ] **Step 2: Reapontar o bloco `SEMANTICOS: DARK`**

Substituir as onze linhas de superfície, borda e texto. Os acentos (`--c-primary*`, `--c-cyan`, `--c-green`, `--c-yellow`, `--c-red`, `--c-orange`, `--c-purple`, `--c-pink`, `--c-teal`) e os quatro `--c-grp-*` **não mudam**.

```css
  /* Superficies */
  --c-bg:            var(--p-carbon-0);
  --c-elevated:      var(--p-carbon-1);
  --c-surface:       var(--p-carbon-4);
  --c-card:          var(--p-carbon-2);
  --c-card-high:     var(--p-carbon-3);
  --c-card-highest:  var(--p-carbon-5);
  --c-border:        var(--p-carbon-6);

  /* Texto */
  --c-text:          var(--p-white);
  --c-secondary:     var(--p-carbon-9);
  --c-muted:         var(--p-carbon-8);
  --c-disabled:      var(--p-carbon-7);
```

Note que `--c-surface` passa a apontar para o degrau 4 e `--c-card-highest` para o 5: no design system o `surface` é o hover e o `card-highest` é o estado ativo, que é mais claro.

- [ ] **Step 3: Reapontar o bloco `SEMANTICOS: LIGHT`**

```css
  /* Hierarquia de superficie: fundo cinza, card branco. Os tres brancos nao
     sao redundancia — quem separa shell de card de popover e a sombra, que
     entra na Task 3. */
  --c-bg:            var(--p-paper-0);
  --c-elevated:      var(--p-white);
  --c-surface:       var(--p-paper-1);
  --c-card:          var(--p-white);
  --c-card-high:     var(--p-white);
  --c-card-highest:  var(--p-paper-2);
  --c-border:        var(--p-paper-3);

  --c-text:          var(--p-paper-7);
  --c-secondary:     var(--p-paper-6);
  --c-muted:         var(--p-paper-5);
  --c-disabled:      var(--p-paper-4);
```

- [ ] **Step 4: O contraste fica verde**

```bash
npx vitest run src/lib/designTokens.test.ts -t "todo par atinge"
```

Esperado: PASS nos dois temas. As duas reprovações da Task 1 sumiram.

- [ ] **Step 5: Confirmar que a arquitetura de três camadas seguiu intacta**

```bash
npx vitest run src/lib/designTokens.test.ts -t "tres camadas"
```

Esperado: PASS — em particular `todo valor semântico é referência a um primitivo` e `todo primitivo declarado é usado por alguém`. Se o segundo falhar, sobrou neutro antigo declarado sem uso: remova-o.

- [ ] **Step 6: Commit da migração (a trava de valores fica vermelha)**

```bash
git add src/index.css
git commit -m "feat(ds): superficie e texto adotam a paleta do design system"
```

Neste ponto `valores resolvidos não mudam` está vermelho, com 22 falhas. É esperado e é o assunto do próximo passo.

- [ ] **Step 7: Ver a trava disparar e conferir a conta**

```bash
npx vitest run src/lib/designTokens.test.ts -t "valores resolvidos" 2>&1 | grep -c "AssertionError"
```

Esperado: `20`. São onze tokens no escuro e nove no claro — no claro, `--c-elevated` e `--c-card` já eram `var(--p-white)` e continuam sendo, então o valor resolvido não muda e a asserção não falha. Se for diferente de 20, algum token mudou fora do previsto ou algum não mudou: compare com as tabelas da spec antes de seguir.

- [ ] **Step 8: Atualizar a trava**

Em `src/lib/designTokens.test.ts`, na tabela `const DARK` (linha 18), trocar os onze valores:

```ts
  '--c-bg': '2 2 2',
  '--c-elevated': '8 8 8',
  '--c-surface': '24 24 24',
  '--c-card': '12 12 12',
  '--c-card-high': '18 18 18',
  '--c-card-highest': '32 32 32',
  '--c-border': '37 37 37',
  '--c-text': '255 255 255',
  '--c-secondary': '181 181 181',
  '--c-muted': '138 138 138',
  '--c-disabled': '80 80 80',
```

E na tabela `const LIGHT` (linha 47):

```ts
  '--c-bg': '243 244 246',
  '--c-elevated': '255 255 255',
  '--c-surface': '246 247 248',
  '--c-card': '255 255 255',
  '--c-card-high': '255 255 255',
  '--c-card-highest': '238 240 242',
  '--c-border': '232 232 232',
  '--c-text': '23 23 23',
  '--c-secondary': '68 68 68',
  '--c-muted': '109 109 109',
  '--c-disabled': '165 165 165',
```

Não tocar nas linhas de acento e de `--c-grp-*` dessas tabelas.

- [ ] **Step 9: O arquivo inteiro fica verde**

```bash
npx vitest run src/lib/designTokens.test.ts
```

Esperado: PASS, tudo.

- [ ] **Step 10: Commit da trava, separado de propósito**

```bash
git add src/lib/designTokens.test.ts
git commit -m "chore(ds): a trava de valores resolvidos registra a paleta nova"
```

O commit é separado para o diff mostrar, sozinho, exatamente quais valores mudaram — em vez de a mudança entrar escondida junto com o CSS.

---

### Task 3: As sombras separam branco de branco

**Files:**
- Modify: `src/index.css` — blocos `COMPONENTE: DARK` (linha 217) e `COMPONENTE: LIGHT` (224)
- Modify: `tailwind.config.js` — bloco `boxShadow` (linha 92)
- Test: `src/lib/designTokens.test.ts`

**Interfaces:**
- Consumes: as superfícies da Task 2 — no claro, `--c-elevated`, `--c-card` e `--c-card-high` são todos `#FFFFFF`, e é isso que torna a sombra necessária.
- Produces: os tokens de componente `--c-shadow-sm`, `--c-shadow-md`, `--c-shadow-lg`.

As sombras vão para a camada de **componente**, não para a semântica: a semântica só aceita `var(--p-*)`, e uma sombra é uma lista de valores com alfa. É o mesmo lugar onde vive `--c-border-hairline`.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar ao final de `src/lib/designTokens.test.ts`:

```ts
describe('sombra e a hierarquia do tema claro', () => {
  it('os tres niveis existem nos dois temas', () => {
    // No claro os tres primeiros niveis de superficie sao #FFFFFF: sem sombra,
    // popover sobre card fica branco em branco. Token declarado num tema so
    // herda o valor do outro pelo cascade, sem erro e sem aviso — foi o que
    // aconteceu com os --c-grp-* antes da Fase 1.
    const componentes = lerComponentes()
    for (const nivel of ['--c-shadow-sm', '--c-shadow-md', '--c-shadow-lg']) {
      expect(Object.keys(componentes.dark), `dark ${nivel}`).toContain(nivel)
      expect(Object.keys(componentes.light), `light ${nivel}`).toContain(nivel)
    }
  })

  it('o escuro zera as duas sombras pequenas', () => {
    // No escuro a separacao vem de borda e luminosidade; sombra preta sobre
    // #020202 nao aparece. So o nivel lg sobrevive, para modal e dropdown.
    const componentes = lerComponentes()
    expect(componentes.dark['--c-shadow-sm']).toBe('0 0 #0000')
    expect(componentes.dark['--c-shadow-md']).toBe('0 0 #0000')
    expect(componentes.dark['--c-shadow-lg']).not.toBe('0 0 #0000')
  })
})
```

Acrescentar `lerComponentes` ao import que já existe no topo do arquivo:

```ts
import { lerIndexCss, lerComponentes, resolveTheme } from '../../scripts/design-tokens.mjs'
```

Confira o nome exato do import existente antes de editar — se `lerComponentes` já estiver importado, não duplique.

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run src/lib/designTokens.test.ts -t "sombra e a hierarquia"
```

Esperado: FAIL — `expected [ '--c-border-hairline', ... ] to contain '--c-shadow-sm'`

- [ ] **Step 3: Declarar as sombras no tema escuro**

Em `src/index.css`, dentro do bloco `/* COMPONENTE: DARK */`, depois de `--c-border-strong`:

```css
  /* Sombra no escuro seria preto sobre #020202: invisivel. A separacao vem de
     borda e luminosidade. So o overlay real mantem sombra. */
  --c-shadow-sm: 0 0 #0000;
  --c-shadow-md: 0 0 #0000;
  --c-shadow-lg: 0 16px 40px rgba(0, 0, 0, .55);
```

- [ ] **Step 4: Declarar as sombras no tema claro**

Dentro do bloco `/* COMPONENTE: LIGHT */`, depois dos três `--c-border-*`:

```css
  /* Quase invisiveis de proposito: sao o unico separador entre shell, card e
     popover, que no claro sao os tres o mesmo branco. */
  --c-shadow-sm: 0 2px 10px rgba(0, 0, 0, .03);
  --c-shadow-md: 0 4px 20px rgba(0, 0, 0, .04);
  --c-shadow-lg: 0 10px 30px rgba(0, 0, 0, .08);
```

- [ ] **Step 5: Rodar e ver passar**

```bash
npx vitest run src/lib/designTokens.test.ts -t "sombra e a hierarquia"
```

Esperado: PASS nos dois testes.

- [ ] **Step 6: Reapontar as três utilities do Tailwind**

Em `tailwind.config.js`, no bloco `boxShadow` (linha 92), trocar **apenas** `sm`, `md` e `lg`:

```js
      boxShadow: {
        xs:         '0 1px 2px rgba(0,0,0,.40)',
        // Estes tres passam a trocar por tema. Os valores fixos abaixo sao do
        // tema escuro e ficam ate a Fase 7 decidir o que fazer com eles.
        sm:         'var(--c-shadow-sm)',
        md:         'var(--c-shadow-md)',
        lg:         'var(--c-shadow-lg)',
        xl:         '0 16px 40px rgba(0,0,0,.55), 0 8px 16px rgba(0,0,0,.40)',
        '2xl':      '0 24px 60px rgba(0,0,0,.65), 0 12px 24px rgba(0,0,0,.50)',
        accent:     '0 4px 16px rgba(59,130,246,.18), 0 2px 6px rgba(59,130,246,.10)',
        'accent-lg':'0 8px 28px rgba(59,130,246,.22), 0 4px 10px rgba(59,130,246,.14)',
      },
```

`xs`, `xl`, `2xl`, `accent` e `accent-lg` ficam como estão: `accent` depende do azul e é da Fase 6.

- [ ] **Step 7: Confirmar que as utilities são emitidas**

```bash
npm run build && grep -o "\.shadow-\(sm\|md\|lg\){[^}]*}" dist/assets/*.css | sort -u
```

Esperado: as três classes aparecem apontando para `var(--c-shadow-*)`. São 14 usos no JSX (`shadow-sm` 4, `shadow-md` 3, `shadow-lg` 7), então o Tailwind emite todas.

- [ ] **Step 8: Commit**

```bash
git add src/index.css tailwind.config.js src/lib/designTokens.test.ts
git commit -m "feat(ds): sombra vira token de tema e separa branco de branco no claro"
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

Esperado: os quatro limpos. A suíte tinha 944 testes antes desta fase; agora tem 944 mais os seis novos casos (`todo par atinge` e `a borda nao some`, dois temas cada, mais os dois de sombra).

- [ ] **Step 2: A catraca não se move**

```bash
npm run audit:ds
```

Esperado: `audit:ds OK`, **sem** a linha `↓ catraca`. Esta fase não muda a contagem de valores arbitrários — só troca valor de token. Se a catraca pedir ajuste, algo entrou fora do escopo.

- [ ] **Step 3: Confirmar que nenhum arquivo de aplicação foi tocado**

```bash
git diff --name-only main...HEAD
```

Esperado: exatamente três arquivos — `src/index.css`, `tailwind.config.js`, `src/lib/designTokens.test.ts`. Qualquer `.tsx` na lista significa que o escopo vazou.

- [ ] **Step 4: Conferência visual — e desta vez há o que ver**

```bash
npm run dev
```

Nos **dois temas**, em `/`, `/ordens`, `/graficos` e `/fornecedor`:

| O que olhar | Esperado |
|---|---|
| Fundo escuro | de `#09090B` para `#020202` — bem mais preto |
| Card no escuro | de `#131315` para `#0C0C0C` |
| Texto atenuado no escuro | clareia de `#71717A` para `#8A8A8A` — este é o defeito de acessibilidade sendo corrigido |
| Fundo claro | cinza `#F3F4F6`, com cards branco puro |
| Popover sobre card no claro | separado por sombra, não por cinza |

Se a tela ficar igual, algo deu errado — ao contrário da Fase 4, esta fase muda o visual.

Conferir também que **as cores de acento não mudaram**: badge, botão primário e série de gráfico continuam azuis. Se algo virou laranja, a Fase 6 vazou para dentro desta.

- [ ] **Step 5: Conferir o contraste no navegador, não só no teste**

Com o DevTools aberto em qualquer página, nos dois temas:

```js
getComputedStyle(document.documentElement).getPropertyValue('--c-muted')
```

Esperado: ` 138 138 138` no escuro, ` 109 109 109` no claro.

---

## Verificação final da fase

| Checagem | Esperado |
|---|---|
| `npx tsc --noEmit` | limpo |
| `npm run lint` | limpo |
| `npm run audit:ds` | `audit:ds OK`, sem pedir catraca |
| `npm test` | suíte inteira passando |
| `npm run build` | `.shadow-sm/md/lg` apontando para `var(--c-shadow-*)` |
| `git diff --name-only main...HEAD` | exatamente 3 arquivos |
| Contraste `--c-muted` escuro | 4.72:1 no pior caso, era 3.32:1 |
| Contraste `--c-muted` claro | 4.53:1 no pior caso, era 3.90:1 |
