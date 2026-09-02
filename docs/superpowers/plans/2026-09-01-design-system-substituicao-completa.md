# Substituição completa do design system — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir integralmente o design system do Cabonnet React pelo DS especificado em `docs/superpowers/specs/2026-09-01-design-system-substituicao-completa-design.md` — laranja `#FF5A1F` como marca, dois temas completos, KPI cards coloridos por categoria, shell arredondado.

**Architecture:** Uma única camada de tokens CSS em `src/index.css` (`:root` = claro, `.dark` = escuro), consumida por aliases no `tailwind.config.js`. Os nomes de classe Tailwind existentes (`bg-card`, `text-muted`, `border-border`) são preservados e reapontados para os tokens novos, de forma que o app continue compilando durante toda a migração. A troca de significado do token `primary` (azul → laranja) é feita em duas etapas separadas: primeiro os usos de "informação" migram para `blue` sem mudança visual, depois o token vira laranja num commit isolado e reversível.

**Tech Stack:** React 19, Tailwind CSS 3.4.19, TypeScript 6, Vitest 4, Playwright 1.60, Recharts 3.8, Phosphor Icons.

## Global Constraints

- **Tailwind permanece na 3.4.19.** Nada de v4, nada de shadcn/ui.
- **Ícones permanecem Phosphor.** Regra registrada do projeto; nenhum ícone de outra biblioteca entra.
- **Nenhuma mudança de comportamento, dado, rota ou API.** Este plano é exclusivamente visual.
- **Piso tipográfico de 11px.** `text-[8px]`, `text-[9px]` e `text-[10px]` são barrados pelo `audit-ds.mjs`.
- **Valores de cor são canais RGB separados por espaço** (`255 90 31`), nunca hex, para que `bg-orange/20` funcione.
- **Toda cor nova em `.tsx` precisa estar na baseline do `audit-ds.mjs`**, senão o CI reprova.
- **Ao final de cada task:** `npx tsc --noEmit && npm run lint && npm test && npm run audit:ds`. Os quatro. `npm run build` é `vite build` puro e **não** checa tipo — não substitui o `tsc`.
- **Um commit por task.** Cada task tem que deixar o repositório num estado que compila.
- Base de reversão: commit `a947b36` (estado anterior à migração).

## Paleta final, com contraste verificado

Calculado com a fórmula de luminância relativa da WCAG 2.1. Quatro valores da especificação original reprovaram e foram corrigidos; estão marcados com **(ajustado)**.

### Claro — `:root`

| Token | Hex | RGB | Contraste |
|---|---|---|---|
| `--bg` | `#F3F4F6` | `243 244 246` | — |
| `--surface-1` | `#FFFFFF` | `255 255 255` | — |
| `--surface-2` | `#FFFFFF` | `255 255 255` | — |
| `--surface-3` | `#FFFFFF` | `255 255 255` | — |
| `--surface-hover` | `#F6F7F8` | `246 247 248` | — |
| `--surface-active` | `#EEF0F2` | `238 240 242` | — |
| `--border` | `#E8E8E8` | `232 232 232` | — |
| `--border-subtle` | `#F1F1F1` | `241 241 241` | — |
| `--border-hover` | `#D8D8D8` | `216 216 216` | — |
| `--text` | `#171717` | `23 23 23` | 17.93:1 AA |
| `--text-secondary` | `#444444` | `68 68 68` | 9.74:1 AA |
| `--text-muted` **(ajustado)** | `#6E6E6E` | `110 110 110` | 5.10:1 AA — o `#777777` da spec dava 4.48:1 |
| `--text-disabled` | `#A5A5A5` | `165 165 165` | 2.46:1 — isento (WCAG 1.4.3 dispensa componentes desabilitados) |
| `--orange` | `#FF5A1F` | `255 90 31` | 3.12:1 sobre branco — só texto grande |
| `--blue` | `#2864E8` | `40 100 232` | 5.15:1 AA |
| `--green` | `#12C4AE` | `18 196 174` | — (usado como fundo) |
| `--yellow` | `#FBCB12` | `251 203 18` | — (usado como fundo) |
| `--red` | `#E03131` | `224 49 49` | 4.51:1 AA |

### Escuro — `.dark`

| Token | Hex | RGB | Contraste sobre `--surface-2` |
|---|---|---|---|
| `--bg` | `#020202` | `2 2 2` | — |
| `--surface-1` | `#080808` | `8 8 8` | — |
| `--surface-2` | `#0C0C0C` | `12 12 12` | — |
| `--surface-3` | `#121212` | `18 18 18` | — |
| `--surface-hover` | `#181818` | `24 24 24` | — |
| `--surface-active` | `#202020` | `32 32 32` | — |
| `--border` | `#252525` | `37 37 37` | — |
| `--border-subtle` | `#1A1A1A` | `26 26 26` | — |
| `--border-hover` | `#353535` | `53 53 53` | — |
| `--text` | `#FFFFFF` | `255 255 255` | 19.56:1 AA |
| `--text-secondary` | `#B5B5B5` | `181 181 181` | 9.54:1 AA |
| `--text-muted` **(ajustado)** | `#8A8A8A` | `138 138 138` | 5.67:1 AA — o `#777777` da spec dava 4.37:1 |
| `--text-disabled` | `#505050` | `80 80 80` | 2.43:1 — isento |
| `--orange` | `#FF5A1F` | `255 90 31` | 6.27:1 AA |
| `--blue` **(ajustado)** | `#4A80F0` | `74 128 240` | 5.25:1 AA — o `#2864E8` da spec dava 3.80:1 |
| `--green` | `#11C7B0` | `17 199 176` | 9.15:1 AA |
| `--yellow` | `#F5C915` | `245 201 21` | 12.34:1 AA |
| `--red` | `#FF6B6B` | `255 107 107` | 7.05:1 AA |

### Tinta do KPI preenchido — claro **(ajustado)**

A especificação assume texto branco sobre os quatro KPIs. Branco reprova em dois:

| Fundo | Branco | `#171717` | Tinta adotada |
|---|---|---|---|
| laranja `#FF5A1F` | 3.12:1 ✗ | **5.75:1** ✓ | `#171717` |
| azul `#2864E8` | **5.15:1** ✓ | 3.48:1 ✗ | `#FFFFFF` |
| verde `#12C4AE` | 2.20:1 ✗ | **8.14:1** ✓ | `#171717` |
| amarelo `#FBCB12` | 1.54:1 ✗ | **11.66:1** ✓ | `#171717` |

No tema escuro o KPI é tint + borda sobre superfície escura, então a tinta é sempre `--text`.

---

# FASE 1 — Fundação

## Task 1: Bloco de tokens em `index.css`

**Files:**
- Modify: `src/index.css:12-90` (substitui os blocos `:root` e `.light`)

**Interfaces:**
- Produces: as variáveis CSS `--bg`, `--surface-1..3`, `--surface-hover`, `--surface-active`, `--border`, `--border-subtle`, `--border-hover`, `--text`, `--text-secondary`, `--text-muted`, `--text-disabled`, `--orange`, `--blue`, `--green`, `--yellow`, `--red`, `--chart-1..6`, `--kpi-ink-orange|blue|green|yellow`, `--shadow-sm|md|lg`. Todas as tasks seguintes consomem estes nomes.

- [ ] **Step 1: Substituir o bloco `:root` e o bloco `.light`**

Localize em `src/index.css` o bloco que começa em `:root {` (linha ~12, comentário `DESIGN TOKENS — Stripe / Clerk reference`) e vai até o fim do bloco `.light { ... }` (linha ~90). Substitua **todo** esse trecho por:

```css
/* ═══════════════════════════════════════════════════════════════
   DESIGN TOKENS
   :root = tema claro (padrão do documento)
   .dark = tema escuro (padrão do produto — aplicado por uiStore)
   Contraste WCAG AA verificado; ver o plano para a tabela completa.
═══════════════════════════════════════════════════════════════ */
:root {
  /* ── Superfícies ── */
  --bg:             243 244 246;  /* #F3F4F6 */
  --surface-1:      255 255 255;  /* #FFFFFF  shell            */
  --surface-2:      255 255 255;  /* #FFFFFF  card             */
  --surface-3:      255 255 255;  /* #FFFFFF  popover + sombra */
  --surface-hover:  246 247 248;  /* #F6F7F8 */
  --surface-active: 238 240 242;  /* #EEF0F2 */

  /* ── Bordas ── */
  --border:         232 232 232;  /* #E8E8E8 */
  --border-subtle:  241 241 241;  /* #F1F1F1 */
  --border-hover:   216 216 216;  /* #D8D8D8 */

  /* ── Texto ── */
  --text:            23  23  23;  /* #171717  17.93:1 */
  --text-secondary:  68  68  68;  /* #444444   9.74:1 */
  --text-muted:     110 110 110;  /* #6E6E6E   5.10:1 — spec pedia #777777 (4.48:1, reprova AA) */
  --text-disabled:  165 165 165;  /* #A5A5A5   2.46:1 — isento, WCAG 1.4.3 */

  /* ── Acentos ── */
  --orange: 255  90  31;  /* #FF5A1F */
  --blue:    40 100 232;  /* #2864E8   5.15:1 */
  --green:   18 196 174;  /* #12C4AE */
  --yellow: 251 203  18;  /* #FBCB12 */
  --red:    224  49  49;  /* #E03131   4.51:1 */

  /* ── Escala categórica de gráfico (independente da semântica) ── */
  --chart-1: 255  90  31;  /* laranja  */
  --chart-2:  40 100 232;  /* azul     */
  --chart-3:  18 196 174;  /* verde    */
  --chart-4: 251 203  18;  /* amarelo  */
  --chart-5: 224  49  49;  /* vermelho */
  --chart-6: 124  77 255;  /* #7C4DFF violeta */

  /* ── Tinta sobre KPI preenchido — branco reprova em verde e amarelo ── */
  --kpi-ink-orange:  23  23  23;  /* 5.75:1  */
  --kpi-ink-blue:   255 255 255;  /* 5.15:1  */
  --kpi-ink-green:   23  23  23;  /* 8.14:1  */
  --kpi-ink-yellow:  23  23  23;  /* 11.66:1 */

  /* ── Sombras — quase invisíveis no claro ── */
  --shadow-sm: 0 2px 10px rgba(0,0,0,.03);
  --shadow-md: 0 4px 20px rgba(0,0,0,.04);
  --shadow-lg: 0 10px 30px rgba(0,0,0,.08);
}

.dark {
  --bg:               2   2   2;  /* #020202 */
  --surface-1:        8   8   8;  /* #080808 */
  --surface-2:       12  12  12;  /* #0C0C0C */
  --surface-3:       18  18  18;  /* #121212 */
  --surface-hover:   24  24  24;  /* #181818 */
  --surface-active:  32  32  32;  /* #202020 */

  --border:          37  37  37;  /* #252525 */
  --border-subtle:   26  26  26;  /* #1A1A1A */
  --border-hover:    53  53  53;  /* #353535 */

  --text:           255 255 255;  /* 19.56:1 */
  --text-secondary: 181 181 181;  /* #B5B5B5  9.54:1 */
  --text-muted:     138 138 138;  /* #8A8A8A  5.67:1 — spec pedia #777777 (4.37:1, reprova AA) */
  --text-disabled:   80  80  80;  /* #505050  isento */

  --orange: 255  90  31;  /* 6.27:1 */
  --blue:    74 128 240;  /* #4A80F0 5.25:1 — spec pedia #2864E8 (3.80:1, reprova AA) */
  --green:   17 199 176;  /* #11C7B0 9.15:1 */
  --yellow: 245 201  21;  /* #F5C915 12.34:1 */
  --red:    255 107 107;  /* #FF6B6B 7.05:1 */

  --chart-1: 255  90  31;
  --chart-2:  74 128 240;
  --chart-3:  17 199 176;
  --chart-4: 245 201  21;
  --chart-5: 255 107 107;
  --chart-6: 154 122 255;  /* #9A7AFF */

  /* No escuro o KPI é tint + borda; a tinta é sempre o texto normal */
  --kpi-ink-orange: 255 255 255;
  --kpi-ink-blue:   255 255 255;
  --kpi-ink-green:  255 255 255;
  --kpi-ink-yellow: 255 255 255;

  /* Sem sombra no escuro — o contraste vem de borda e luminosidade.
     Só overlays (modal, dropdown) mantêm sombra real. */
  --shadow-sm: 0 0 #0000;
  --shadow-md: 0 0 #0000;
  --shadow-lg: 0 16px 40px rgba(0,0,0,.55);
}
```

