# Dashboard Restyle — Navy + Teal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repintar os tokens neutros de `src/index.css` (dark + light) de zinc puro para navy-tintado, e criar um tratamento visual "card âncora" fixo-escuro aplicado só ao `PulsoHero`, conforme `docs/superpowers/specs/2026-07-22-dashboard-restyle-navy-teal-design.md`.

**Architecture:** Troca de valores RGB nas custom properties `--c-*` de superfície (bg/elevated/surface/card/card-high/card-highest/border) em `:root` (dark) e `.light`. Nova classe utilitária `.card-anchor` que redeclara localmente todo o conjunto de tokens (superfície + texto + semânticas) fixados nos valores do tema dark pós-restyle, garantindo que o card fique visualmente idêntico independente do tema ativo em `<html>` — sem precisar sobrescrever cada `className` individual dentro do `PulsoHero` (a herança de CSS custom properties resolve isso automaticamente para os descendentes). `PulsoHero.tsx` troca `border border-border bg-card` por `card-anchor`.

**Tech Stack:** React 18 + TypeScript + Tailwind (tokens via CSS custom properties em `src/index.css`), Vitest, ESLint.

## Global Constraints

- `npm run build`, `npm run lint`, `npx tsc --noEmit`, `npm run audit:ds`, `npm test` devem passar limpos antes de qualquer commit.
- Cores semânticas de status (`--c-green`, `--c-red`, `--c-yellow`, `--c-orange`, `--c-purple`, `--c-pink`, `--c-teal`) e `--c-primary`/`--c-cyan` **não mudam de valor** nos temas `:root`/`.light` — só as superfícies neutras (`--c-bg`, `--c-elevated`, `--c-surface`, `--c-card`, `--c-card-high`, `--c-card-highest`, `--c-border`).
- Nenhuma mudança de estrutura/conteúdo do `DashboardPage.tsx` — só tokens de CSS + a classe do `PulsoHero`.
- Nenhuma fonte nova, nenhuma dependência nova.
- `.card-anchor` é escopo exclusivo do `PulsoHero` nesta onda — nenhum outro componente recebe a classe.

---

### Task 1: Repintar tokens neutros dark + light em `src/index.css`

**Files:**
- Modify: `src/index.css:8-21` (bloco `:root`, comentário + superfícies dark)
- Modify: `src/index.css:51-61` (bloco `.light`, comentário + `--c-bg`/`--c-border`)

**Interfaces:**
- Nenhuma — só valores de custom properties já consumidas via `tailwind.config.js` (`colors.bg`, `.card`, `.border` etc). Nomes dos tokens não mudam, só os RGB.

- [ ] **Step 1: Repintar o bloco `:root` (tema dark)**

Em `src/index.css`, substituir (linhas 8-21):
```css
/* ═══════════════════════════════════════════════════════════════
   DESIGN TOKENS — Stripe / Clerk reference
   Paleta zinc-neutral (sem saturação azulada no fundo).
   Dark = padrão (:root) · Light = sobrescrito por .light em <html>
═══════════════════════════════════════════════════════════════ */
:root {
  /* ── Superfícies — zinc neutral dark ── */
  --c-bg:           9   9  11;    /* #09090B  zinc-950               */
  --c-elevated:    18  18  20;    /* #121214  1 grau acima           */
  --c-surface:     24  24  27;    /* #18181B  zinc-900               */
  --c-card:        19  19  21;    /* #131315  card base              */
  --c-card-high:   26  26  29;    /* #1A1A1D  card elevado           */
  --c-card-highest:33  33  37;    /* #212125  card destaque          */
  --c-border:      39  39  42;    /* #27272A  zinc-800 — sólido      */
```
por:
```css
/* ═══════════════════════════════════════════════════════════════
   DESIGN TOKENS — Stripe / Clerk reference
   Paleta navy-tintada (restyle 2026-07-22 — ver docs/superpowers/specs/
   2026-07-22-dashboard-restyle-navy-teal-design.md).
   Dark = padrão (:root) · Light = sobrescrito por .light em <html>
═══════════════════════════════════════════════════════════════ */
:root {
  /* ── Superfícies — navy dark ── */
  --c-bg:           10  15  28;   /* #0A0F1C  navy-950               */
  --c-elevated:     16  24  39;   /* #101827  1 grau acima           */
  --c-surface:      20  28  46;   /* #141C2E  navy-900               */
  --c-card:         15  23  38;   /* #0F1726  card base              */
  --c-card-high:    22  33  58;   /* #16213A  card elevado           */
  --c-card-highest: 30  44  72;   /* #1E2C48  card destaque          */
  --c-border:       35  49  80;   /* #233150  navy-800 — sólido      */
```

