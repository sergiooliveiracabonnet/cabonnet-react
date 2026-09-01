# Substituição completa do design system — Cabonnet React

Data: 2026-09-01
Status: aprovado (blocos 1-3), aguardando plano de implementação

---

## 1. Contexto e estado real do projeto

A memória do projeto registrava que em 2026-09-01 o design system teria migrado para shadcn/ui + Tailwind v4 com tokens `oklch`. **Isso não está no working tree.** O estado real verificado:

- Tailwind `3.4.19`, `tailwind.config.js` presente (163 linhas, 18 animações, safelist grande)
- `src/index.css` com 648 linhas, tokens `--c-*` em canais RGB, ~150 classes custom
- Tema **escuro como padrão** (`:root`), claro via classe `.light`
- **Não existe repositório git neste diretório** (`git rev-parse` → `fatal: not a git repository`)

Medições que dimensionam o trabalho:

| Medição | Valor |
|---|---|
| Arquivos de código em `src` (fora testes) | 207 |
| Arquivos de teste | 84 em `src`, 2 em `e2e` |
| Utilitários `white/black`-alpha (`bg-white/[0.03]`, `border-white/10`…) | 405 ocorrências em 60 arquivos |
| Usos do token `primary` | 550 |
| Usos das demais semânticas | `red` 290 · `green` 191 · `yellow` 158 · `orange` 119 · `cyan` 62 · `purple` 27 · `teal` 6 · `pink` 0 |
| Classes custom em `index.css` | ~150 |

## 2. Objetivo

Substituir integralmente o design system atual (sóbrio, zinc-neutral, azul, dark-first) pelo novo DS especificado pelo usuário: SaaS premium, laranja `#FF5A1F` como marca, KPI cards coloridos, radius grandes, sombras sutis no claro e contraste por borda no escuro. Dois temas completos, um único conjunto de componentes.

Nenhuma mudança de comportamento, dado ou API faz parte deste trabalho.

## 3. Decisões tomadas

Cada decisão abaixo foi apresentada com alternativas e trade-offs; a escolha é do usuário, salvo onde indicado.

### 3.1 Profundidade: virada completa (opção C)

Repintura de tokens **mais** reconstrução de componentes **mais** o shell (container arredondado, sidebar como painel, grid, gráficos). Alternativas descartadas: repintura só de tokens (A), repintura + componentes sem shell (B).

### 3.2 Dois temas, um sistema

O usuário forneceu especificação completa do tema escuro além do claro. Ambos são implementados como dois conjuntos de tokens sobre os mesmos componentes.

### 3.3 Cor do KPI card: categoria, não status (opção B)

**Trade-off registrado e aceito conscientemente pelo usuário.** O `StatCard` atual declara no código "Cor só para status" e expõe `tone: 'neutral' | 'critical' | 'warning' | 'ok' | 'info'`, usado semanticamente em 20 chamadas (`warning` 8, `critical` 7, `ok` 3, `info` 2). O DS novo pinta os quatro primeiros KPIs de cada página em laranja/azul/verde/amarelo **por posição**.

Consequência aceita: perde-se a leitura "vermelho = tem problema" no preenchimento do card. Mitigação implementada: o `tone` deixa de pintar o card e passa a aparecer como badge de status no canto, preservando o sinal em forma textual.

Isto contraria a regra histórica "cor reservada para semântica de status", estabelecida por feedback do próprio usuário e reforçada após a rejeição do restyle navy+teal em 2026-07-22. A regra é sobrescrita **apenas para o preenchimento do KPI card**; segue valendo para badges, tabelas, gráficos de status e alertas.

### 3.4 Sidebar: largura e grupos preservados (opção A)

`src/lib/navigation.ts` define 4 grupos com cabeçalho e 15 links, com rótulos longos ("Fila de Prioridade", "Ranking Técnicos", "Nível de Sinal", "Infra & Campo") e filtragem por permissão. A sidebar estreita de ~130px da referência exigiria encurtar todos os rótulos; foi descartada. Mantém-se a largura atual (~230px) e a estrutura de grupos, aplicando somente a linguagem visual nova.

