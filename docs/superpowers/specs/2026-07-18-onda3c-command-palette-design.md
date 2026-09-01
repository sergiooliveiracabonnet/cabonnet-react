# Redesign Enterprise — Onda 3c: Command Palette (Design)

**Data:** 2026-07-18
**Status:** Aprovado pelo usuário
**Escopo deste documento:** design da Onda 3c do redesign enterprise — adicionar navegação entre páginas ao command palette existente (`Ctrl+K` / `⌘K`, componente `src/components/ui/GlobalSearch.tsx`), hoje limitado a busca de OS. Continuação do roadmap original da Onda 1 (`docs/superpowers/specs/2026-07-15-redesign-enterprise-onda1-fundacao-design.md` §3) e da Onda 3b (`docs/superpowers/specs/2026-07-18-onda3b-sidebar-fluxo-trabalho-design.md`), que reorganizou os grupos de navegação da sidebar e deixou o upgrade do command palette explicitamente fora de escopo.

---

## 1. Contexto

O `Ctrl+K` hoje abre `GlobalSearch.tsx`, um modal que busca **somente Ordens de Serviço** por nº OS, cliente, bairro, cidade ou equipe (`matchOS`/`searchRows`), com navegação por teclado (↑↓/Enter/Esc) e resultado abrindo o `OSDrawer`. Não existe forma de pular direto para uma página (Ordens, Cidades, Juniper etc.) sem usar a sidebar/mouse — a lista de páginas com labels, ícones e cores por grupo vive hoje só dentro de `Sidebar.tsx` (`baseGroups`, `NavGroup`/`NavLinkDef`), junto com a lógica de filtro por permissão (`podeVer`, papel `gestor` vê tudo, `operador`/`viewer` conforme `modulos` liberados via `rotaParaModulo`).

**Decisão aprovada:** o mesmo `Ctrl+K` passa a fazer busca mista — páginas e OS no mesmo modal, mesma navegação por teclado, resultados agrupados por seção com rótulo ("Páginas" / "Ordens de Serviço"). Nenhuma página nova, nenhuma ação (trocar tema, abrir Telegram etc.) entra nesta onda — só navegação.

**Fora de escopo (decidido com o usuário):**
- Ações rápidas no palette (trocar tema, abrir Telegram, exportar CSV etc.) — avaliar como onda futura separada, se houver demanda.
- Fuzzy search / lib externa (`cmdk` etc.) — mantém o padrão de match por substring já usado na busca de OS.
- Abas separadas "Páginas" / "OS" — resultados ficam numa lista única navegável, só com cabeçalhos de seção.

---

## 2. Decisões de escopo (resolvidas com o usuário)

1. **Escopo funcional:** só navegação entre páginas, sem ações rápidas.
2. **Integração:** mesmo atalho `Ctrl+K`/`⌘K`, resultados mistos no mesmo modal — não um atalho novo nem abas.
3. **Estado vazio (query em branco):** lista todas as páginas visíveis (respeitando permissão), agrupadas como na sidebar (Agora/Operar/Analisar/Infra & Campo) — substitui as hint tags atuais ("nº OS", "Cliente"...).
4. **Ordenação com resultado misto:** seções com rótulo — cabeçalho "Páginas" antes das páginas, "Ordens de Serviço" antes das OS. Se só um tipo bater, mostra só a seção correspondente, sem cabeçalho redundante.

---

## 3. Mudanças

### 3.1 Extração — `src/lib/navigation.ts` (novo arquivo)

Move de `Sidebar.tsx` para cá:
- Tipos `NavLinkDef` (`to`, `label`, `icon`) e `NavGroup` (`key`, `label`, `color`, `links`).
- Constante `baseGroups` (as 4 páginas por grupo, idêntico ao estado atual pós-Onda 3b).
- Novo hook `useVisibleNavGroups()`: encapsula a lógica hoje inline em `Sidebar.tsx:164-181` — `gestor` vê tudo; `operador`/`viewer` só os links cujo `rotaParaModulo(to)` está em `modulos`; grupos sem nenhum link visível somem; `gestor` ganha "Usuários" acrescentado ao grupo `infra` em runtime.