- [ ] **Step 2: Repintar o bloco `.light` (tema claro)**

Em `src/index.css`, substituir (linhas 51-61):
```css
/* ─── Tema claro ─────────────────────────────────────────────── */
.light {
  /* Hierarquia de superfícies no estilo Stripe:
     bg (zinc-100) → card (branco) → surface (gray-50, hovers visíveis) */
  --c-bg:           244 244 245; /* zinc-100 — fundo da página             */
  --c-elevated:     255 255 255; /* white    — overlays, dropdowns          */
  --c-surface:      249 250 251; /* gray-50  — hover, inputs, superfícies   */
  --c-card:         255 255 255; /* white    — cards se destacam do bg cinza*/
  --c-card-high:    243 244 246; /* gray-100 — row hover, elementos elevados*/
  --c-card-highest: 229 231 235; /* gray-200 — maior destaque dentro de card*/
  --c-border:       228 228 231; /* zinc-200 */
```
por:
```css
/* ─── Tema claro ─────────────────────────────────────────────── */
.light {
  /* Hierarquia de superfícies no estilo Stripe:
     bg (lavanda clara, navy-tintada) → card (branco) → surface (gray-50, hovers visíveis) */
  --c-bg:           238 240 247; /* #EEF0F7 — fundo da página, navy-tintado */
  --c-elevated:     255 255 255; /* white    — overlays, dropdowns          */
  --c-surface:      249 250 251; /* gray-50  — hover, inputs, superfícies   */
  --c-card:         255 255 255; /* white    — cards se destacam do bg cinza*/
  --c-card-high:    243 244 246; /* gray-100 — row hover, elementos elevados*/
  --c-card-highest: 229 231 235; /* gray-200 — maior destaque dentro de card*/
  --c-border:       222 226 237; /* #DEE2ED — navy-tintado */
```

- [ ] **Step 3: Type-check, lint e build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: sem erros (mudança é só de valores RGB em custom properties já existentes — nenhum nome de token muda).

- [ ] **Step 4: Rodar a suíte de testes (regressão)**

Run: `npm test`
Expected: PASS — nenhum teste existente faz asserção sobre valores de cor de `index.css`.

- [ ] **Step 5: Verificação manual no navegador — paleta**

Run: `npm run dev` (porta 3000).

No navegador, autenticado:
1. Alternar entre tema dark e light (toggle do app) e navegar em pelo menos 3 páginas (`/`, `/ordens`, `/graficos`).
2. Confirmar que o fundo tem uma leve tonalidade azulada (navy) em vez de cinza puro, nos dois temas.
3. Confirmar que texto, bordas e badges de status continuam legíveis (sem quebra de contraste) em ambos os temas.

Reportar o resultado antes de prosseguir. Se algo divergir (ex: contraste ruim em algum canto), ajustar os RGB antes do commit.

- [ ] **Step 6: Commit**

```bash
git add src/index.css
git commit -m "$(cat <<'EOF'
style(tokens): repinta superficies neutras de zinc para navy-tintado

Dark e light theme via docs/superpowers/specs/2026-07-22-dashboard-restyle-navy-teal-design.md.
Cores semanticas de status e primary/cyan nao mudam.
EOF
)"
```

---

