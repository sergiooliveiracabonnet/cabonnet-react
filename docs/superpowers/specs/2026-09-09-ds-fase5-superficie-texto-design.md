# DS Fase 5 — superfície e texto migram para a paleta do design system

## O problema

Em 2026-09-01 o design system do Cabonnet foi substituído por completo: laranja `#FF5A1F` como marca, dois temas inteiros, KPI colorido por categoria, shell arredondado. Vinte e nove commits, entre 01 e 02/09.

Em 2026-09-05 o commit `533af26` desfez tudo. A mensagem dele diz o que houve:

> "O working tree estava com o conteúdo do master, não o dos 29 commits do design system. Este commit registra o disco como fonte da verdade, a pedido: 92 arquivos voltam ao estado do master."

Foram 34.328 linhas deletadas. O design system não foi rejeitado — foi perdido num desencontro entre o disco e o git, resolvido escolhendo o disco.

A causa raiz é anterior: o `git init` de 01/09 criou uma história paralela, sem ancestral comum com a `main` que vem de maio. O DS foi construído sobre essa história órfã enquanto o repositório real seguia em outro lugar. É por isso que as Fases 1–4, executadas em 09/09, fizeram higiene num sistema cuja substituição já estava pronta em outra linha: nenhuma das duas sabia da outra.

Os 29 commits estão vivos em `origin/archive/design-system-2026-09-historia-original`, com o DS no commit `e441dd1` — o tip da branch, `1a8e0ae`, já está depois do wipe.

Reaplicar não é `merge` nem `cherry-pick`: sem ancestral comum, com 99 arquivos tocados pelo DS e **70 deles também alterados na `main` desde então**, o conflito seria quase total. E parte do DS foi refeita por baixo — as Fases 1–4 reescreveram `index.css` e `tailwind.config.js`, exatamente os dois arquivos que o DS mais mexe.

O caminho é replantar por cima da fundação de hoje, em fases. Esta spec é a primeira delas.

## Decisões tomadas

Quatro decisões do usuário, tomadas vendo o trade-off:

1. **Os valores do DS entram nos nomes de hoje.** `--c-bg`, `--c-card`, `--c-muted` continuam existindo; o que muda é para onde apontam. Preserva a arquitetura de três camadas da Fase 1, a catraca da Fase 3, os testes, e os ~236 usos de `--c-*` no JSX. Nenhum `.tsx` muda nesta fase.
2. **Quatro fases pequenas, um eixo por fase**, seguindo o ritmo das Fases 1–4:
   - **Fase 5 (esta):** superfícies, bordas, texto, sombras, e o teste de contraste
   - **Fase 6:** acentos, `--chart-1..6`, `--kpi-ink-*` e a auditoria dos 564 usos de `primary`
   - **Fase 7:** componentes — Button, Card, Badge, StatCard, Avatar
   - **Fase 8:** shell arredondado e sidebar como painel
3. **A barra de contraste é WCAG AA:** 4.5:1 para texto normal, 3:1 para texto grande e elementos de interface. É a barra que os próprios comentários do DS usam.
4. **As sombras entram nesta fase**, não na 7. Justificativa na seção "Por que as sombras vêm junto".

## Escopo

**Entra:** os seis degraus de superfície, `--c-border`, os quatro níveis de texto, os três níveis de sombra, e o teste de contraste que tranca tudo em AA.

**Fica de fora:** `--c-primary` e os acentos (orange, blue, green, yellow, red, purple, pink, teal, cyan), `--c-grp-*`, `--chart-1..6`, `--kpi-ink-*`, componentes, shell, sidebar.

O corte segue o requisito de acessibilidade que originou o pedido: fundo contra tipografia. Acento não participa dessa conta — `text-orange` sobre card é problema da Fase 6.

## Arquitetura

Os valores do DS entram como primitivos novos; a camada semântica reaponta. A regra da Fase 1 continua valendo: **valor cru nunca aparece na camada semântica** — `designTokens.test.ts` reprova.