`Sidebar.tsx` passa a importar `useVisibleNavGroups` de `lib/navigation.ts` em vez de calcular `groups` localmente — comportamento idêntico, zero mudança visual ou de permissão na sidebar. Isso elimina a segunda fonte de verdade que surgiria ao adicionar a mesma lista de páginas dentro do `GlobalSearch`.

### 3.2 `GlobalSearch.tsx`

- Importa `useVisibleNavGroups()` e achata o resultado numa lista plana de `{ to, label, icon, groupLabel, groupColor }` para busca/exibição.
- **Busca de páginas:** filtro por substring case-insensitive no `label` (mesmo padrão de `matchOS`), mínimo 1 caractere (universo pequeno, ~14-15 itens). Sem limite de resultados — o próprio universo já é pequeno.
- **Busca de OS:** inalterada (`searchRows`, mínimo 2 caracteres, limite 20).
- **Query vazia:** renderiza a lista completa de páginas agrupada visualmente como a sidebar (rótulo do grupo + cor, sem cabeçalho redundante "Páginas" já que é a única seção), substituindo o bloco de hint tags atual. Mantém a linha de atalhos de teclado (↑↓ navegar / ↵ abrir / ESC fechar) embaixo.
- **Lista navegável:** os resultados (páginas + OS, quando ambos aplicáveis) formam um único array plano para fins de `activeIdx`/↑↓/Enter — cabeçalhos de seção são só visuais, não ocupam índice.
- **Seleção:** página → `navigate(to)` (via `useNavigate`) + fecha modal. OS → comportamento atual (abre `OSDrawer`), inalterado.
- **Textos:** placeholder do input muda de "Buscar OS, cliente, cidade, equipe…" para "Buscar OS ou página…". Mensagem de "nenhum resultado" passa a cobrir os dois tipos quando nem página nem OS derem match.

### 3.3 `Navbar.tsx`

Hint do botão que abre o `Ctrl+K` ("Buscar OS, cliente…") atualizado para refletir o novo escopo (ex.: "Buscar OS ou página…"). Sem outra mudança — `title`/atalho continuam os mesmos.

---

## 4. Fora do escopo desta implementação

- Ações rápidas (tema, Telegram, export) — decisão futura separada.
- Busca por sinônimos/fuzzy — substring simples é suficiente pro tamanho atual da lista de páginas.
- Analytics/telemetria de uso do palette.

---

## 5. Testes

- `useVisibleNavGroups`: gestor vê todos os grupos + "Usuários"; operador/viewer só módulos liberados; grupo sem link visível some da lista.
- `GlobalSearch`:
  - Query vazia → mostra todas as páginas visíveis, agrupadas.
  - Query filtra só página (ex. "juniper") → mostra só seção de página, sem seção de OS.
  - Query filtra só OS (nº OS válido) → mostra só seção de OS, sem seção de página.
  - Query dá match em ambos → duas seções com cabeçalho, navegação por ↑↓/Enter cobre os dois grupos numa lista só.
  - Selecionar página via clique ou Enter → navega e fecha o modal (sem abrir `OSDrawer`).
  - Nenhum resultado em nenhum dos dois tipos → mensagem de "nenhum resultado" cobrindo ambos.

---

## 6. Arquivos afetados

- `src/lib/navigation.ts` (novo) — tipos, `baseGroups`, `useVisibleNavGroups()`.
- `src/components/layout/Sidebar.tsx` — passa a importar de `lib/navigation.ts`, remove definição local.
- `src/components/ui/GlobalSearch.tsx` — busca mista páginas + OS, estado vazio com lista de páginas, seções com rótulo, navegação por página.
- `src/components/layout/Navbar.tsx` — texto do hint do botão de busca.
- Testes correspondentes para `lib/navigation.ts` e `GlobalSearch.tsx`.