- [ ] **Step 2: Ajustar o `body` e o dot grid**

Localize o bloco `body { ... }` (linha ~97) e o `.light body { ... }` (linha ~88, já removido no Step 1). Substitua as três propriedades de cor e o `background-image` do `body` por:

```css
body {
  margin: 0;
  max-width: 100%;
  overflow-x: clip;
  background-color: rgb(var(--bg));
  color: rgb(var(--text));
  font-family: "Inter Variable", "Inter", system-ui, -apple-system, sans-serif;
  font-optical-sizing: auto;
  font-feature-settings: "cv11" 1, "zero" 1, "ss01" 1;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}

/* Gradientes ambientais — só no escuro, quase imperceptíveis (spec §3 do DS) */
.dark body {
  background-image:
    radial-gradient(circle at 15% 30%, rgba(255, 90, 31, .05), transparent 32%),
    radial-gradient(circle at 85% 55%, rgba(17, 199, 176, .05), transparent 32%);
  background-attachment: fixed;
}
```

O dot grid (`radial-gradient(... 1px, transparent 1px)` com `background-size: 24px 24px`) é do design antigo e sai.

- [ ] **Step 3: Trocar as referências `--c-*` restantes dentro do próprio `index.css`**

Rode para achar o que sobrou:

```bash
grep -n -- "--c-" src/index.css
```

Substitua cada ocorrência conforme o mapa: `--c-bg`→`--bg`, `--c-text`→`--text`, `--c-secondary`→`--text-secondary`, `--c-muted`→`--text-muted`, `--c-disabled`→`--text-disabled`, `--c-border`→`--border`, `--c-surface`→`--surface-hover`, `--c-card`→`--surface-2`, `--c-card-high`→`--surface-hover`, `--c-card-highest`→`--surface-active`, `--c-elevated`→`--surface-3`, `--c-primary`→`--blue`, `--c-primary-light`→`--blue`, `--c-primary-dark`→`--blue`, `--c-cyan`→`--blue`, `--c-teal`→`--green`, `--c-purple`→`--chart-6`, `--c-pink`→`--chart-6`, `--c-green`→`--green`, `--c-yellow`→`--yellow`, `--c-red`→`--red`, `--c-orange`→`--orange`, `--c-grp-*`→ remover a declaração.

Repita o `grep` até não retornar nada.

- [ ] **Step 4: Verificar**

```bash
grep -c -- "--c-" src/index.css     # esperado: 0
npx tsc --noEmit && npm run lint && npm test
```

Esperado: os três passam. `npm run audit:ds` ainda vai falhar — a baseline é reescrita na Task 4.

- [ ] **Step 5: Commit**

```bash
git add src/index.css
git commit -m "feat(ds): bloco de tokens do design system novo

:root passa a ser o tema claro e .dark o escuro. Quatro valores da
especificacao foram ajustados por reprovarem no WCAG AA: --text-muted nos dois
temas, --blue no escuro e a tinta do KPI preenchido no claro.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Reapontar `tailwind.config.js`

**Files:**
- Modify: `tailwind.config.js` (arquivo inteiro)

**Interfaces:**
- Consumes: as variáveis CSS da Task 1.
- Produces: os nomes de classe Tailwind `bg-bg`, `bg-surface-1|2|3`, `bg-surface-hover`, `bg-surface-active`, `border-border`, `border-subtle`, `text-text`, `text-secondary`, `text-muted`, `text-disabled`, `text-orange`, `text-blue`, `text-green`, `text-yellow`, `text-red`, `text-chart-1..6`, `shadow-sm|md|lg`, `text-caption|label|body|title|heading|display`, `rounded-sm|md|lg|xl|2xl|pill`.
- **Aliases de compatibilidade mantidos** para o código não quebrar durante as Fases 2-3: `bg-card` → `--surface-2`, `bg-elevated` → `--surface-3`, `bg-surface` → `--surface-hover`, `bg-card-high` → `--surface-hover`, `bg-card-highest` → `--surface-active`, `text-primary`/`bg-primary` → `--blue` (vira `--orange` só na Task 9), `cyan` → `--blue`, `teal` → `--green`, `purple` → `--chart-6`.

- [ ] **Step 1: Substituir o arquivo inteiro**

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ── Superfícies ──
        bg:               'rgb(var(--bg) / <alpha-value>)',
        'surface-1':      'rgb(var(--surface-1) / <alpha-value>)',
        'surface-2':      'rgb(var(--surface-2) / <alpha-value>)',
        'surface-3':      'rgb(var(--surface-3) / <alpha-value>)',
        'surface-hover':  'rgb(var(--surface-hover) / <alpha-value>)',
        'surface-active': 'rgb(var(--surface-active) / <alpha-value>)',

        // ── Aliases de compatibilidade (removidos na Fase 4) ──
        card:           'rgb(var(--surface-2) / <alpha-value>)',
        'card-high':    'rgb(var(--surface-hover) / <alpha-value>)',
        'card-highest': 'rgb(var(--surface-active) / <alpha-value>)',
        elevated:       'rgb(var(--surface-3) / <alpha-value>)',
        surface:        'rgb(var(--surface-hover) / <alpha-value>)',

        // ── Bordas ──
        border:   'rgb(var(--border) / <alpha-value>)',
        subtle:   'rgb(var(--border-subtle) / <alpha-value>)',
        'border-hover': 'rgb(var(--border-hover) / <alpha-value>)',

        // ── Texto ──
        text:      'rgb(var(--text) / <alpha-value>)',
        secondary: 'rgb(var(--text-secondary) / <alpha-value>)',
        muted:     'rgb(var(--text-muted) / <alpha-value>)',
        disabled:  'rgb(var(--text-disabled) / <alpha-value>)',

        // ── Acentos ──
        orange: 'rgb(var(--orange) / <alpha-value>)',
        blue:   'rgb(var(--blue) / <alpha-value>)',
        green:  'rgb(var(--green) / <alpha-value>)',
        yellow: 'rgb(var(--yellow) / <alpha-value>)',
        red:    'rgb(var(--red) / <alpha-value>)',

        // `primary` ainda aponta para azul. A Task 9 troca para --orange,
        // depois que a Task 8 tiver migrado os usos de "informação".
        primary:         'rgb(var(--blue) / <alpha-value>)',
        // 2 usos de primary-dark ainda vivos; migrados na Task 19.
        'primary-light': 'rgb(var(--blue) / <alpha-value>)',
        'primary-dark':  'rgb(var(--blue) / <alpha-value>)',

        // Aliases das cores aposentadas — resolvidos nas Fases 2-4
        cyan:   'rgb(var(--blue) / <alpha-value>)',
        teal:   'rgb(var(--green) / <alpha-value>)',
        purple: 'rgb(var(--chart-6) / <alpha-value>)',

        // ── Séries de gráfico ──
        'chart-1': 'rgb(var(--chart-1) / <alpha-value>)',
        'chart-2': 'rgb(var(--chart-2) / <alpha-value>)',
        'chart-3': 'rgb(var(--chart-3) / <alpha-value>)',
        'chart-4': 'rgb(var(--chart-4) / <alpha-value>)',
        'chart-5': 'rgb(var(--chart-5) / <alpha-value>)',
        'chart-6': 'rgb(var(--chart-6) / <alpha-value>)',

        // ── Tinta do KPI preenchido ──
        'kpi-ink-orange': 'rgb(var(--kpi-ink-orange) / <alpha-value>)',
        'kpi-ink-blue':   'rgb(var(--kpi-ink-blue) / <alpha-value>)',
        'kpi-ink-green':  'rgb(var(--kpi-ink-green) / <alpha-value>)',
        'kpi-ink-yellow': 'rgb(var(--kpi-ink-yellow) / <alpha-value>)',
      },

      fontFamily: {
        sans:     ['"Inter Variable"', '"Inter"', 'system-ui', '-apple-system', 'sans-serif'],
        headline: ['"Inter Variable"', '"Inter"', 'system-ui', 'sans-serif'],
        mono:     ['"Inter Variable"', '"Inter"', 'system-ui', '-apple-system', 'sans-serif'],
      },

      fontSize: {
        caption: ['11px', { lineHeight: '1.35' }],
        label:   ['12px', { lineHeight: '1.4'  }],
        body:    ['14px', { lineHeight: '1.5'  }],
        title:   ['16px', { lineHeight: '1.4'  }],
        heading: ['20px', { lineHeight: '1.3',  letterSpacing: '-0.01em'  }],
        display: ['28px', { lineHeight: '1',    letterSpacing: '-0.025em' }],
      },

      borderRadius: {
        sm:      '6px',
        DEFAULT: '8px',
        md:      '8px',
        lg:      '12px',
        xl:      '16px',
        '2xl':   '24px',
        pill:    '9999px',
      },

      // Sombras sensíveis ao tema — o valor vive em --shadow-*, redefinido em .dark.
      // xs, 2xl, accent e accent-lg continuam declarados porque ainda há 21 usos
      // vivos no código (shadow-2xl 15, shadow-accent 5, shadow-xs 1); o Tailwind
      // descarta classe desconhecida em silêncio, sem erro de build nem de tipo.
      // Migrados na Task 19.
      boxShadow: {
        xs:      'var(--shadow-sm)',
        sm:      'var(--shadow-sm)',
        DEFAULT: 'var(--shadow-md)',
        md:      'var(--shadow-md)',
        lg:      'var(--shadow-lg)',
        xl:      'var(--shadow-lg)',
        '2xl':   'var(--shadow-lg)',
        accent:      '0 0 20px rgb(var(--orange) / .08)',
        'accent-lg': '0 0 28px rgb(var(--orange) / .12)',
        none:    '0 0 #0000',
      },

      zIndex: {
        base: '1', sticky: '95', dropdown: '100', sidebar: '200',
        header: '300', drawer: '600', modal: '700', overlay: '800',
        toast: '9000', top: '9999',
      },

      animation: {
        'fade-in':    'fadeIn .22s cubic-bezier(.4,0,.2,1)',
        'slide-down': 'slideDown .22s cubic-bezier(.4,0,.2,1)',
        'scale-in':   'scaleIn .22s cubic-bezier(.34,1.56,.64,1)',
        'page-enter': 'pageEnter .40s cubic-bezier(.4,0,.2,1) both',
        'card-enter': 'cardEnter .36s cubic-bezier(.34,1.56,.64,1) both',
      },
      keyframes: {
        fadeIn:    { from: { opacity: '0' }, to: { opacity: '1' } },
        slideDown: { from: { opacity: '0', transform: 'translateY(-8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        scaleIn:   { from: { opacity: '0', transform: 'scale(.92)' },       to: { opacity: '1', transform: 'scale(1)' } },
        pageEnter: { from: { opacity: '0', transform: 'translateY(16px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        cardEnter: { from: { opacity: '0', transform: 'scale(.93) translateY(12px)' }, to: { opacity: '1', transform: 'scale(1) translateY(0)' } },
      },

      transitionTimingFunction: {
        ease:   'cubic-bezier(.4,0,.2,1)',
        spring: 'cubic-bezier(.34,1.56,.64,1)',
      },
      transitionDuration: { fast: '120ms', normal: '220ms', slow: '360ms' },
    },
  },
  safelist: [
    'breathe', 'app-content', 'surface-panel', 'metric-panel',
    'page-header', 'page-header-icon', 'map-tooltip',
    { pattern: /^badge-(orange|blue|green|yellow|red)$/ },
    { pattern: /^animate-(fade-in|slide-down|scale-in|page-enter|card-enter)$/ },
  ],
  plugins: [],
}
```