As quatro cores de grupo (`#c4b5fd`, `#22d3ee`, `#4ade80`, `#fb923c`) são removidas. Laranja passa a marcar exclusivamente o item ativo.

### 3.5 Token `primary`: laranja + auditoria dos 550 usos (opção B)

`primary` é hoje azul `#3B82F6` e acumula dois significados distintos: ação/marca (botão primário, item ativo, foco) e informação/dado (série de gráfico, badge neutro, link, linha selecionada, spinner).

Cada um dos 550 usos é classificado individualmente:

- **ação / marca / estado ativo** → token `orange` (`#FF5A1F`)
- **informação / dado** → token `blue` (`#2864E8`)

Alternativas descartadas: trocar o valor do token e deixar os 550 virarem laranja em bloco (produz um app saturado de laranja, contrário à contenção da referência); manter `primary` azul e criar um token `brand` laranja aplicado só nos pontos óbvios (entrega menos identidade). Esta é a tarefa mais cara do projeto.

### 3.6 Extensão da paleta: vermelho

**Decisão do implementador, registrada por não estar coberta na especificação.** Nenhuma das duas paletas fornecidas tem vermelho, e `red` é o segundo token mais usado do app (290 ocorrências) para estado crítico. Forçar laranja a acumular "marca" e "crítico" tornaria os dois indistinguíveis lado a lado. A paleta é estendida com um vermelho por tema.

### 3.7 Build: Tailwind 3.4 permanece

Migração para Tailwind v4 e adoção de shadcn/ui ficam fora de escopo. Trocar design system e build system ao mesmo tempo soma dois riscos independentes, e o v4 não é requisito de nada aqui.

### 3.8 Tema padrão: escuro; classe inverte para `.dark`

O escuro segue sendo o padrão (usuários atuais têm `theme` em `localStorage`, e o `:root` da própria especificação do usuário é escuro). A convenção de classe inverte: hoje é `.light` sobre `:root` escuro, passa a ser `.dark` sobre `:root` claro. Isso evita o flash de tema escuro antes da aplicação do claro.

### 3.9 Painel direito não é adotado

A referência tem um rail "Upcoming Appointments" de ~190px. Não há equivalente funcional no Cabonnet, e um rail fixo reduziria a largura das tabelas de OS, que é o recurso mais escasso do app.

---

## 4. Tokens

Valores guardados como **canais RGB separados por espaço** (`255 90 31`), não hex — é o que permite `bg-orange/20` funcionar no Tailwind. Os hex ficam como comentário ao lado.

Nomenclatura adotada: a da especificação do usuário. O prefixo `--c-*` é removido.

| Token | Claro | Escuro |
|---|---|---|
| `--bg` | `#F3F4F6` | `#020202` |
| `--surface-1` (shell) | `#FFFFFF` | `#080808` |
| `--surface-2` (card) | `#FFFFFF` | `#0C0C0C` |
| `--surface-3` (elevado / popover) | `#FFFFFF` + sombra | `#121212` |
| `--surface-hover` | `#F6F7F8` | `#181818` |
| `--surface-active` | `#EEF0F2` | `#202020` |
| `--border` | `#E8E8E8` | `#252525` |
| `--border-subtle` | `#F1F1F1` | `#1A1A1A` |
| `--border-hover` | `#D8D8D8` | `#353535` |
| `--text` | `#171717` | `#FFFFFF` |
| `--text-secondary` | `#444444` | `#B5B5B5` |
| `--text-muted` | `#777777` | `#777777` |
| `--text-disabled` | `#A5A5A5` | `#505050` |
| `--orange` | `#FF5A1F` | `#FF5A1F` |
| `--blue` | `#2864E8` | `#2864E8` |
| `--green` | `#12C4AE` | `#11C7B0` |
| `--yellow` | `#FBCB12` | `#F5C915` |
| `--red` (extensão) | `#E03131` | `#FF6B6B` |

