# Redesign Enterprise — Onda 6b: Juniper (Design)

**Data:** 2026-07-19
**Status:** Aprovado pelo usuário
**Escopo deste documento:** design da Onda 6b — segunda sub-onda de "Onda 6: Periféricas" (`docs/superpowers/specs/2026-07-15-redesign-enterprise-onda1-fundacao-design.md` §3, decomposta em 4 sub-ondas: Fornecedor/Juniper/Fechamento/Usuários — ver `docs/superpowers/specs/2026-07-19-onda6a-fornecedor-design.md` §1). Escopo: `src/features/juniper/JuniperPage.tsx` — adoção do `PageHeader`, usando `titleExtra`/`actions` (ambos já existentes, sem mudança de API).

---

## 1. Contexto

`JuniperPage.tsx` (556 linhas) tem o cabeçalho mais rico das 4 telas desta decomposição: ícone (`Zap`) + `<h2>` + um **indicador "atualiza a cada 5 min"** pulsante colado no título + um **badge do cluster** ("Vale") empurrado à direita via `ml-auto`. Diferente de Fornecedor (Onda 6a, só título), aqui são 3 elementos a reorganizar.

**`titleExtra` e `actions` já cobrem esse caso sem mudança de API**: `titleExtra` (adicionado na Onda 5e pra Alertas) recebe o indicador pulsante, colado ao título dentro do `<h1>`; `actions` (existente desde a Onda 4) recebe o badge do cluster, que já cai naturalmente à direita via o `justify-between` do wrapper do `PageHeader` — substitui o `ml-auto` manual.

**`SectionTitle` já é canônico aqui**: `JuniperPage.tsx` já importa `SectionTitle` de `../../components/ui/SectionTitle` (mesmo achado da Onda 6a) — não há duplicação a resolver.

**4 grids sem breakpoint intermediário** (mesmo padrão de "furo de responsividade" corrigido nas ondas anteriores):
- KPIs (5 itens): `grid-cols-2 lg:grid-cols-5`
- Distribuição por Interface (4 itens): `grid-cols-2 lg:grid-cols-4`
- Correlação OS×Cidade (4 itens): `grid-cols-2 lg:grid-cols-4`
- Campos da fonte de dados (API Grafana, 5 itens — 4 inputs + botão "Salvar e Conectar"): `grid-cols-2 lg:grid-cols-3`

