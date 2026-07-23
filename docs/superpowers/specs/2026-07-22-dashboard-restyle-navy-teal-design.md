# Dashboard — Restyle Navy + Teal (Design)

**Data:** 2026-07-22
**Status:** Aprovado pelo usuário
**Escopo deste documento:** repintar a paleta de tokens neutros (`index.css`) para um tom navy-azulado e aplicar um tratamento visual de destaque ("card âncora") no `PulsoHero`, inspirado na estrutura/paleta de um mockup de dashboard financeiro (`MODELO DE SITE.jpg`). Estrutura e conteúdo do Dashboard **não mudam** — só o sistema visual (cores neutras + 1 componente de destaque).

---

## 1. Conflito com decisão histórica — registrado e superado conscientemente

Os specs `2026-07-15-redesign-enterprise-onda1-fundacao-design.md` e `2026-07-17-redesign-enterprise-onda2-dashboard-design.md` registram uma restrição permanente do usuário:

> "Design sóbrio obrigatório: tokens reais do `index.css`, Inter, cor apenas para status. Temas conceituais foram rejeitados."
> "Nenhuma alteração de paleta, tipografia base (Inter) ou tokens de `index.css`." (Onda 2, §4.6)

Este documento **substitui essa restrição especificamente para a paleta de tokens neutros e para o tratamento visual do `PulsoHero`**, por decisão explícita do usuário em 2026-07-22, após ele confirmar que quer o novo visual mesmo com o histórico de rejeição de temas conceituais. Todas as outras restrições permanentes (Inter como única fonte, cor semântica reservada a status nos `StatCard`/KPIs, sem novas dependências de stack, sem reskin de outras telas) continuam valendo — a mudança é escopada aos tokens neutros + `PulsoHero`, não é uma reabertura geral de "tema conceitual".

---

## 2. Contexto

O usuário mostrou um mockup de dashboard financeiro (`MODELO DE SITE.jpg`) com 3 variações de tema (dark/médio/light) e pediu para extrair paleta/estrutura/design. Após discussão, o escopo foi fechado em: manter a estrutura de 5 níveis do Dashboard atual (nenhum painel removido/reestruturado), mas:

1. Repintar os tokens neutros de `index.css` de zinc puro para navy-tintado (dark) e lavanda-clara (light), aplicando globalmente (todas as páginas, não só o Dashboard).
2. Aplicar um tratamento "card âncora" (fundo navy escuro fixo, independente do tema) só no `PulsoHero` — equivalente ao card "Balance" do mockup, que se mantém escuro/destacado nos 3 temas do mockup.

Os tokens `--c-primary` (`#3B82F6`) e `--c-cyan` (`#22D3EE`) já são próximos das cores de destaque do mockup — não precisam mudar.

---

## 3. Design detalhado

### 3.1 Paleta — tema dark (`:root`, `src/index.css`)

| Token | Atual | Novo |
|---|---|---|
| `--c-bg` | `9 9 11` (`#09090B`) | `10 15 28` (`#0A0F1C`) |
| `--c-elevated` | `18 18 20` (`#121214`) | `16 24 39` (`#101827`) |
| `--c-surface` | `24 24 27` (`#18181B`) | `20 28 46` (`#141C2E`) |
| `--c-card` | `19 19 21` (`#131315`) | `15 23 38` (`#0F1726`) |
| `--c-card-high` | `26 26 29` (`#1A1A1D`) | `22 33 58` (`#16213A`) |
| `--c-card-highest` | `33 33 37` (`#212125`) | `30 44 72` (`#1E2C48`) |
| `--c-border` | `39 39 42` (`#27272A`) | `35 49 80` (`#233150`) |
| `--c-primary` / `--c-cyan` | `#3B82F6` / `#22D3EE` | mantém |

### 3.2 Paleta — tema light (`.light`, `src/index.css`)

| Token | Atual | Novo |
|---|---|---|
| `--c-bg` | `244 244 245` (`#F4F4F5`) | `238 240 247` (`#EEF0F7`) |
| `--c-border` | `228 228 231` (`#E4E4E7`) | `222 226 237` (`#DEE2ED`) |
| `--c-card` | `255 255 255` (branco) | mantém |
| `--c-primary` / `--c-cyan` | `#2563EB` / `#0891B2` | mantém |

Cores semânticas de status (`--c-green`, `--c-red`, `--c-yellow`, `--c-orange`, `--c-purple`, `--c-pink`, `--c-teal`) **não mudam** — continuam reservadas a estado de negócio nos `StatCard`/badges, conforme regra da Onda 1 (§4.3 daquele spec).

### 3.3 Card âncora — `PulsoHero`

Nova classe utilitária em `src/index.css`, ex. `.card-anchor`:

- Fundo: gradiente navy escuro fixo (não depende do tema — igual nos modos dark/light), ex. `linear-gradient(135deg, #0F1F3D 0%, #14284A 100%)`.
- Texto: sempre claro (`#F5F7FB` ou equivalente), independente do tema ativo — precisa de override local nos textos internos do `PulsoHero` que hoje usam `text-text`/`text-secondary`/`text-muted` (tokens que invertem no light).
- Borda: mantém o `borderLeft` dinâmico atual (cor por score: verde/amarelo/vermelho) — não é substituído, é preservado por cima do novo fundo.
- Glow sutil opcional na borda esquerda (`box-shadow` suave na cor do score), coerente com o padrão de "score" já existente no componente.
- Escopo: **só o `PulsoHero`**. Nenhum outro `StatCard`/painel recebe esse tratamento nesta onda.

### 3.4 Fora de escopo

- Nenhuma mudança de estrutura/conteúdo do `DashboardPage.tsx` (níveis, ordem de painéis, dados exibidos).
- Nenhuma mudança de paleta semântica de status.
- Nenhum reskin de outras telas (Ordens, ERP, Gráficos, etc.) além do efeito de herdar os tokens neutros globais (§3.1/3.2), que já são consumidos por toda a aplicação.
- Nenhuma fonte nova — Inter continua única.
- Nenhuma dependência nova.

---

## 4. Verificação

1. `npx tsc --noEmit` limpo
2. `npm run lint` limpo
3. `npm run build` limpo
4. Revisão visual do usuário: Dashboard (`/`) nos dois temas (dark/light), mais 2-3 outras páginas (Ordens, ERP, Gráficos) para confirmar que a repintura de tokens neutros não quebra contraste/legibilidade em nenhuma tela.
5. Conferir especificamente o `PulsoHero` nos dois temas — texto sempre legível sobre o fundo navy fixo do card âncora.

---

## 5. Nota para specs futuros

Este documento registra uma exceção pontual e explícita à regra "sem tema conceitual" da Onda 1/2. Specs futuros que tratem de paleta/tokens devem tratar esta decisão como o novo baseline (tokens navy-tintados), não como precedente para reabrir "tema conceitual" livremente — qualquer nova mudança de paleta decorativa deve ser confirmada de novo com o usuário, não assumida por causa deste documento.