### Task 2: Card âncora — `.card-anchor` no `PulsoHero`

**Files:**
- Modify: `src/index.css` (nova classe `.card-anchor`, inserida após o bloco `.card-premium`, ~linha 211)
- Modify: `src/features/dashboard/PulsoHero.tsx:58-61` (div raiz do componente)

**Interfaces:**
- Nenhuma — `.card-anchor` é puramente CSS (classe utilitária), consumida via `className` no JSX. Não introduz nenhuma prop/tipo novo no `PulsoHero`.

- [ ] **Step 1: Adicionar a classe `.card-anchor` em `src/index.css`**

Em `src/index.css`, logo após o bloco de `.card-premium` (linhas 193-211):
```css
/* ── Card base ──
   A borda é definida via Tailwind (border border-white/[0.08]) nos componentes.
   O override .light [class*="border-white/"] cuida do light mode automaticamente.
   .card-premium só adiciona hover e sombras — não sobrescreve a borda. */
.card-premium {
  position: relative;
  transition: border-color 150ms ease, box-shadow 150ms ease;
}
.card-premium:hover {
  border-color: rgba(255,255,255,0.14);
  box-shadow: 0 4px 16px rgba(0,0,0,.25), 0 1px 4px rgba(0,0,0,.15);
}
.light .card-premium {
  box-shadow: 0 1px 3px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04);
}
.light .card-premium:hover {
  border-color: rgb(var(--c-muted) / 0.35);
  box-shadow: 0 4px 12px rgba(0,0,0,.09), 0 1px 3px rgba(0,0,0,.06);
}
```
adicionar logo abaixo (antes do comentário `/* ── Glass ── */`):
```css

/* ── Card âncora — fundo navy fixo, independente do tema ativo ──
   Redeclara localmente os tokens de superfície/texto/semânticos nos valores
   do tema dark pós-restyle (2026-07-22). Como custom properties são herdadas,
   qualquer classe descendente que leia var(--c-text)/var(--c-surface)/etc
   (inclusive o override .light [class*="border-white/"]) resolve sozinha
   para os valores fixos abaixo — nenhum className interno do PulsoHero
   precisa ser tocado. Escopo: só o PulsoHero nesta onda. */
.card-anchor {
  --c-bg:            10  15  28;
  --c-elevated:      16  24  39;
  --c-surface:       20  28  46;
  --c-card:          15  23  38;
  --c-card-high:     22  33  58;
  --c-card-highest:  30  44  72;
  --c-border:        35  49  80;

  --c-text:         245 247 251;
  --c-secondary:    196 206 224;
  --c-muted:        148 163 191;
  --c-disabled:      63  63  70;

  --c-primary:       59 130 246;
  --c-primary-light: 96 165 250;
  --c-primary-dark:  37  99 235;
  --c-cyan:          34 211 238;

  --c-green:  74 222 128;
  --c-yellow: 250 204  21;
  --c-red:    248 113 113;
  --c-orange: 251 146  60;
  --c-purple: 167 139 250;
  --c-pink:   244 114 182;
  --c-teal:    45 212 191;

  background: linear-gradient(135deg, rgb(15 31 61) 0%, rgb(20 40 74) 100%);
  border: 1px solid rgb(var(--c-border));
  color: rgb(var(--c-text));
}
```

- [ ] **Step 2: Aplicar `.card-anchor` no `PulsoHero`**

Em `src/features/dashboard/PulsoHero.tsx`, substituir (linhas 58-61):
```tsx
  return (
    <div
      className="rounded-lg border border-border bg-card"
      style={{ borderLeft: `2px solid ${scoreColor}` }}
    >
```
por:
```tsx
  return (
    <div
      className="rounded-lg card-anchor"
      style={{ borderLeft: `2px solid ${scoreColor}` }}
    >
```

`borderLeft` inline continua vencendo só o lado esquerdo (cor do score), preservando o comportamento atual — `.card-anchor` define os outros 3 lados via `border` shorthand.