As 18 animações caem para as 5 que o código realmente usa. Verificado por `grep -rhoE "\banimate-[a-z-]+\b" src --include=*.tsx | sort | uniq -c`: `animate-fade-in` 14, `animate-card-enter` 12, `animate-slide-down` 2, `animate-scale-in` 1, `animate-page-enter` 1. As demais (`animate-pulse`, `animate-spin`, `animate-ping`) são nativas do Tailwind.

- [ ] **Step 2: Verificar que nenhuma classe removida ficou órfã**

```bash
grep -rhoE "\b(text|bg|border|ring|fill|stroke|divide)-(pink|accent2)\b" src --include=*.tsx | sort | uniq -c
```

Esperado: nenhuma saída. Se houver, troque `pink` por `chart-6` e `accent2` por `blue` nos arquivos apontados antes de seguir.

- [ ] **Step 3: Verificar**

```bash
npx tsc --noEmit && npm run lint && npm test
```

Esperado: os três passam. Visualmente o app estará ruim — é o estado intermediário previsto na spec §8.

- [ ] **Step 4: Commit**

```bash
git add tailwind.config.js
git commit -m "feat(ds): tailwind.config reaponta para os tokens novos

Sombras viram var(--shadow-*) para poderem mudar com o tema. Escala
tipografica ganha o papel heading. Aliases de compatibilidade (card, elevated,
surface, primary, cyan, teal, purple) mantidos ate as fases 2-4.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Inverter a classe de tema `.light` → `.dark`

**Files:**
- Modify: `src/store/uiStore.ts:84,107-110`
- Modify: `index.html` (classe inicial no `<html>`)
- Modify: `src/components/ui/bar-chart.tsx:19`
- Modify: `src/components/ui/pie-chart.tsx:17`
- Modify: `src/components/ui/DonutChart.tsx:10`
- Modify: `src/features/gerencial/GerencialPage.tsx:106`
- Modify: `src/lib/captureOSTable.ts:83`
- Modify: `src/lib/captureTableImage.ts:32`

**Interfaces:**
- Consumes: nada.
- Produces: a classe `.dark` no `<html>` quando `uiStore.theme === 'dark'`. Todo código que precise saber o tema em runtime usa `document.documentElement.classList.contains('dark')`.

Esta task é a que mais quebra silenciosamente se feita pela metade: se a inversão não for aplicada aos seis arquivos de runtime, a exportação de PDF e de imagem sai com as cores do tema oposto — e isso não aparece em nenhum teste.

- [ ] **Step 1: Escrever o teste que falha**

Crie `src/store/uiStore.theme.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useUIStore } from './uiStore'