Contraste de todos os pares texto/superfície é verificado contra WCAG AA (4.5:1 texto normal, 3:1 texto grande) na Fase 1; valores que reprovarem são ajustados e a tabela acima é atualizada no mesmo commit.

### 4.1 Cores removidas

| Cor | Usos | Destino |
|---|---|---|
| `pink` | 0 | removida |
| `teal` | 6 | → `green` |
| `cyan` | 62 | → `blue` |
| `purple` | 27 | removida do vocabulário semântico; reaparece só como `--chart-6` |

### 4.2 Escala categórica de gráfico

Recharts precisa de 5-6 séries distinguíveis. Para que "amarelo = alerta" não colida com "amarelo = Taubaté", as séries usam escala própria, separada da semântica:

`--chart-1` laranja · `--chart-2` azul · `--chart-3` verde · `--chart-4` amarelo · `--chart-5` vermelho · `--chart-6` violeta

### 4.3 Sombras são tokens, não valores estáticos

As 8 sombras do `tailwind.config.js` são pretos pesados (`rgba(0,0,0,.45)`) calibrados para fundo escuro. O DS novo pede sombra quase invisível no claro (`0 4px 20px rgba(0,0,0,.04)`) e **nenhuma sombra no escuro**, onde o contraste vem de borda e luminosidade.

Utilitário Tailwind é estático e não conhece o tema. Solução: `--shadow-sm/md/lg` como variáveis CSS redefinidas em `.dark`, com os utilitários apontando para elas. `shadow-md` continua funcionando em todo o código existente e passa a ser sensível ao tema.

### 4.4 Tipografia

Os cinco nomes semânticos atuais são mantidos (evita mexer em centenas de arquivos); os valores são repontuados e um sexto papel é acrescentado.

| Papel | Hoje | Novo |
|---|---|---|
| `caption` | 11px | 11px |
| `label` | 12px | 12px |
| `body` | 13px | **14px** |
| `title` | 15px | **16px** |
| `heading` | — | **20px** (novo) |
| `display` | 28px | 28px |

Família: Inter (`@fontsource-variable/inter`, já instalada). Pesos: 400 descrição, 500 menus, 600 títulos, 700 KPIs.

Piso de 11px mantido, e não os 10px da especificação: `audit-ds.mjs` bane `text-[10px]` por decisão anterior de legibilidade, e 10px em tabela operacional lida o dia inteiro é agressivo.

**Risco aceito:** `body` 13→14px e `title` 15→16px afrouxam a densidade do app inteiro. Nas tabelas de OS isso significa menos linhas visíveis por tela. É o que a escala do usuário pede; o ajuste, se necessário em produção, é de uma linha.

### 4.5 Radius e espaçamento

Radius: `sm 6` · `md 8` · `lg 12` · `xl 16` · `2xl 24` · `pill`.
Aplicação: inputs e botões 8, cards 12-14, KPI 16, shell 24.

Espaçamento: escala de 4 (4/8/12/16/20/24/32/40/48). Padding de card 16, gap de seção 16, gap de grid 14-18, padding de página 20-24.

---

## 5. Shell e layout

`AppLayout` passa a ter três camadas:

1. Fundo da página (`--bg`). No escuro, dois radiais ambientais de ~8% de opacidade (laranja e azul-esverdeado), quase imperceptíveis.
2. Container arredondado de 24px (`--surface-1` + `--border`).
3. Dentro dele: sidebar + conteúdo.

**Sidebar** vira painel próprio dentro do shell: `rgba(10,10,10,.75)` + `backdrop-blur(12px)` + borda + radius 16px no escuro; branco + borda no claro.

Item ativo: `#FFF0EA` com borda-direita laranja 2px no claro; `rgba(255,90,31,.18)` + halo laranja no escuro. Cabeçalho de grupo em `--text-muted` 11px.