### Tema escuro

| Semântico | Hoje | Fase 5 | Origem no DS |
|---|---|---|---|
| `--c-bg` | `#09090B` | `#020202` | `bg` |
| `--c-elevated` | `#121214` | `#080808` | `surface-1` |
| `--c-card` | `#131315` | `#0C0C0C` | `surface-2` |
| `--c-card-high` | `#1A1A1D` | `#121212` | `surface-3` |
| `--c-surface` | `#18181B` | `#181818` | `surface-hover` |
| `--c-card-highest` | `#212125` | `#202020` | `surface-active` |
| `--c-border` | `#27272A` | `#252525` | `border` |
| `--c-text` | `#FAFAFA` | `#FFFFFF` | `text` |
| `--c-secondary` | `#A1A1AA` | `#B5B5B5` | `text-secondary` |
| `--c-muted` | `#71717A` | `#8A8A8A` | `text-muted` |
| `--c-disabled` | `#3F3F46` | `#505050` | `text-disabled` |

### Tema claro

| Semântico | Hoje | Fase 5 | Origem no DS |
|---|---|---|---|
| `--c-bg` | `#F4F4F5` | `#F3F4F6` | `bg` |
| `--c-elevated` | `#FFFFFF` | `#FFFFFF` | `surface-1` |
| `--c-card` | `#FFFFFF` | `#FFFFFF` | `surface-2` |
| `--c-card-high` | `#F3F4F6` | `#FFFFFF` | `surface-3` |
| `--c-surface` | `#F9FAFB` | `#F6F7F8` | `surface-hover` |
| `--c-card-highest` | `#E5E7EB` | `#EEF0F2` | `surface-active` |
| `--c-border` | `#E4E4E7` | `#E8E8E8` | `border` |
| `--c-text` | `#09090B` | `#171717` | `text` |
| `--c-secondary` | `#52525B` | `#444444` | `text-secondary` |
| `--c-muted` | `#71717A` | `#6D6D6D` | `text-muted`, corrigido |
| `--c-disabled` | `#D4D4D8` | `#A5A5A5` | `text-disabled` |

### Efeito contido nas bordas

No escuro, `--c-border-hairline/subtle/strong` (camada de componente, Fase 3) são `rgb(var(--p-white) / alfa)` e **não dependem** de `--c-border`. Mudar a borda semântica afeta só o tema claro, onde os três apontam para ela.

O vocabulário de borda do DS (`border-border` 461 usos, `border-subtle` 58, `border-hover` 2) é diferente do de hoje (`hairline`/`subtle`/`strong`). Reconciliar os dois é da Fase 7, não desta.

## Por que as sombras vêm junto

No tema claro o DS declara `surface-1`, `surface-2` e `surface-3` **todos como `#FFFFFF`**. A hierarquia não vem de cinzas empilhados como hoje, vem de fundo cinza + card branco + sombra quase invisível.

Migrar as superfícies sem as sombras deixaria popover branco sobre card branco, sem nada separando — um defeito introduzido de propósito e mantido em pé por duas fases. As sombras são o que separa branco de branco: pertencem ao sistema de superfície, não ao de componente.

```
--shadow-sm: 0 2px 10px rgba(0,0,0,.03)
--shadow-md: 0 4px 20px rgba(0,0,0,.04)
--shadow-lg: 0 10px 30px rgba(0,0,0,.08)
```

No escuro o DS zera `sm` e `md` — lá a separação vem de borda e luminosidade — e mantém só `lg` (`0 16px 40px rgba(0,0,0,.55)`) para modal e dropdown.

## A correção de contraste

O DS anotou a razão de contraste de cada token em comentário, e chegou a levantar dois valores por reprovarem AA (`--text-muted` no claro, `--blue` no escuro). Mas cada anotação mede o texto contra **um** fundo.