describe('tema', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.className = ''
  })

  it('aplica a classe .dark quando o tema e escuro', () => {
    useUIStore.setState({ theme: 'light' })
    useUIStore.getState().toggleTheme()
    expect(useUIStore.getState().theme).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.classList.contains('light')).toBe(false)
  })

  it('remove a classe .dark quando o tema e claro', () => {
    useUIStore.setState({ theme: 'dark' })
    useUIStore.getState().toggleTheme()
    expect(useUIStore.getState().theme).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
npx vitest run src/store/uiStore.theme.test.ts
```

Esperado: FAIL — `expected false to be true` na primeira asserção, porque hoje o store adiciona `.light`.

- [ ] **Step 3: Inverter no `uiStore`**

Em `src/store/uiStore.ts`, linha ~84, troque a leitura inicial:

```ts
const _savedTheme = localStorage.getItem('theme') === 'light' ? 'light' : 'dark'
```

(esta linha não muda — o padrão continua escuro)

Linha ~107-110, no `toggleTheme`, troque:

```ts
    const next = s.theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem('theme', next)
    document.documentElement.classList.toggle('light', next === 'light')
```

por:

```ts
    const next = s.theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem('theme', next)
    document.documentElement.classList.toggle('dark', next === 'dark')
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
npx vitest run src/store/uiStore.theme.test.ts
```

Esperado: PASS, 2 testes.

- [ ] **Step 5: Aplicar a classe inicial no `index.html`**

O tema tem que estar no `<html>` antes do primeiro paint, senão o app pisca claro antes de virar escuro. No `index.html`, dentro do `<head>`, antes de qualquer `<link>` de CSS:

```html
<script>
  // Aplica o tema antes do primeiro paint. Escuro e o padrao.
  try {
    if (localStorage.getItem('theme') !== 'light') {
      document.documentElement.classList.add('dark')
    }
  } catch (_) {
    document.documentElement.classList.add('dark')
  }
</script>
```

Se já existir um script equivalente que adiciona `light`, substitua-o por este.

- [ ] **Step 6: Inverter os seis arquivos de runtime**

Em cada um, a leitura de tema inverte de sentido. Os valores de retorno **não** trocam de lugar — só a condição.

`src/components/ui/bar-chart.tsx:19`, `src/components/ui/pie-chart.tsx:17`, `src/components/ui/DonutChart.tsx:10` — os três têm a mesma linha:

```ts
  return document.documentElement.classList.contains('light')
```

vira:

```ts
  return !document.documentElement.classList.contains('dark')
```

`src/features/gerencial/GerencialPage.tsx:106`:

```ts
      const isDark     = !document.documentElement.classList.contains('light')
```

vira:

```ts
      const isDark     = document.documentElement.classList.contains('dark')
```

`src/lib/captureOSTable.ts:83`:

```ts
  return document.documentElement.classList.contains('light') ? LIGHT : DARK
```

vira:

```ts
  return document.documentElement.classList.contains('dark') ? DARK : LIGHT
```

`src/lib/captureTableImage.ts:32`:

```ts
  const isDark     = !document.documentElement.classList.contains('light')
```

vira:

```ts
  const isDark     = document.documentElement.classList.contains('dark')
```

- [ ] **Step 7: Confirmar que não sobrou nenhuma leitura de `'light'`**

```bash
grep -rn "contains('light')\|classList.toggle('light'\|'\.light'" src index.html
```

Esperado: nenhuma saída.

- [ ] **Step 8: Verificar**

```bash
npx tsc --noEmit && npm run lint && npm test
```

- [ ] **Step 9: Commit**

```bash
git add src/store/uiStore.ts src/store/uiStore.theme.test.ts index.html \
        src/components/ui/bar-chart.tsx src/components/ui/pie-chart.tsx \
        src/components/ui/DonutChart.tsx src/features/gerencial/GerencialPage.tsx \
        src/lib/captureOSTable.ts src/lib/captureTableImage.ts
git commit -m "feat(ds): inverte a classe de tema de .light para .dark

Inclui os seis arquivos que leem o tema em runtime. Sem eles a exportacao de
PDF e imagem sairia com as cores do tema oposto, sem quebrar nenhum teste.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Nova baseline do `audit-ds.mjs`

**Files:**
- Modify: `scripts/audit-ds.mjs:11-19` (regras)
- Modify: `scripts/audit-ds-baseline.json` (arquivo inteiro)

**Interfaces:**
- Consumes: os hex da paleta da Task 1.
- Produces: `npm run audit:ds` verde, barrando hex fora da paleta nova.

- [ ] **Step 1: Substituir `globalHex` na baseline**

Em `scripts/audit-ds-baseline.json`, substitua o array `globalHex` por:

```json
  "globalHex": [
    "#ff5a1f",
    "#2864e8",
    "#4a80f0",
    "#12c4ae",
    "#11c7b0",
    "#fbcb12",
    "#f5c915",
    "#e03131",
    "#ff6b6b",
    "#7c4dff",
    "#9a7aff",
    "#171717",
    "#444444",
    "#6e6e6e",
    "#8a8a8a",
    "#a5a5a5",
    "#505050",
    "#ffffff",
    "#f3f4f6",
    "#f6f7f8",
    "#eef0f2",
    "#e8e8e8",
    "#f1f1f1",
    "#d8d8d8",
    "#020202",
    "#080808",
    "#0c0c0c",
    "#121212",
    "#181818",
    "#202020",
    "#252525",
    "#1a1a1a",
    "#353535"
  ],
```

Mantenha o objeto `files` como está por enquanto — as exceções por arquivo são limpas na Task 19.

- [ ] **Step 2: Acrescentar a regra que barra os tokens antigos**

Em `scripts/audit-ds.mjs`, dentro do array `RULES`, acrescente:

```js
  {
    name: 'Token do design system antigo (--c-*) — use os tokens novos',
    test: (src) => [...src.matchAll(/--c-[a-z-]+/g)].map(m => m[0]),
  },
  {
    name: 'Cor aposentada do design system (pink/accent2/cyan/teal/purple fora de gráfico)',
    test: (src) => [...src.matchAll(/\b(?:text|bg|border|ring|fill|stroke|divide)-(?:pink|accent2)\b/g)].map(m => m[0]),
  },
```

- [ ] **Step 3: Rodar a auditoria**

```bash
npm run audit:ds
```

Esperado: `audit:ds OK`. Se apontar hex de arquivo específico, **não** acrescente à baseline sem olhar — a maioria vai ser cor do design antigo que precisa virar token nas fases seguintes. Nesse caso, mantenha a entrada no objeto `files` com um comentário no commit e resolva na fase certa.

- [ ] **Step 4: Verificar**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run audit:ds
```

- [ ] **Step 5: Commit**

```bash
git add scripts/audit-ds.mjs scripts/audit-ds-baseline.json
git commit -m "chore(ds): baseline da auditoria migrada para a paleta nova

Acrescenta regra que barra --c-* e as cores aposentadas.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4b: Migrar as referências `--c-*` inline nos `.tsx`

**Files:**
- Modify: `src/features/dashboard/FluxoOSPanel.tsx` (15 ocorrências)
- Modify: `src/features/juniper/topology/JuniperTopology3D.tsx` (7)
- Modify: `src/components/ui/StatCard.tsx` (7)
- Modify: `src/components/layout/Sidebar.tsx` (3)
- Modify: `src/features/dashboard/DashboardPaineis.tsx` (2)
- Modify: `src/components/ui/StatCard.test.tsx` (2)

**Task acrescentada durante a execução.** A regra `--c-*` criada na Task 4 revelou uma lacuna do plano: a Task 1 removeu essas variáveis do `index.css`, mas 31 referências continuaram vivas em estilos inline dentro de `.tsx`. Esse código está quebrado desde a Task 1 — `rgb(var(--c-muted))` resolve para vazio. Três dos seis arquivos não pertenciam a nenhuma task.

Sem esta task, `npm run audit:ds` fica vermelho da Task 5 até a 16, e o portão de verificação vira ruído em vez de sinal.

**Interfaces:**
- Consumes: os tokens da Task 1.
- Produces: `npm run audit:ds` verde de novo, restaurando o portão para as tasks seguintes.

- [ ] **Step 1: Registrar o estado inicial**

```bash
grep -rno -- "--c-[a-z-]*" src | wc -l
```

Esperado: `31`.

- [ ] **Step 2: Aplicar o mapa de nomes**

O mesmo mapa da Task 1 Step 3, agora em `.tsx`:

| Antigo | Novo |
|---|---|
| `--c-bg` | `--bg` |
| `--c-card` | `--surface-2` |
| `--c-border` | `--border` |
| `--c-text` | `--text` |
| `--c-secondary` | `--text-secondary` |
| `--c-muted` | `--text-muted` |
| `--c-primary` | `--blue` |
| `--c-primary-dark` | `--blue` |
| `--c-cyan` | `--blue` |
| `--c-orange` | `--orange` |
| `--c-green` | `--green` |
| `--c-red` | `--red` |

`--c-primary` vira `--blue`, não `--orange`, pelo mesmo motivo da Task 2: a troca da cor de marca é isolada na Task 9. As três ocorrências em `Sidebar.tsx` marcam o item ativo e passam a laranja na Task 16 — aqui elas só voltam a funcionar.

Cuidado com colisão de substring: substitua `--c-primary-dark` **antes** de `--c-primary`, e `--c-secondary` antes de qualquer coisa que case com `--c-s`.

- [ ] **Step 3: Confirmar que zerou**

```bash
grep -rn -- "--c-" src | wc -l     # esperado: 0
```

- [ ] **Step 4: Verificar**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run audit:ds
```

Esperado: os quatro passam. Este é o primeiro ponto da migração em que `audit:ds` volta ao verde depois da Task 4.

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "fix(ds): migra as 31 referencias --c-* inline nos .tsx

A Task 1 removeu essas variaveis do index.css mas nao os consumidores em
estilo inline, que resolviam para vazio desde entao. Tres dos seis arquivos
nao pertenciam a nenhuma task do plano original.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# FASE 2 — Utilitários alpha

Levantamento: 405 ocorrências em 60 arquivos, mas a distribuição é muito concentrada. `border-white/[0.08]` sozinho responde por **307**. Por isso a fase é dividida em duas tasks: o substituto em massa e a cauda.

Há também um remendo em `src/index.css:465-478` que hoje faz esses utilitários sobreviverem no tema claro:

```css
.light [class*="bg-white/"]:not([class*="hover:bg-white/"]) { ... }
.light [class*="border-white/"] { ... }
.light [class*="divide-white/"] > * + * { ... }
```

Ele é removido na Task 6, depois que não houver mais consumidor.

## Task 5: Substituto em massa de `border-white/[0.08]`

**Files:**
- Modify: 60 arquivos `.tsx` em `src/` (lista gerada pelo comando abaixo)

- [ ] **Step 1: Registrar a contagem antes**

```bash
grep -rc "border-white/\[0\.08\]" src --include=*.tsx | grep -v ":0$" | awk -F: '{s+=$2} END {print "ocorrencias:", s}'
```

Esperado: `ocorrencias: 307`.

- [ ] **Step 2: Substituir**

```bash
grep -rl "border-white/\[0\.08\]" src --include=*.tsx \
  | xargs sed -i 's|border-white/\[0\.08\]|border-border|g'
```

- [ ] **Step 3: Confirmar que zerou**

```bash
grep -rc "border-white/\[0\.08\]" src --include=*.tsx | grep -v ":0$" | wc -l
```

Esperado: `0`.

- [ ] **Step 4: Verificar**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run audit:ds
```

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "refactor(ds): border-white/[0.08] vira border-border (307 ocorrencias)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

## Task 6: Cauda dos alpha e remoção do remendo do tema claro

**Files:**
- Modify: os arquivos apontados pelo Step 1
- Modify: `src/index.css:465-478` (remoção do bloco de compatibilidade)

- [ ] **Step 1: Listar o que sobrou**

```bash
grep -rnoE "(bg|border|text|from|to|via|ring|divide|shadow)-(white|black)/(\[[0-9.]+\]|[0-9]+)" src --include=*.tsx
```

São ~98 ocorrências. Aplique o mapa abaixo, arquivo por arquivo:

| Padrão | Vira |
|---|---|
| `border-white/[0.03]` `[0.04]` `[0.05]` `[0.06]` | `border-subtle` |
| `border-white/[0.10]` `[0.12]` `[0.14]` | `border-border-hover` |
| `border-white/30` | `border-border-hover` |
| `divide-white/[0.03]` `[0.04]` `[0.05]` `[0.06]` | `divide-subtle` |
| `bg-white/[0.02]` `[0.04]` | `bg-surface-hover` |
| `bg-white/[0.06]` `[0.07]` `[0.08]` | `bg-surface-active` |
| `bg-white/[0.20]` `[0.35]` | `bg-surface-active` |
| `text-white/20` | `text-disabled` |
| `bg-black/40` `bg-black/60` | manter — é overlay de modal, correto nos dois temas |
| `shadow-black/30` `shadow-black/60` | remover a classe; `shadow-lg` já traz a sombra do tema |

`divide-subtle` precisa existir: já foi declarado no `tailwind.config.js` da Task 2 como `subtle`, então a classe é `divide-subtle`.

- [ ] **Step 2: Confirmar que sobrou só o overlay preto**

```bash
grep -rnoE "(bg|border|text|from|to|via|ring|divide|shadow)-(white|black)/(\[[0-9.]+\]|[0-9]+)" src --include=*.tsx | grep -v "bg-black/40\|bg-black/60"
```

Esperado: nenhuma saída.

- [ ] **Step 3: Remover o remendo de compatibilidade do tema claro**

Em `src/index.css`, apague o bloco inteiro das linhas ~465-478, que começa com:

```css
.light [class*="bg-white/"]:not([class*="hover:bg-white/"]) {
```

e termina com o último `.light .shadow-accent { ... }`. Não sobrou nenhum consumidor, e o seletor referencia a classe `.light`, que não existe mais desde a Task 3.

- [ ] **Step 4: Verificar**

```bash
grep -c "\.light" src/index.css     # esperado: 0
npx tsc --noEmit && npm run lint && npm test && npm run audit:ds
```

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "refactor(ds): cauda dos utilitarios alpha e remocao do remendo do tema claro

Os ~98 alpha restantes viram tokens de superficie e borda. O bloco
.light [class*=...] de src/index.css some junto, por nao ter mais consumidor.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# FASE 3 — Auditoria do token `primary`

550 ocorrências em 69 arquivos. A fase é dividida em três tasks para que a troca de cor seja um commit isolado e reversível sozinho.

## Task 7: Inventário classificado

**Files:**
- Create: `docs/superpowers/plans/2026-09-01-inventario-primary.md`

**Interfaces:**
- Produces: o inventário que as Tasks 8 e 9 consomem.

- [ ] **Step 1: Gerar o inventário bruto**

```bash
grep -rnoE ".{0,60}\b(text|bg|border|ring|from|to|via|fill|stroke|shadow|divide|outline|decoration|accent|caret|placeholder)-primary(/[0-9\[][^ \"']*)?.{0,40}" src --include=*.tsx \
  > /tmp/primary-raw.txt
wc -l /tmp/primary-raw.txt
```

Esperado: ~550 linhas.

- [ ] **Step 2: Classificar cada ocorrência**

Crie `docs/superpowers/plans/2026-09-01-inventario-primary.md` com uma tabela `arquivo:linha | trecho | destino`. O destino é `orange` ou `blue`, decidido por estes critérios:

**Vira `orange` (ação, marca, estado ativo):**
- Botão primário, CTA, `<Button variant="primary">`
- Item de navegação ativo, aba ativa, `NavLink` com `isActive`
- Anel de foco (`focus-visible:ring-primary`)
- Ícone ou fundo de logo
- Estado "selecionado" de linha, card ou filtro
- Spinner de carregamento de uma ação disparada pelo usuário

**Vira `blue` (informação, dado):**
- Série de gráfico, barra, linha, fatia, legenda
- Badge ou pílula informativa (`tone="info"`)
- Link dentro de texto corrido
- Valor numérico que representa um dado, não uma ação
- Ícone ilustrativo de card de conteúdo
- Realce de resultado de busca

**Na dúvida, `blue`.** O DS de referência é contido no laranja — ele aparece em quatro lugares na tela toda. Errar para o lado do azul produz um app sóbrio; errar para o lado do laranja produz um app saturado, que é o defeito que esta fase existe para evitar.

- [ ] **Step 3: Conferir que a soma bate**

O inventário tem que ter o mesmo número de linhas do `/tmp/primary-raw.txt`. Se faltar, alguma ocorrência não foi classificada.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-09-01-inventario-primary.md
git commit -m "docs(ds): inventario classificado dos 550 usos de primary

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

## Task 8: Migrar o subconjunto "informação" para `blue`

Esta task é **visualmente neutra**: `primary` ainda aponta para `--blue` no `tailwind.config.js`, então trocar `text-primary` por `text-blue` não muda um pixel. É de propósito — separa o risco de reclassificação do risco de troca de cor.

**Files:**
- Modify: os arquivos marcados como `blue` na Task 7

- [ ] **Step 1: Aplicar as substituições marcadas como `blue`**

Para cada linha do inventário com destino `blue`, troque o sufixo `-primary` por `-blue`, preservando o modificador de opacidade. Exemplos:

```
text-primary        → text-blue
bg-primary/10       → bg-blue/10
border-primary/30   → border-blue/30
hover:text-primary  → hover:text-blue
```

- [ ] **Step 2: Conferir a contagem restante**

```bash
grep -rcE "\b(text|bg|border|ring|from|to|via|fill|stroke|shadow|divide|outline|decoration|accent|caret|placeholder)-primary\b" src --include=*.tsx | grep -v ":0$" | awk -F: '{s+=$2} END {print "primary restante:", s}'
```

Esperado: o número de ocorrências marcadas como `orange` no inventário.

- [ ] **Step 3: Verificar — e confirmar que não houve mudança visual**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run audit:ds
```

Os testes de `Button.test.tsx` que checam `bg-primary` continuam passando, porque o botão primário está no subconjunto `orange` e não foi tocado nesta task.

- [ ] **Step 4: Commit**

```bash
git add -A src
git commit -m "refactor(ds): usos informativos de primary migram para blue

Sem efeito visual: primary ainda aponta para --blue. Separa a reclassificacao
da troca de cor, que acontece na proxima task.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

## Task 9: Trocar `primary` para laranja

**Files:**
- Modify: `tailwind.config.js` (uma linha)
- Modify: `src/components/ui/Button.test.tsx:28`

Este é o commit que muda a identidade do app. Ele é pequeno de propósito: se o resultado não agradar, `git revert` nesta task sozinha devolve o app ao azul sem desfazer nada das fases anteriores.

- [ ] **Step 1: Atualizar o teste do `Button` para o comportamento novo**

Em `src/components/ui/Button.test.tsx:28`, o teste hoje é:

```ts
    expect(btn?.className).toContain('bg-primary')
```

Troque por uma asserção que descreve a intenção, não o alias:

```ts
    // O botao primario usa a cor de marca. Depois da troca do token, marca = laranja.
    expect(btn?.className).toContain('bg-orange')
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx vitest run src/components/ui/Button.test.tsx
```

Esperado: FAIL — o `Button` ainda emite `bg-primary`.

- [ ] **Step 3: Trocar o alias e o `Button`**

Em `tailwind.config.js`, na seção `colors`:

```js
        primary: 'rgb(var(--blue) / <alpha-value>)',
```

vira:

```js
        // Marca. Todos os usos informativos migraram para `blue` na Task 8.
        primary: 'rgb(var(--orange) / <alpha-value>)',
```

Em `src/components/ui/Button.tsx`, no variant `primary`, troque `bg-primary` por `bg-orange` e a cor de texto para `text-white`.

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx vitest run src/components/ui/Button.test.tsx
```

Esperado: PASS.

- [ ] **Step 5: Verificar**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run audit:ds
```

- [ ] **Step 6: Commit**

```bash
git add tailwind.config.js src/components/ui/Button.tsx src/components/ui/Button.test.tsx
git commit -m "feat(ds): primary passa a ser laranja #FF5A1F

Commit deliberadamente pequeno e isolado: revert nele sozinho devolve o app ao
azul sem desfazer as fases 1 e 2.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# FASE 4 — Componentes e shell

## Task 10: Consolidar os variants do `Button`

**Files:**
- Modify: `src/components/ui/Button.tsx`
- Modify: `src/components/ui/Button.test.tsx`
- Modify: os arquivos que usam variants removidos (lista no Step 1)

**Interfaces:**
- Produces: `type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'` e `type ButtonTone = 'orange' | 'blue' | 'green' | 'yellow' | 'red'`. `<Button variant tone>` — `tone` só tem efeito em `outline` e `ghost`.

**Correção aplicada durante a execução.** Esta task partia de uma leitura errada do código: os variants de cor (`red`, `orange`, `green`, `yellow`, `purple`, `cyan`) **não são do `Button`** — são do `<Badge>`, e são tratados na Task 12. Confirmado por levantamento: as 20 ocorrências de variant de cor estão todas em `<Badge>`; as 30 de `ghost`/`outline`/`primary`/`danger` estão todas em `<Button>`.

Consequências: **não há call site para migrar** nesta task, e a prop `tone` proposta abaixo não tem consumidor — ela sai do escopo por YAGNI. O `Button` hoje define `primary`, `ghost`, `danger`, `outline` e `success`; `success` tem **zero** usos e é removido.

O trabalho real desta task é: acrescentar o variant `secondary` (o contraste invertido do DS), remover `success`, e ajustar forma e altura.

- [ ] **Step 1: Confirmar o levantamento**

```bash
grep -rhoE "<[A-Za-z]+[^>]*variant=\"[a-z]+\"" src --include=*.tsx | grep -oE "^<[A-Za-z]+" | sort | uniq -c
grep -rn 'variant="success"' src --include=*.tsx | wc -l
```

Esperado: só `<Badge>` e `<Button>`; `success` com 0 usos.

- [ ] **Step 2: Escrever o teste que falha**

Acrescente em `src/components/ui/Button.test.tsx`:

```ts
  it('secondary usa contraste invertido', () => {
    const { container } = render(<Button variant="secondary">Ação</Button>)
    const btn = container.querySelector('button')
    expect(btn?.className).toContain('bg-text')
    expect(btn?.className).toContain('text-bg')
  })

  it('tone colore o outline sem mudar o variant', () => {
    const { container } = render(<Button variant="outline" tone="green">Ação</Button>)
    const btn = container.querySelector('button')
    expect(btn?.className).toContain('text-green')
    expect(btn?.className).toContain('border-green')
  })
```

- [ ] **Step 3: Rodar e confirmar que falha**

```bash
npx vitest run src/components/ui/Button.test.tsx
```

Esperado: FAIL — `secondary` e a prop `tone` não existem.

- [ ] **Step 4: Implementar**

Em `src/components/ui/Button.tsx`, substitua o mapa de variants por:

```tsx
export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
export type ButtonTone    = 'orange' | 'blue' | 'green' | 'yellow' | 'red'

const VARIANT: Record<ButtonVariant, string> = {
  // `bg-text`/`text-bg` dão o contraste invertido do DS: escuro sobre claro no
  // tema claro, claro sobre escuro no escuro — sem precisar de duas regras.
  primary:   'bg-orange text-white hover:brightness-110 dark:hover:shadow-[0_0_18px_rgb(var(--orange)/.18)]',
  secondary: 'bg-text text-bg hover:opacity-90',
  outline:   'bg-transparent border border-border text-text hover:border-border-hover hover:bg-surface-hover',
  ghost:     'bg-transparent text-secondary hover:bg-surface-hover hover:text-text',
  danger:    'bg-red text-white hover:brightness-110',
}

const TONE: Record<ButtonTone, string> = {
  orange: 'text-orange border-orange',
  blue:   'text-blue border-blue',
  green:  'text-green border-green',
  yellow: 'text-yellow border-yellow',
  red:    'text-red border-red',
}
```

Na assinatura do componente, acrescente `tone?: ButtonTone` e aplique `tone && (variant === 'outline' || variant === 'ghost') ? TONE[tone] : ''` depois de `VARIANT[variant]`, para que o tom sobrescreva a cor base.

Altura e forma: `h-9 rounded-md px-3 text-label font-semibold` (36px, radius 8px, 12px/600).

- [ ] **Step 5: Rodar e confirmar que passa**

```bash
npx vitest run src/components/ui/Button.test.tsx
```

- [ ] **Step 6: Migrar os call sites do Step 1**

| Antes | Depois |
|---|---|
| `variant="red"` | `variant="danger"` |
| `variant="orange"` | `variant="outline" tone="orange"` |
| `variant="green"` | `variant="outline" tone="green"` |
| `variant="yellow"` | `variant="outline" tone="yellow"` |
| `variant="cyan"` | `variant="outline" tone="blue"` |
| `variant="purple"` | `variant="outline" tone="blue"` |

- [ ] **Step 7: Verificar**

```bash
grep -rn 'variant="\(red\|orange\|green\|yellow\|purple\|cyan\)"' src --include=*.tsx   # esperado: vazio
npx tsc --noEmit && npm run lint && npm test && npm run audit:ds
```

- [ ] **Step 8: Commit**

```bash
git add -A src
git commit -m "feat(ds): Button consolida 10 variants em 5 + prop tone

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

## Task 11: `StatCard` com cor por categoria

**Files:**
- Modify: `src/components/ui/StatCard.tsx`
- Modify: `src/components/ui/StatCard.test.tsx`

**Interfaces:**
- Consumes: os tokens `--kpi-ink-*` da Task 1.
- Produces: `StatCardProps` ganha `index?: number`. `StatTone` continua existindo, mas passa a renderizar um badge no canto em vez de pintar o card. `accentToTone()` continua exportada com a mesma assinatura.

Esta é a task que materializa a decisão §3.3 da spec: a cor do card passa a indicar categoria, não status. O status sobrevive como badge.

- [ ] **Step 1: Escrever os testes que falham**

Substitua em `src/components/ui/StatCard.test.tsx` o teste que hoje checa `metric-panel`/`bg-card` (linhas ~98-105) por:

```ts
  it('colore o card pela posicao no grid', () => {
    const { container: c0 } = render(<StatCard title="A" value={1} index={0} />)
    expect((c0.firstChild as HTMLElement).className).toContain('bg-orange')

    const { container: c1 } = render(<StatCard title="B" value={2} index={1} />)
    expect((c1.firstChild as HTMLElement).className).toContain('bg-blue')

    const { container: c3 } = render(<StatCard title="C" value={3} index={3} />)
    expect((c3.firstChild as HTMLElement).className).toContain('bg-yellow')
  })

  it('a quinta posicao volta para a primeira cor', () => {
    const { container } = render(<StatCard title="E" value={5} index={4} />)
    expect((container.firstChild as HTMLElement).className).toContain('bg-orange')
  })

  it('sem index o card fica neutro', () => {
    const { container } = render(<StatCard title="N" value={0} />)
    const cls = (container.firstChild as HTMLElement).className
    expect(cls).toContain('bg-surface-2')
    expect(cls).not.toContain('bg-orange')
  })

  it('o tone vira badge em vez de pintar o card', () => {
    const { container, getByText } = render(
      <StatCard title="X" value={9} index={0} tone="critical" />,
    )
    expect(getByText('Crítico')).toBeInTheDocument()
    expect((container.firstChild as HTMLElement).className).toContain('bg-orange')
  })
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx vitest run src/components/ui/StatCard.test.tsx
```

Esperado: FAIL — `index` não existe e o card ainda usa `metric-panel`.

- [ ] **Step 3: Implementar**

Em `src/components/ui/StatCard.tsx`, acrescente acima do componente:

```tsx
type KpiCategory = 'orange' | 'blue' | 'green' | 'yellow'

const KPI_ORDER: KpiCategory[] = ['orange', 'blue', 'green', 'yellow']

// Claro: preenchimento sólido, com a tinta que passa no WCAG (branco reprova em
// verde e amarelo). Escuro: tint + borda + glow, tinta sempre --text.
const KPI_FILL: Record<KpiCategory, string> = {
  orange: 'bg-orange text-kpi-ink-orange dark:bg-orange/25 dark:text-text dark:border dark:border-orange dark:shadow-[0_0_20px_rgb(var(--orange)/.08)]',
  blue:   'bg-blue   text-kpi-ink-blue   dark:bg-blue/25   dark:text-text dark:border dark:border-blue   dark:shadow-[0_0_20px_rgb(var(--blue)/.08)]',
  green:  'bg-green  text-kpi-ink-green  dark:bg-green/25  dark:text-text dark:border dark:border-green  dark:shadow-[0_0_20px_rgb(var(--green)/.08)]',
  yellow: 'bg-yellow text-kpi-ink-yellow dark:bg-yellow/25 dark:text-text dark:border dark:border-yellow dark:shadow-[0_0_20px_rgb(var(--yellow)/.06)]',
}

const KPI_NEUTRAL = 'bg-surface-2 text-text border border-border'

const TONE_BADGE: Record<Exclude<StatTone, 'neutral'>, { label: string; cls: string }> = {
  critical: { label: 'Crítico', cls: 'bg-red/15    text-red    border-red/30'    },
  warning:  { label: 'Atenção', cls: 'bg-yellow/15 text-yellow border-yellow/30' },
  ok:       { label: 'OK',      cls: 'bg-green/15  text-green  border-green/30'  },
  info:     { label: 'Info',    cls: 'bg-blue/15   text-blue   border-blue/30'   },
}

function ToneBadge({ tone }: { tone: StatTone }) {
  if (tone === 'neutral') return null
  const { label, cls } = TONE_BADGE[tone]
  return (
    <span className={`rounded-pill border px-1.5 py-0.5 text-caption font-semibold ${cls}`}>
      {label}
    </span>
  )
}
```

Na interface, acrescente:

```tsx
  /** Posição no grid de KPIs. Define a cor do card (laranja→azul→verde→amarelo,
   *  ciclando). Sem index, o card fica neutro. */
  index?: number
```

No corpo do componente, a classe do card passa a ser:

```tsx
  const fill = index == null ? KPI_NEUTRAL : KPI_FILL[KPI_ORDER[index % KPI_ORDER.length]]
```

e o container usa `rounded-xl p-4 min-h-[112px] ${fill}` no lugar de `metric-panel ... bg-card`. O número usa `text-display font-bold`, o rótulo `text-label font-medium opacity-80`, e o `<ToneBadge tone={tone} />` fica no canto superior direito junto do ícone de ação.

`TONE_COLOR` e as referências a `rgb(var(--c-*))` no `Sparkline` e no `TrendPill` passam a usar `rgb(var(--green))` / `rgb(var(--red))`.

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx vitest run src/components/ui/StatCard.test.tsx
```

- [ ] **Step 5: Passar `index` nos 12 arquivos que usam `StatCard`**

```bash
grep -rln "StatCard" src --include=*.tsx
```

Em cada grid de KPIs, acrescente `index={i}` no `map`, ou `index={0}`, `index={1}`… quando os cards forem escritos um a um. Cards fora de um grid de KPI (uso avulso dentro de uma seção) ficam **sem** `index`, neutros.

- [ ] **Step 6: Verificar**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run audit:ds
```

- [ ] **Step 7: Commit**

```bash
git add -A src
git commit -m "feat(ds): StatCard colore por categoria e move o status para badge

Implementa a decisao 3.3 da spec. A cor do card passa a indicar posicao no
grid; o tone, que antes pintava o card, vira badge no canto para o sinal de
status nao se perder.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

## Task 12: `Card`, `Badge` e as classes `badge-*`

**Files:**
- Modify: `src/components/ui/Card.tsx`
- Modify: `src/components/ui/Card.test.tsx`
- Modify: `src/components/ui/Badge.tsx`
- Modify: `src/index.css` (bloco `.badge-*`, linhas ~298-312)
- Modify: os arquivos que usam `badge-cyan`, `badge-teal`, `badge-purple`

A spec §7 dizia que `badge-*` seria removida. **Está errada:** o levantamento mostra 20 usos reais (`green` 4, `red` 4, `cyan` 3, `orange` 3, `yellow` 3, `purple` 2, `teal` 1). A classe é remapeada, não removida.

- [ ] **Step 1: Reescrever o bloco `.badge-*` em `src/index.css`**

Substitua as 14 regras (`.badge-green` … `.light .badge-teal`) por cinco, sem variante de tema — os tokens já mudam sozinhos:

```css
.badge-orange { background: rgb(var(--orange) / .14); color: rgb(var(--orange)); border-color: rgb(var(--orange) / .30); }
.badge-blue   { background: rgb(var(--blue)   / .14); color: rgb(var(--blue));   border-color: rgb(var(--blue)   / .30); }
.badge-green  { background: rgb(var(--green)  / .14); color: rgb(var(--green));  border-color: rgb(var(--green)  / .30); }
.badge-yellow { background: rgb(var(--yellow) / .14); color: rgb(var(--yellow)); border-color: rgb(var(--yellow) / .30); }
.badge-red    { background: rgb(var(--red)    / .14); color: rgb(var(--red));    border-color: rgb(var(--red)    / .30); }
```

- [ ] **Step 2: Remapear o mapa de variants do `Badge`**

`src/components/ui/Badge.tsx` traduz `variant` numa classe `badge-*`. O mapa atual tem sete entradas (`green`, `red`, `yellow`, `orange`, `purple`, `cyan`, `teal`) e passa a ter cinco destinos:

```tsx
const VARIANTS = {
  orange: 'badge-orange',
  blue:   'badge-blue',
  green:  'badge-green',
  yellow: 'badge-yellow',
  red:    'badge-red',
  // aposentadas — mantidas como apelido para não quebrar os call sites existentes
  cyan:   'badge-blue',
  purple: 'badge-blue',
  teal:   'badge-green',
}
```

**Defeito latente a corrigir junto:** existe um `variant="desconhecida"` no código que **não consta do mapa** — ele cai em `undefined` e o badge sai sem estilo nenhum. Localize-o e decida o destino pelo contexto (provavelmente um estado "desconhecido", que pede o tom neutro). Se for neutro, acrescente um variant `neutral` com `bg-surface-active text-secondary border-border` e aponte o call site para ele.

```bash
grep -rn 'variant="desconhecida"' src --include=*.tsx
```

- [ ] **Step 3: Atualizar o teste do `Card`**

`src/components/ui/Card.test.tsx:14` checa `toHaveClass('surface-panel')`. A classe `surface-panel` sobrevive (2 usos), então o teste continua válido. Acrescente:

```ts
  it('usa o radius e a superficie do design system', () => {
    const { container } = render(<Card>conteúdo</Card>)
    const el = container.firstChild as HTMLElement
    expect(el.className).toContain('rounded-lg')
    expect(el.className).toContain('bg-surface-2')
  })
```

- [ ] **Step 4: Rodar e confirmar que falha, implementar, confirmar que passa**

```bash
npx vitest run src/components/ui/Card.test.tsx
```

Em `Card.tsx`, o container passa a ser `surface-panel rounded-lg border border-border bg-surface-2 shadow-sm`. Em `Badge.tsx`, os tons apontam para `badge-orange|blue|green|yellow|red`.

- [ ] **Step 5: Verificar**

```bash
grep -rn "badge-cyan\|badge-teal\|badge-purple" src   # esperado: vazio
npx tsc --noEmit && npm run lint && npm test && npm run audit:ds
```

- [ ] **Step 6: Commit**

```bash
git add -A src
git commit -m "feat(ds): Card e Badge nos tokens novos; badge-* remapeada

A spec dizia que badge-* seria removida; sao 20 usos reais, entao ela foi
remapeada. cyan e purple viram blue, teal vira green.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

## Task 13: Controles compactos

**Files:**
- Modify: `src/components/ui/FilterSelect.tsx`
- Modify: `src/components/ui/SearchBox.tsx`
- Modify: `src/components/ui/DateFilterBar.tsx`
- Modify: `src/components/ui/TabBar.tsx`
- Modify: `src/components/ui/Modal.tsx`
- Modify: `src/components/ui/Drawer.tsx`
- Modify: `src/components/ui/Skeleton.tsx`
- Modify: `src/components/ui/EmptyState.tsx`
- Modify: `src/components/ui/DataTable.tsx`

Especificação comum, do item 14 do DS: altura 32-34px, `rounded-md` (8px), `border-border`, fundo `bg-surface-2` no claro e `bg-surface-1` no escuro, placeholder em `text-muted`, ícone em `text-secondary`.

- [ ] **Step 1: Aplicar em cada arquivo**

Classe base dos controles:

```
h-8 rounded-md border border-border bg-surface-2 px-2.5 text-label text-text
placeholder:text-muted hover:border-border-hover
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40
```

`Modal` e `Drawer`: `bg-surface-3 border border-border rounded-xl shadow-lg`. O overlay continua `bg-black/60`.

`Skeleton`: `bg-surface-hover animate-pulse rounded-md`.

`TabBar`: aba ativa `text-text border-b-2 border-orange`; inativa `text-muted hover:text-secondary`.

`DataTable`: cabeçalho `bg-surface-hover text-muted text-caption uppercase`; linha `border-b border-subtle`, hover `bg-surface-hover`, selecionada `bg-orange/8`.

- [ ] **Step 2: Verificar**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run audit:ds
```

- [ ] **Step 3: Commit**

```bash
git add -A src/components/ui
git commit -m "feat(ds): controles compactos nos tokens novos

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

## Task 14: Componente `Avatar`

**Files:**
- Create: `src/components/ui/Avatar.tsx`
- Create: `src/components/ui/Avatar.test.tsx`

**Interfaces:**
- Produces: `<Avatar name: string; src?: string; size?: 'sm' | 'md' />` — `sm` 30px, `md` 38px. Sem `src`, renderiza as iniciais.

- [ ] **Step 1: Escrever o teste que falha**

```tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Avatar } from './Avatar'

describe('Avatar', () => {
  it('mostra as iniciais quando nao ha imagem', () => {
    const { getByText } = render(<Avatar name="Sérgio Oliveira" />)
    expect(getByText('SO')).toBeInTheDocument()
  })

  it('usa quadrado arredondado, nao circulo', () => {
    const { container } = render(<Avatar name="Ana" />)
    const el = container.firstChild as HTMLElement
    expect(el.className).toContain('rounded-[9px]')
    expect(el.className).not.toContain('rounded-full')
  })

  it('renderiza a imagem com alt quando ha src', () => {
    const { getByAltText } = render(<Avatar name="Ana" src="/a.png" />)
    expect(getByAltText('Ana')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx vitest run src/components/ui/Avatar.test.tsx
```

Esperado: FAIL — `Cannot find module './Avatar'`.

- [ ] **Step 3: Implementar**

```tsx
export interface AvatarProps {
  name: string
  src?: string
  size?: 'sm' | 'md'
  className?: string
}

const SIZE = { sm: 'h-[30px] w-[30px] text-caption', md: 'h-[38px] w-[38px] text-label' }

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  const first = parts[0][0] ?? ''
  const last  = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : ''
  return (first + last).toUpperCase()
}

export function Avatar({ name, src, size = 'md', className = '' }: AvatarProps) {
  const base = `${SIZE[size]} rounded-[9px] overflow-hidden flex-shrink-0 ${className}`
  if (src) {
    return <img src={src} alt={name} className={`${base} object-cover`} />
  }
  return (
    <div
      className={`${base} flex items-center justify-center bg-surface-active font-semibold text-secondary`}
      aria-hidden="true"
    >
      {initials(name)}
    </div>
  )
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx vitest run src/components/ui/Avatar.test.tsx
```

Esperado: PASS, 3 testes.

- [ ] **Step 5: Verificar e commitar**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run audit:ds
git add src/components/ui/Avatar.tsx src/components/ui/Avatar.test.tsx
git commit -m "feat(ds): componente Avatar quadrado arredondado

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

## Task 15: Shell arredondado

**Files:**
- Modify: `src/components/layout/AppLayout.tsx:80-105`
- Modify: `src/components/layout/Navbar.tsx:73-74`
- Modify: `src/index.css` (`.app-content`, `.navbar-premium`, linhas ~561 e ~615)

**Decisão de implementação, registrada aqui porque muda o risco da task:** a referência mostra um container arredondado envolvendo sidebar e conteúdo. O layout atual **não é flex** — `Sidebar` e `Navbar` são `position: fixed`, e o `<main>` compensa com `md:pl-[248px]` e `pt-[7.5rem]`. Reestruturar para flex/grid mexeria em cabeçalhos sticky, tabelas virtualizadas (`@tanstack/react-virtual`) e no drawer mobile.

O shell é obtido **recuando os painéis fixos e arredondando-os**, não reestruturando o layout. O resultado visual é o mesmo e o risco é uma fração.

- [ ] **Step 1: Recuar e arredondar no `AppLayout`**

Em `src/components/layout/AppLayout.tsx`, o `<div className="app-shell ...">` passa a ter padding, e o `<main>` ganha superfície própria:

```tsx
      <div className="app-shell min-h-screen max-w-full overflow-x-clip bg-bg text-text md:p-3">
```

e o `<main>`:

```tsx
        <main className={`app-main min-w-0 max-w-full overflow-x-clip pt-[7.5rem] transition-[padding] duration-200 md:pt-[6.5rem]
                          ${sidebarOpen ? 'md:pl-[260px]' : 'md:pl-[76px]'}`}>
          <div className="app-content animate-page-enter rounded-2xl border border-border bg-surface-1 px-3 pb-10 pt-4 shadow-sm sm:px-5 lg:px-7 lg:pt-6">
```

Os offsets sobem de 248/64 para 260/76 para acomodar os 12px de recuo lateral.

- [ ] **Step 2: Recuar e arredondar o `Navbar`**

Em `src/components/layout/Navbar.tsx:73-74`:

```tsx
    <header className={`navbar-premium fixed left-0 right-0 top-0 z-header flex h-16 max-w-full items-center gap-1.5 px-2 transition-[left] duration-200 sm:gap-3 sm:px-4
                        ${sidebarOpen ? 'md:left-[248px]' : 'md:left-[64px]'}`}>
```

vira:

```tsx
    <header className={`navbar-premium fixed left-0 right-0 top-0 z-header flex h-16 max-w-full items-center gap-1.5 px-2 transition-[left] duration-200 sm:gap-3 sm:px-4
                        md:right-3 md:top-3 md:rounded-2xl md:border md:border-border
                        ${sidebarOpen ? 'md:left-[260px]' : 'md:left-[76px]'}`}>
```

- [ ] **Step 3: Limpar `.navbar-premium` e `.app-content` no `index.css`**

`.navbar-premium` hoje tem uma variante `.light`. Substitua as duas regras por uma:

```css
.navbar-premium {
  background: rgb(var(--surface-1) / .82);
  backdrop-filter: blur(12px);
}
```

`.app-content` mantém só o que não for cor (largura máxima, gap). Cores saem — passaram para as classes utilitárias do Step 1.

- [ ] **Step 4: Verificar**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run audit:ds
npm run dev
```

Abra `http://localhost:3000` e confira nos dois temas: o conteúdo tem cantos arredondados, a navbar flutua recuada, e não há barra de rolagem horizontal.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/AppLayout.tsx src/components/layout/Navbar.tsx src/index.css
git commit -m "feat(ds): shell arredondado por recuo dos paineis fixos

O layout continua fixed em vez de virar flex: reestruturar mexeria em headers
sticky, tabelas virtualizadas e no drawer mobile, sem ganho visual.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

## Task 16: Sidebar e remoção das cores de grupo

**Files:**
- Modify: `src/lib/navigation.ts:19-55` (remove o campo `color`)
- Modify: `src/lib/navigation.test.ts` (se asseverar `color`)
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/components/ui/GlobalSearch.tsx` (consome `NavGroup`)
- Modify: `src/index.css` (blocos `.nav-link-*`, `.grp-*`, `.sidebar-premium` — linhas ~249-296 e ~620-643)
- Modify: `src/components/ui/LogoIcon.tsx` ou seu call site em `Sidebar.tsx:166`

- [ ] **Step 1: Remover `color` de `NavGroup`**

Em `src/lib/navigation.ts`, tire `color: string` da interface `NavGroup` e a propriedade `color: '#...'` dos quatro grupos. Rode:

```bash
npx tsc --noEmit
```

O compilador aponta todos os consumidores. Esperado: `Sidebar.tsx` (props `groupColor`) e possivelmente `GlobalSearch.tsx`.

- [ ] **Step 2: Remover `groupColor` do `NavItem`**

Em `src/components/layout/Sidebar.tsx`, tire `groupColor` de `NavItemProps` e as três aplicações (`style={isActive ? { color: groupColor } : {}}` na linha ~69, o `CaretRight` na ~74, e o `<div style={{ background: groupColor }}>` na ~88). Tire também `groupKey` se ele só existia para montar `nav-link-${groupKey}`.

O item passa a ser:

```tsx
        className={({ isActive }) =>
          `flex min-h-11 items-center gap-3 rounded-lg py-2.5 pl-3 pr-2.5 text-label transition-colors
           ${isActive
             ? 'border-r-2 border-orange bg-orange/10 font-semibold text-text dark:bg-orange/[.18]'
             : 'text-secondary hover:bg-surface-hover hover:text-text'}`
        }
```

`bg-orange/10` no claro resolve para aproximadamente `#FFF0EA`, que é o valor pedido pelo DS, sem precisar de um hex fixo fora da baseline.

- [ ] **Step 3: Cabeçalho de grupo neutro**

O `<div style={{ background: group.color + '99' }}>` da linha ~198 sai. O rótulo do grupo (linha ~193) passa a `text-caption font-semibold uppercase tracking-wide text-muted`.

- [ ] **Step 4: Sidebar como painel**

Na linha ~149, a classe do `<aside>` passa a incluir o recuo e o radius, casando com o shell da Task 15:

```tsx
      className={`sidebar-premium fixed left-0 top-0 z-[400] flex h-full w-[min(88vw,300px)]
                  select-none flex-col overflow-hidden transition-[width,transform] duration-200
                  md:z-sidebar md:left-3 md:top-3 md:h-[calc(100vh-1.5rem)] md:rounded-xl md:border md:border-border
                  ${sidebarOpen
                    ? 'translate-x-0 md:w-[248px]'
                    : '-translate-x-full md:w-[64px] md:translate-x-0'}`}
```

E em `src/index.css`, as duas regras de `.sidebar-premium` (com e sem `.light`) viram uma:

```css
.sidebar-premium {
  background: rgb(var(--surface-1) / .82);
  backdrop-filter: blur(12px);
}
```

- [ ] **Step 5: Corrigir o logo no tema claro**

`Sidebar.tsx:166` aplica `filter: 'brightness(0) invert(1)'` no `LogoIcon`, que força o logo a branco. Com a sidebar branca no tema claro, isso o torna invisível. Troque por um filtro sensível ao tema:

```tsx
<LogoIcon className="w-[17px] h-[17px] [filter:brightness(0)] dark:[filter:brightness(0)_invert(1)]" />
```

Remova o `style={{ filter: ... }}`.

- [ ] **Step 6: Apagar as classes mortas do `index.css`**

Apague os blocos `.nav-link-agora|operar|analisar|infra` (e suas variantes `.active` e `:hover`), `.nav-active`, `.grp-*-line`, `.grp-*-text`, `.grp-dot-*`. São as linhas ~258-296 e ~627-643.

- [ ] **Step 7: Verificar**

```bash
grep -rn "nav-link-\|grp-erp\|grp-ops\|grp-anal\|grp-infra\|groupColor" src   # esperado: vazio
npx tsc --noEmit && npm run lint && npm test && npm run audit:ds
```

- [ ] **Step 8: Commit**

```bash
git add -A src
git commit -m "feat(ds): sidebar como painel; laranja marca so o item ativo

Remove as quatro cores de grupo do NAV_GROUPS e as classes .nav-link-*/.grp-*
que existiam para elas. Corrige o logo, que era forcado a branco e sumia na
sidebar clara.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# FASE 5 — Gráficos e exportação

## Task 17: Gráficos na escala categórica

**Files:**
- Modify: `src/components/ui/bar-chart.tsx`
- Modify: `src/components/ui/line-chart.tsx`
- Modify: `src/components/ui/pie-chart.tsx`
- Modify: `src/components/ui/DonutChart.tsx`
- Modify: `src/components/ui/ChartCard.tsx`

Recharts precisa de string de cor em runtime, não de classe Tailwind. Os quatro arquivos já leem o tema — a Task 3 inverteu a condição, agora eles precisam ler as cores certas.

- [ ] **Step 1: Centralizar a leitura de cor**

Crie em `src/lib/chartTheme.ts`:

```ts
/** Lê um token do design system como string CSS utilizável pelo Recharts. */
export function token(name: string, alpha = 1): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim()
  return alpha === 1 ? `rgb(${raw})` : `rgb(${raw} / ${alpha})`
}

export function isDark(): boolean {
  return document.documentElement.classList.contains('dark')
}

export const chartSeries = (): string[] =>
  [1, 2, 3, 4, 5, 6].map(i => token(`chart-${i}`))

export const chartAxis = () => ({
  grid:  isDark() ? 'rgba(255,255,255,.04)' : token('border-subtle'),
  axis:  isDark() ? '#666666' : token('text-disabled'),
  label: token('text-muted'),
})
```

- [ ] **Step 2: Trocar as cores hard-coded nos cinco arquivos**

`bar-chart.tsx` e `pie-chart.tsx` têm hoje `#27272a` e `#e4e4e7` na baseline por arquivo. Substitua por `chartAxis().grid` e `chartAxis().label`. As séries passam a vir de `chartSeries()`.

Tooltip: fundo `token('surface-3')`, borda `token('border')`, texto `token('text')`.

- [ ] **Step 3: Limpar a baseline por arquivo**

Em `scripts/audit-ds-baseline.json`, remova as entradas de `src/components/ui/bar-chart.tsx` e `src/components/ui/pie-chart.tsx` — os hex saíram do código.

- [ ] **Step 4: Verificar**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run audit:ds
```

- [ ] **Step 5: Commit**

```bash
git add -A src scripts/audit-ds-baseline.json
git commit -m "feat(ds): graficos leem tokens em runtime via lib/chartTheme

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

## Task 18: Exportação de imagem e PDF

**Files:**
- Modify: `src/lib/captureOSTable.ts`
- Modify: `src/lib/captureTableImage.ts`
- Modify: `src/features/gerencial/GerencialPage.tsx`

Estes três geram imagem e PDF com paletas literais (`LIGHT` / `DARK`) que hoje são da paleta zinc/blue.

- [ ] **Step 1: Atualizar as constantes de paleta**

Em `captureOSTable.ts`, os objetos `LIGHT` e `DARK` passam a usar os hex da paleta nova: fundo `#FFFFFF`/`#0C0C0C`, texto `#171717`/`#FFFFFF`, secundário `#444444`/`#B5B5B5`, borda `#E8E8E8`/`#252525`, acento `#FF5A1F` nos dois. Mesma coisa em `captureTableImage.ts` e no bloco de cores de `GerencialPage.tsx:106+`.

- [ ] **Step 2: Atualizar a baseline por arquivo**

Substitua as entradas desses três arquivos em `scripts/audit-ds-baseline.json` pelos hex novos, ou remova-as se todos os hex usados já estiverem em `globalHex`.

- [ ] **Step 3: Verificar manualmente**

```bash
npm run dev
```

Em `/ordens`, exporte a tabela como imagem nos dois temas. Confirme que a imagem sai com as cores **do tema ativo** — este é o bug que a Task 3 poderia ter introduzido silenciosamente.

- [ ] **Step 4: Verificar e commitar**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run audit:ds
git add -A src scripts/audit-ds-baseline.json
git commit -m "feat(ds): exportacao de imagem e PDF na paleta nova

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# FASE 6 — Varredura

## Task 19: Rota a rota, nos dois temas

**Files:**
- Modify: qualquer arquivo com resíduo visual encontrado
- Modify: `scripts/audit-ds-baseline.json` (limpeza final do objeto `files`)

- [ ] **Step 1: Percorrer as 14 rotas**

```bash
npm run dev
```

Em cada rota, nos dois temas, confira: contraste de texto, superfície do card distinta do fundo, borda visível, KPI colorido com tinta legível, gráfico com série distinguível, estado vazio, estado de carregamento.

Rotas: `/`, `/ordens`, `/erp/ordens`, `/erp/equipes`, `/erp/dispatch`, `/erp/alertas`, `/erp/rede`, `/graficos`, `/cidades`, `/campo`, `/fornecedor`, `/juniper`, `/fechamento`, `/mapa`, `/noc`.

- [ ] **Step 2: Caçar resíduo do design antigo**

```bash
grep -rn -- "--c-" src
grep -rn "bg-white/\|border-white/\|divide-white/" src --include=*.tsx | grep -v "bg-black/"
grep -rn "card-premium\|number-display\|glass\b\|mesh-bg\|aurora-bg\|text-gradient\|glow-text\|icon-container" src --include=*.tsx
```

Esperado: nenhuma saída nos três.

**Resíduo `.light` no CSS.** A Task 3 renomeou a classe de tema para `.dark`, o que torna **toda regra prefixada com `.light `** código morto — o seletor deixa de casar com qualquer elemento. Isso não é erro de build nem de tipo: a regra simplesmente para de aplicar, em silêncio.

```bash
grep -rn "\.light" src/index.css src --include="*.tsx" --include="*.ts"
```

Esperado: nenhuma saída. **Inclua os `.tsx`/`.ts` na varredura, não só o `index.css`** — componentes com `<style>` inline (CSS-in-JS) também carregam seletores `.light`, e um deles (`AnimatedThemeToggler`) já foi encontrado assim durante a Fase 1: o botão de tema ficava com tinta branca a 82% sobre superfície clara, praticamente invisível, sem erro de build, de lint ou de teste. A maior parte já saiu nas tasks anteriores (o remendo `[class*=]` na Task 6, `.light .badge-*` na 12, `.light .navbar-premium` na 15, `.light .sidebar-premium` na 16). O que restar é de duas naturezas:

- Variante clara de classe **que sobrevive** (`.light .card-premium`) — o par de regras `.x` / `.light .x` colapsa em uma só, porque os tokens já mudam com o tema. Se o valor claro for genuinamente diferente do escuro, a regra vira `.dark .x`.
- Variante clara de classe **morta** (`.light .glass`, `.light .border-glow`, `.light .border-ghost`) — sai junto com a classe base no Step 3.

Um segundo bloco de tokens navy rotulado `/* Cabonnet Control Surface — fundação visual 2026 */`, resíduo do restyle rejeitado em 2026-07-22, foi encontrado e removido durante a Task 1. Confirme que não voltou:

```bash
grep -c "^:root" src/index.css        # tem que ser 1
grep -n "Control Surface" src/index.css   # não pode retornar nada
```

- [ ] **Step 3: Apagar as classes mortas restantes do `index.css`**

Confirmado por levantamento que têm **zero** usos: `.stagger`, `.glass`, `.nav-active`, `.hover-lift`, `.float-hover`, `.shimmer-bg`, `.section-enter`, `.g-tab-enter`, `.logo-glow`, `.border-glow`, `.border-ghost`, `.donut-root`, `.gradient-sep`, `.gradient-sep-subtle`, `.text-gradient*`, `.icon-container-primary`, `.pulse-glow*`, `.map-tiles-dark`, `.animate-slide-left`, `.animate-count-up`, e os keyframes que só elas usavam (`floatUp`, `slideRight`, `shimmer`, `glowPulse*`, `countUp`, `gradientFlow`, `slideInLeft`, `g-tab-in`, `breathe` se não sobrar consumidor).

**Preserve:** `.breathe` (7 usos), `.card-premium` (1), `.navbar-premium` (1), `.sidebar-premium` (1), `.number-display` (1), `.app-content` (1), `.surface-panel` (2), `.metric-panel` (3), `.page-header` (7), `.page-header-icon` (1), `.map-tooltip` (4), e todo o bloco `.leaflet-*`, que estiliza o mapa e não é do design system.

Antes de apagar, confirme o uso de cada uma:

```bash
for c in stagger glass nav-active hover-lift float-hover shimmer-bg section-enter logo-glow border-glow border-ghost donut-root gradient-sep text-gradient icon-container-primary pulse-glow map-tiles-dark; do
  echo "$c: $(grep -row "\b$c\b" src --include=*.tsx | wc -l)"
done
```

- [ ] **Step 4: Retirar os aliases de compatibilidade**

A Task 2 manteve aliases para o app não quebrar durante as fases 2-4. Agora eles saem. Migre os call sites e depois apague a entrada do `tailwind.config.js`:

| Alias | Usos no início | Vira |
|---|---|---|
| `shadow-2xl` | 15 | `shadow-lg` |
| `shadow-accent` | 5 | `shadow-accent` (mantido — é o glow laranja do DS) |
| `shadow-xs` | 1 | `shadow-sm` |
| `primary-dark` | 2 | `blue` |
| `bg-card` / `bg-card-high` / `bg-card-highest` | — | `bg-surface-2` / `bg-surface-hover` / `bg-surface-active` |
| `bg-elevated` | — | `bg-surface-3` |
| `bg-surface` | — | `bg-surface-hover` |
| `cyan` / `teal` / `purple` | — | `blue` / `green` / `chart-6` |

Confirme a contagem de cada um antes e depois:

```bash
for c in shadow-2xl shadow-xs primary-dark bg-card bg-card-high bg-card-highest bg-elevated bg-surface text-cyan bg-cyan text-teal text-purple; do
  echo "$c: $(grep -row "\b$c\b" src --include=*.tsx | wc -l)"
done
```

Depois de zerados, apague do `tailwind.config.js` as chaves `card`, `card-high`, `card-highest`, `elevated`, `surface`, `cyan`, `teal`, `purple`, `primary-light`, `primary-dark`, e as sombras `xs` e `2xl`. Rode `npx tsc --noEmit && npm run lint` — se alguma classe tiver escapado, ela some da UI em silêncio, então confira visualmente as rotas afetadas.

- [ ] **Step 5: Limpar a baseline por arquivo**

Em `scripts/audit-ds-baseline.json`, o objeto `files` guarda exceções do design antigo. Remova cada entrada e rode `npm run audit:ds`; se reprovar, o hex ainda está no código e precisa virar token.

- [ ] **Step 6: Verificação final**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run audit:ds && npm run build && npm run test:e2e
```

Os seis. `npm run build` entra aqui, ao final, para confirmar que o bundle sai.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore(ds): varredura final das 14 rotas nos dois temas

Remove as classes mortas do design antigo e zera as excecoes por arquivo da
baseline da auditoria.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Correções que este plano faz na spec

Levantamentos feitos durante a escrita do plano contradisseram três pontos da spec. Aplicar ao arquivo de spec ao final:

1. **§7 — `badge-*` não é removida.** São 20 usos reais; a classe é remapeada (`cyan`/`purple` → `blue`, `teal` → `green`).
2. **§7 — a lista de animações preservadas estava errada.** As 5 efetivamente usadas são `fade-in`, `card-enter`, `slide-down`, `scale-in`, `page-enter` — não `slide-up` nem `pop-in`, que têm zero usos.
3. **§4 — quatro valores da paleta reprovaram no WCAG AA** e foram ajustados: `--text-muted` nos dois temas, `--blue` no escuro, e a tinta do KPI preenchido no claro, que não pode ser branca em verde nem em amarelo.