Classes removidas: `nav-link-*`, `grp-*-line`, `grp-*-text`, `grp-dot-*`, e o campo `color` de `NAV_GROUPS`.

**Navbar** mantém a estrutura; controles ganham baixo contraste (altura 32-34px, radius 8, borda `--border`), estabelecendo a hierarquia conteúdo → controle → decoração.

---

## 6. Componentes

### 6.1 `StatCard`

Forma nova: número 28px/700, rótulo 12px, ícone, ação no canto superior direito. Altura 105-115px, radius 16.

Cor por posição no grid: laranja → azul → verde → amarelo.

- Claro: fundo sólido na cor, texto branco.
- Escuro: `rgba(cor, .25-.28)` + borda 1px na cor + glow `0 0 20px rgba(cor, .08)`.

O `tone` deixa de pintar o card e passa a renderizar um badge de status no canto.

### 6.2 `Button`

Os variants atuais são uma miscelânea (`primary`, `ghost`, `outline`, `danger`, `red`, `orange`, `green`, `yellow`, `purple`, `cyan`). Consolidam em cinco:

| Variant | Claro | Escuro |
|---|---|---|
| `primary` | `#FF5A1F` / branco | `#FF5A1F` / branco, hover `#FF6A35` + glow |
| `secondary` | `#171717` / branco | `#FFFFFF` / `#111111` (contraste invertido) |
| `outline` | borda `--border`, fundo transparente | idem |
| `ghost` | transparente, hover `--surface-hover` | idem |
| `danger` | `--red` | `--red` |

Variants de cor solta viram `tone` opcional. Altura 32-36px, radius 8, texto 11-12px, peso 500-600.

### 6.3 Demais componentes

`Card`, `Badge`, `FilterSelect`, `SearchBox`, `DateFilterBar`, `TabBar`, `Modal`, `Drawer`, `Skeleton`, `EmptyState`, `DataTable`, `PageHeader`, `SectionTitle`, `SectionLabel`, `ChartCard` — repintados nos tokens novos, altura de controle 32-36px, radius 8.

**`Avatar`** — componente novo. Quadrado arredondado 38×38px, radius 9px.

### 6.4 Gráficos

`bar-chart`, `line-chart`, `pie-chart`, `DonutChart`, `ChartCard`:

| Elemento | Claro | Escuro |
|---|---|---|
| Grid | `#F1F1F1` | `rgba(255,255,255,.04)` |
| Eixo | `#A5A5A5` | `#666666` |
| Rótulo | `#777777` | `#777777` |
| Série | `--chart-1..6` | `--chart-1..6` |
| Tooltip | `--surface-3` + sombra | `--surface-3` + borda |

Linha fina, grid discreto, sem legenda decorativa.

---

## 7. `index.css` e `tailwind.config.js`

`index.css` encolhe. Das ~150 classes custom atuais sobrevivem apenas as que o DS novo pede: o gradiente ambiental do fundo escuro, o glass discreto da sidebar e os quatro glows de acento. Saem `glass` (na forma atual), `card-premium`, `mesh-bg`, `aurora-bg`, `glow-text-*`, `card-glow-*`, `text-gradient-*`, `icon-container-*`, `badge-*`, `number-display`, `shimmer-bg`, `tilt-card`, `hover-lift`, `card-shine`, `sidebar-premium`, `navbar-premium`, `logo-glow`, `pulse-glow*`.

`tailwind.config.js`: safelist correspondente removida; as 18 animações caem para as 5 efetivamente usadas (`fade-in`, `slide-up`, `slide-down`, `scale-in`, `pop-in`).

`scripts/audit-ds.mjs` é **reescrito, não desligado**. Ele roda no CI e barra hex fora de uma baseline que hoje é inteiramente da paleta zinc/blue — reprovaria tudo. Nova baseline: os 18 tokens da seção 4 mais as 6 cores de gráfico.

---