- [ ] **Step 3: Type-check, lint e build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: sem erros — nenhuma prop/tipo novo, só troca de `className`.

- [ ] **Step 4: `audit:ds` (checagem de hex inline)**

Run: `npm run audit:ds`
Expected: sem novos apontamentos — a mudança em `PulsoHero.tsx` é só nome de classe (`card-anchor`), nenhum hex/cor inline nova em `.tsx`.

- [ ] **Step 5: Rodar a suíte de testes (regressão)**

Run: `npm test`
Expected: PASS — nenhum teste existente faz snapshot/asserção sobre `className` do `PulsoHero`.

- [ ] **Step 6: Verificação manual no navegador — card âncora**

Run: `npm run dev` (porta 3000).

No navegador, autenticado, no Dashboard (`/`):
1. Tema dark: `PulsoHero` deve continuar com aparência escura, agora com o gradiente navy diagonal e borda esquerda colorida por score (igual antes).
2. Tema light: `PulsoHero` deve permanecer visualmente **igual ao tema dark** (fundo navy escuro, texto claro) — não deve clarear junto com o resto da página.
3. Em ambos os temas: gauge de score, narrativa, os 4 tiles de fluxo do dia (Entradas/Concluídas/Saldo/Projeção) e as insight pills devem continuar totalmente legíveis (texto claro sobre fundo navy).
4. No tema light, abrir o textarea de observação da IA (se `aiData` ainda não carregado) e confirmar que o texto digitado/placeholder continua legível dentro do card âncora.

Reportar o resultado de cada item antes de prosseguir. Se algum texto ficar ilegível em algum tema, ajustar os valores de `--c-secondary`/`--c-muted`/`--c-surface` dentro de `.card-anchor` antes do commit.

- [ ] **Step 7: Commit**

```bash
git add src/index.css src/features/dashboard/PulsoHero.tsx
git commit -m "$(cat <<'EOF'
style(dashboard): card ancora navy fixo no PulsoHero

.card-anchor redeclara tokens de superficie/texto localmente para o
PulsoHero ficar visualmente identico em qualquer tema, igual ao card
"Balance" do mockup de referencia. Conforme
docs/superpowers/specs/2026-07-22-dashboard-restyle-navy-teal-design.md.
EOF
)"
```

---

## Self-Review (executado ao escrever este plano)

**Cobertura do spec:** §3.1 (paleta dark) → Task 1 Step 1. §3.2 (paleta light) → Task 1 Step 2. §3.3 (card âncora, texto sempre claro independente do tema) → Task 2 Steps 1-2, resolvido via redeclaração local de custom properties (mais robusto que sobrescrever `className` a className dentro do `PulsoHero`, e cobre também os overrides globais de `border-white/*` do tema light — ver comentário no Step 1 da Task 2). §3.4 (fora de escopo) → nenhuma task toca `DashboardPage.tsx`, outras telas, ou paleta semântica. §4 (verificação) → Steps de tsc/lint/build/test/audit:ds + verificação manual em cada task.

**Placeholders:** nenhum "TBD" — todos os blocos "antes" são cópia literal de `src/index.css`/`PulsoHero.tsx` lidos durante o brainstorming; todos os blocos "depois" têm valores RGB concretos (convertidos manualmente dos hex do spec).

**Consistência de tipos:** nenhuma interface/tipo TypeScript novo — mudança é 100% CSS (custom properties + 1 nome de classe). Nenhuma assinatura de função ou prop é tocada.

**Risco identificado e mitigado:** cores semânticas de status (`--c-red`, `--c-green` etc) usadas dentro do `PulsoHero` (badges de tendência, insight pills) ficariam com contraste inconsistente se só o texto neutro fosse forçado a claro — por isso `.card-anchor` fixa o conjunto *inteiro* de tokens (superfície + texto + semânticas) nos valores do tema dark pós-restyle, não só bg/texto. Isso faz o card se comportar como uma "ilha dark" auto-contida, robusta a qualquer tema ativo em `<html>`.
