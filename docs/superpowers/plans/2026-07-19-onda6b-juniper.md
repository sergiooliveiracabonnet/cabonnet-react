# Onda 6b — Juniper (PageHeader) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `JuniperPage.tsx` adota o `PageHeader` (já usado em Ordens/Fila/Qualidade/Ranking/Relatórios/Planner/Alertas/Fornecedor) usando `titleExtra` (indicador "atualiza a cada 5 min") e `actions` (badge do cluster) — segunda sub-onda de "Onda 6: Periféricas". 4 grids sem breakpoint intermediário também são corrigidos.

**Architecture:** Substituição de JSX num único arquivo — o bloco de cabeçalho artesanal (ícone+h2+indicador+badge) vira `<PageHeader title icon titleExtra actions />`, usando props já existentes (`titleExtra` desde a Onda 5e, `actions` desde a Onda 4). 4 classes de grid ganham breakpoint intermediário. Nenhuma lógica (`transformJuniper`, `useAIJuniper`, config de fonte de dados, histórico) muda.

**Tech Stack:** React 18 + TypeScript.

## Global Constraints

- Design sóbrio: tokens reais do `index.css`, Inter, cor só pra status.
- Sem novas dependências de stack.
- Antes de commitar: `npx tsc --noEmit`, `npm run lint`, `npm run audit:ds`, `npm test`, `npm run build` devem passar limpos.
- Nenhuma mudança de rota, permissão, dado ou lógica de negócio — `transformJuniper`, `useAIJuniper`, `getHeroStyle`, `StatusPill`/`ClientCard`/`InterfaceCard`/`SnapshotRow`/`OsCityCard`, histórico de snapshots (local + servidor), configuração da fonte de dados (local/API), `SectionTitle` não mudam.
- `PageHeader` já suporta `icon?`/`titleExtra?`/`actions?` (Onda 4/5e) — nenhuma mudança de API necessária nesta sub-onda.
- Grid de `ClientCard` (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`) já está correto — não tocar.
- Mudanças de UI exigem verificação manual no navegador — o controller faz essa verificação depois que a task e a review terminam (mesmo padrão das ondas anteriores).
- Não repetir a alegação incorreta de "exatamente um `<h1>` por página" (corrigida na Onda 6a) — adotar `PageHeader` padroniza Juniper com as 8 telas já migradas, mas o `Navbar.tsx` já renderiza seu próprio `<h1>` por rota, então a página passa a ter dois `<h1>`, igual às demais.

---

### Task 1: Adotar `PageHeader` em `JuniperPage.tsx` e corrigir grids

**Files:**
- Modify: `src/features/juniper/JuniperPage.tsx` (bloco de cabeçalho + 1 import + 4 classes de grid)

**Interfaces:**
- Consumes: `PageHeader` de `../../components/ui/PageHeader` (`{ title, icon, titleExtra, actions }`, todas já existentes, sem mudanças de API necessárias aqui).

- [ ] **Step 1: Adicionar o import do `PageHeader`**

Adicionar, após `import { SectionTitle } from '../../components/ui/SectionTitle'`:

```tsx
import { PageHeader } from '../../components/ui/PageHeader'
```

- [ ] **Step 2: Substituir o bloco de cabeçalho**

Substituir:

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

(`Zap` já está importado no topo do arquivo, de `lucide-react` — não precisa de novo import.)

- [ ] **Step 3: Corrigir o grid de campos da fonte de dados (API Grafana)**

Substituir:

```tsx
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 animate-slide-down">
```

por:

```tsx
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 animate-slide-down">
```

- [ ] **Step 4: Corrigir o grid de KPIs**

Substituir:

```tsx
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
```

por:

```tsx
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
```

- [ ] **Step 5: Corrigir o grid de Distribuição por Interface**

Substituir:

```tsx
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {interfaces.map(iface => <InterfaceCard key={iface.nome} iface={iface} maxIface={maxIface} />)}
          </div>
```

por:

```tsx
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {interfaces.map(iface => <InterfaceCard key={iface.nome} iface={iface} maxIface={maxIface} />)}
          </div>
```

- [ ] **Step 6: Corrigir o grid de Correlação OS×Cidade**

Substituir:

```tsx
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {osCidades.map(c => <OsCityCard key={c.cidade} cidade={c.cidade} total={c.total} maxOsCity={maxOsCity} />)}
          </div>
```

por:

```tsx
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {osCidades.map(c => <OsCityCard key={c.cidade} cidade={c.cidade} total={c.total} maxOsCity={maxOsCity} />)}
          </div>
```

- [ ] **Step 7: Rodar a suíte completa de testes (regressão)**

Run: `npm test`
Expected: PASS — sem regressão (`JuniperPage.tsx` não tem testes próprios hoje).

- [ ] **Step 8: Type-check, lint, audit de design system e build**

Run: `npx tsc --noEmit && npm run lint && npm run audit:ds && npm run build`
Expected: sem erros.

- [ ] **Step 9: Verificação manual no navegador**

Run: `npm run dev` (porta 3000, `strictPort: true`).

No navegador, autenticado, em `/juniper`:
1. `PageHeader` mostra o ícone `Zap` antes do título "Juniper PPPoE — Validação de Clientes", indicador pulsante "atualiza a cada 5 min" colado ao título, badge do cluster (ex. "VALE") à direita — mesmo estilo visual de antes, agora via `<h1>` semântico.
2. Banners de "Dados desatualizados" e "ALERTA — Sessões PPPoE problemáticas" (se aplicável) continuam aparecendo/funcionando normalmente.
3. Toggle "Servidor Local" / "Grafana API" continua funcionando; campos da API (quando "Grafana API" selecionado) ficam em 2 colunas em mobile, 3 em tablet, 5 em desktop.
4. KPIs, Distribuição por Interface e Correlação OS×Cidade ficam em 2 colunas em mobile e crescem corretamente em telas maiores (md/lg).
5. Histórico gráfico, tabela/cards de clientes conectados (toggle Cards/Tabela), histórico de snapshots e correlação IA (Inativos × OS) continuam funcionando normalmente.

Reportar o resultado de cada item antes de prosseguir. Se algo divergir do esperado, corrigir antes do commit.

- [ ] **Step 10: Commit**

```bash
git add src/features/juniper/JuniperPage.tsx
git commit -m "refactor(juniper): adota PageHeader com titleExtra/actions, grids responsivos"
```

---

## Self-Review (executado ao escrever este plano)

**Cobertura do spec:** §3.1 (cabeçalho) → Steps 1-2. §3.2 (4 grids) → Steps 3-6. §5 (testes) → regressão da suíte completa + verificação manual cobrindo cabeçalho/banners/toggle/grids/histórico/IA.

**Placeholders:** nenhum "TBD" — código completo e literal; os blocos "antes" são cópia exata do arquivo lido durante o brainstorming.

**Consistência de tipos:** `PageHeader` consumido com `title`+`icon`+`titleExtra`+`actions`, mesma assinatura já estabelecida na Onda 5e (`titleExtra?: ReactNode`, `actions?: ReactNode`) — nenhuma mudança de API necessária nesta sub-onda.