## 8. Migração em fases

### Fase 0 — Rede de segurança (bloqueante)

`git init` + commit inicial do estado atual, antes de qualquer edição. Mais baseline visual das 14 rotas nos 2 temas via Playwright (já configurado no projeto).

**Justificativa:** ~150 dos 207 arquivos serão tocados. Existe precedente registrado (2026-07-22) de um restyle rejeitado pelo usuário e desfeito com `git revert` — saída que hoje não existe.

### Fases 1-6

| Fase | Escopo | Arquivos |
|---|---|---|
| 1 | `index.css` + `tailwind.config.js` reescritos; inversão `.light`→`.dark`; os arquivos que leem tema em runtime; nova baseline do `audit-ds` | ~8 |
| 2 | Os 405 utilitários `white/black`-alpha → tokens de superfície e borda | ~60 |
| 3 | Auditoria dos 550 `primary`: ação/marca → `orange`, informação/dado → `blue` | ~90 |
| 4 | Componentes do DS (`components/ui/*`) + shell, sidebar, navbar | ~35 |
| 5 | Gráficos, `DonutChart`, e exportação de imagem/PDF | ~8 |
| 6 | Varredura rota a rota: 14 páginas × 2 temas | 14 rotas |

Arquivos que leem tema em runtime, todos tratados na Fase 1: `src/components/ui/bar-chart.tsx`, `src/components/ui/pie-chart.tsx`, `src/components/ui/DonutChart.tsx`, `src/features/gerencial/GerencialPage.tsx`, `src/lib/captureOSTable.ts`, `src/lib/captureTableImage.ts`. Se a inversão `.light`→`.dark` não for aplicada neles junto, a exportação de PDF e imagem sai com as cores trocadas.

**A Fase 1 deixa o app visualmente ruim de propósito** — trocar a fundação antes de corrigir os 405 alpha e os 550 `primary` produz texto de baixo contraste e superfícies chapadas. É esperado e se resolve na Fase 3. A alternativa (duas paletas em paralelo, migrando componente a componente) mantém dois design systems vivos no mesmo CSS por uma semana e gera mais confusão do que o desconforto temporário.

---

## 9. Verificação

Ao final de **cada** fase, todos os quatro:

```
npx tsc --noEmit      # obrigatório: npm run build é vite build puro e não checa tipo
npm run lint
npm test
npm run audit:ds
```

`tsc --noEmit` é o que pega `TS6133` (imports e variáveis órfãos) depois da remoção de JSX.

Os 84 arquivos de teste: alguns fazem asserção sobre classes e tokens que deixarão de existir. São corrigidos **na fase que os quebrar**, não depois — teste vermelho acumulado é como se perde o controle de uma migração deste tamanho.

Na Fase 6, comparação com o baseline visual da Fase 0, rota a rota, nos dois temas.

---

## 10. Fora de escopo

- Tailwind v4 e shadcn/ui
- Troca de biblioteca de ícones (Phosphor permanece, conforme regra registrada)
- Rota `/noc`: recebe os tokens novos, mantém o layout de parede atual
- Painel direito estilo "Upcoming Appointments"
- Qualquer mudança de comportamento, dado, rota ou API
- Refatoração não relacionada ao design system

---

## 11. Riscos registrados

| Risco | Mitigação |
|---|---|
| Sem git, um resultado rejeitado é irreversível | Fase 0 bloqueante |
| KPI por categoria apaga o sinal de status | Badge de status no canto do card |
| Auditoria dos 550 `primary` é subjetiva caso a caso | Classificação por contexto, revisão na Fase 6 |
| `body` 14px reduz linhas visíveis nas tabelas de OS | Aceito; reversível em uma linha |
| Exportação de PDF/imagem sai com cores trocadas | Os arquivos de runtime tratados na mesma fase da inversão de classe |
| Contraste WCAG dos tokens novos não verificado | Checagem AA na Fase 1, tabela atualizada no mesmo commit |