Medindo contra **todos** os degraus de superfície, aparece uma reprovação que o comentário não pega:

| Par | Razão | Veredito |
|---|---|---|
| `text-muted` `#6E6E6E` sobre `surface-active` `#EEF0F2` | **4.46:1** | reprova AA |
| `text-muted` `#6E6E6E` sobre `#FFFFFF`, o que o comentário mediu | 5.10:1 | passa |

Correção: **`#6E6E6E` → `#6D6D6D`**, que leva o pior caso a 4.53:1. Um passo de hex, imperceptível a olho.

O tema escuro não precisa de ajuste: `#8A8A8A` tem pior caso 4.72:1, sobre `surface-active`.

Esta é a única alteração da spec em relação aos valores originais do DS.

## O teste

Vai em `src/lib/designTokens.test.ts`, não em arquivo novo: contraste é a metade que faltou da Fase 1 — a camada semântica de cor —, não um eixo novo. Mesmo raciocínio que levou o tracking para dentro do `typeScale.test.ts` na Fase 4.

Usa o `resolveTheme()` que já existe em `scripts/design-tokens.mjs`, então lê os valores finais em vez de reproduzir a tabela.

Cobre **toda combinação texto vezes superfície nos dois temas** — 40 pares no total, contra os 4 que o comentário do DS mediu. `--c-disabled` fica isento por WCAG 1.4.3, que dispensa componente desabilitado.

Asserções:

1. Todo par (texto ativo, superfície) atinge 4.5:1, nos dois temas.
2. `--c-border` atinge 3:1 contra a superfície que ela separa — a barra de elemento de interface, WCAG 1.4.11.
3. A lista de tokens de texto e de superfície é derivada dos nomes declarados, não escrita à mão: token de superfície novo entra na varredura sozinho.

A asserção 3 é o que impede o teste de virar paisagem. Sem ela, um `--c-surface-4` futuro nasceria fora da cobertura sem ninguém perceber.

## O tripwire que vai disparar

`designTokens.test.ts` tem um `describe('valores resolvidos não mudam')` que trava cada valor final dos dois temas. A Fase 5 **vai quebrá-lo** — 22 asserções, uma por token migrado.

Isso é o guarda-corpo funcionando, não um contratempo. O comentário do `index.css` diz: "os valores resolvidos estão travados por teste: mexer neles não é refactor, é redesign". Esta fase é redesign declarado.

Atualizar a trava é um passo explícito do plano, em commit próprio, para que o diff mostre exatamente quais valores mudaram e por quê — em vez de a mudança entrar escondida junto com o resto.

## Verificação

- `npx tsc --noEmit` e `npm run lint` limpos
- `npm test` — a suíte inteira, com as asserções novas de contraste
- `npm run audit:ds` — OK, sem pedir catraca; esta fase não muda a contagem de valores arbitrários
- `npm run build` — os tokens novos emitidos e resolvendo nos dois temas
- Conferência visual nos dois temas em `/`, `/ordens`, `/graficos`, `/fornecedor`

Sobre a conferência visual: ao contrário da Fase 4, desta vez **há o que ver**. O fundo escuro sai de `#09090B` para `#020202`, os cards do claro viram branco puro sobre fundo cinza, e o texto secundário clareia no escuro. Se nada mudar na tela, algo deu errado.

## Fora de escopo, registrado para as próximas fases

- Os 564 usos de `primary` e o inventário classificado de 995 linhas que existe no arquivo (`docs/superpowers/plans/2026-09-01-inventario-primary.md`, recuperável de `1c95e82`) — Fase 6
- O gradiente radial do `body` no escuro, dois brilhos em laranja e verde com alfa 0.05 — depende dos acentos, Fase 6
- `--chart-1..6` e `--kpi-ink-*`, que não existem na fundação de hoje — Fase 6
- A reconciliação do vocabulário de borda — Fase 7