O grid de `ClientCard` (tabela de clientes conectados, modo "Cards") já é totalmente responsivo (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`) — não precisa de fix.

**Restrições permanentes (herdadas das ondas anteriores, sem exceção):**
- Design sóbrio: tokens reais do `index.css`, Inter, cor só pra status.
- Sem novas dependências de stack.
- `npm run build`, `npm run lint`, `npm run audit:ds`, `npx tsc --noEmit`, `npm test` limpos antes de qualquer commit.
- Nenhuma mudança de rota, permissão, dado ou lógica de negócio — `transformJuniper`, `useAIJuniper`, `getHeroStyle`, `StatusPill`/`ClientCard`/`InterfaceCard`/`SnapshotRow`/`OsCityCard`, histórico de snapshots (local + servidor), configuração da fonte de dados (local/API) ficam intocados.
- `PageHeader` já suporta `icon?`/`titleExtra?`/`actions?` — nenhuma mudança de API necessária nesta sub-onda.
- Nota de precisão herdada da Onda 6a (não repetir o erro): adotar `PageHeader` (que sempre renderiza `<h1>`) padroniza Juniper com as 8 telas já migradas, mas **não** resulta em "exatamente um `<h1>` por página" — `Navbar.tsx` já renderiza seu próprio `<h1>{title}</h1>` por rota. Juniper passa de 1 `<h1>` (hoje) pra 2 (Navbar + PageHeader), igual às demais.

---

## 2. Decisões de escopo (resolvidas com o usuário)

1. **Cabeçalho de Juniper**: `titleExtra` recebe o indicador pulsante "atualiza a cada 5 min" (colado ao título, dentro do `<h1>`); `actions` recebe o badge do cluster (à direita, mesmo slot já usado nas 7 telas anteriores). Sem `description`.
2. **4 grids corrigidos** pro padrão já usado nas ondas anteriores: 5 itens → `grid-cols-2 md:grid-cols-3 lg:grid-cols-5`; 4 itens → `grid-cols-2 sm:grid-cols-4`. Inclui o grid de campos da API do Grafana (formulário), mesmo não sendo cards de KPI — decisão explícita de manter consistência visual em toda a tela.

---

## 3. Mudanças

### 3.1 `JuniperPage.tsx` — cabeçalho

Substitui:
```tsx
      <div className="flex items-center gap-2 flex-wrap">
        <Zap size={16} className="text-primary" />
        <h2 className="font-headline text-xl font-semibold text-text">
          Juniper PPPoE — Validação de Clientes
        </h2>
        <div className="flex items-center gap-1.5 ml-1">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
          </span>
          <span className="text-caption text-muted">atualiza a cada 5 min</span>
        </div>
        {apiConfig.cluster && (
          <span className="ml-auto text-caption font-bold uppercase tracking-[0.06em] px-2.5 py-0.5
                           rounded-full bg-primary/10 text-primary border border-primary/20">
            {apiConfig.cluster}
          </span>
        )}
      </div>
```
por:
```tsx
      <PageHeader
        title="Juniper PPPoE — Validação de Clientes"
        icon={Zap}
        titleExtra={
          <span className="flex items-center gap-1.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
            </span>
            <span className="text-caption text-muted">atualiza a cada 5 min</span>
          </span>
        }
        actions={
          apiConfig.cluster && (
            <span className="text-caption font-bold uppercase tracking-[0.06em] px-2.5 py-0.5
                             rounded-full bg-primary/10 text-primary border border-primary/20">
              {apiConfig.cluster}
            </span>
          )
        }
      />
```

Novo import (após `import { SectionTitle } from '../../components/ui/SectionTitle'`, mantendo ordem alfabética já usada no arquivo — checar posição exata na implementação):
```tsx
import { PageHeader } from '../../components/ui/PageHeader'
```

### 3.2 `JuniperPage.tsx` — grids

- Linha do grid de KPIs: `grid grid-cols-2 lg:grid-cols-5 gap-3` → `grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3`
- Linha do grid de Distribuição por Interface: `grid grid-cols-2 lg:grid-cols-4 gap-3` → `grid grid-cols-2 sm:grid-cols-4 gap-3`
- Linha do grid de Correlação OS×Cidade: `grid grid-cols-2 lg:grid-cols-4 gap-3` → `grid grid-cols-2 sm:grid-cols-4 gap-3`
- Linha do grid de campos da fonte de dados (API Grafana): `grid grid-cols-2 lg:grid-cols-3 gap-3 animate-slide-down` → `grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 animate-slide-down`

Resto do arquivo (banner de dados desatualizados, banner de alerta crítico, painel "Fonte de Dados" com toggle local/API, hero de status, histórico gráfico, tabela/cards de clientes conectados, histórico de snapshots, correlação IA) **inalterado**.

---

## 4. Fora do escopo desta implementação

- Fechamento, Usuários — sub-ondas seguintes, fora deste plano.
- Qualquer redesign funcional (config da fonte de dados, histórico, IA de correlação).
- Qualquer mudança de rota, permissão ou lógica de dados/negócio.
- Grid de `ClientCard` (já responsivo).

---

## 5. Testes

- Suíte completa (`npm test`) deve continuar 100% verde — nenhuma mudança de comportamento esperada (só JSX/import/classes de grid; `transformJuniper`/hooks/cálculos não mudam), regressão confirmada nos 8 consumidores existentes do `PageHeader`.
- Verificação manual no navegador: cabeçalho com ícone `Zap`, indicador "atualiza a cada 5 min" colado ao título, badge do cluster à direita (quando `apiConfig.cluster` não vazio); banners de alerta/dados desatualizados continuam funcionando; toggle Servidor Local/Grafana API continua funcionando; 4 grids responsivos em 375px/768px/1440px; histórico gráfico, tabela/cards de clientes, histórico de snapshots e correlação IA continuam funcionando normalmente.

---

## 6. Arquivos afetados

- `src/features/juniper/JuniperPage.tsx` — adota `PageHeader` com `icon`/`titleExtra`/`actions`, 4 grids responsivos.
