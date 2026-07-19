# Redesign Enterprise — Onda 5e: Alertas (Design)

**Data:** 2026-07-19
**Status:** Aprovado pelo usuário
**Escopo deste documento:** design da Onda 5e — quinta e última sub-onda de "Onda 5: ERP analíticos" (`docs/superpowers/specs/2026-07-15-redesign-enterprise-onda1-fundacao-design.md` §3, decomposta em 5 sub-ondas de uma tela cada — ver `docs/superpowers/specs/2026-07-19-onda5a-qualidade-design.md` §1). Escopo: `src/features/erp/alertas/AlertasPage.tsx` — adoção do `PageHeader`, que precisa ganhar dois slots novos (`titleExtra`/`descriptionExtra`) pra suportar o badge de contagem e o indicador "Ao vivo" que este cabeçalho tem e nenhuma tela anterior precisou.

---

## 1. Contexto

`AlertasPage.tsx` tem o cabeçalho mais rico das 5 telas de Onda 5: além de título+descrição, tem um **badge dinâmico** colado no título ("N ativos" em vermelho ou "OK" em verde, conforme `hasAny`) e um **indicador "Ao vivo" pulsante** colado na descrição (visível só quando `!isLoading`). Nenhum dos dois cabe na API atual do `PageHeader` (`title`/`description` são `string`).

**Grids sem nenhuma responsividade**: dois grids (`Severity Bento` com 3 cards de severidade — Crítico/Alto/Médio — e `Context KPIs` com 3 cards — OS na Fila/Score Saúde/Aging Médio) usam `grid-cols-3` fixo, sem nenhum breakpoint — diferente do padrão "breakpoint intermediário faltando" corrigido nas sub-ondas anteriores, aqui é zero responsividade (3 colunas até em 375px).

**`SectionLabel` de Alertas não precisa de dedup**: `AlertasPage.tsx` já importa `SectionLabel` de uma única fonte (`./AlertasComponents`, que já o exporta) — diferente do achado da Onda 5d (Planner tinha 2 cópias locais idênticas). Não há duplicação interna a resolver aqui.

**Restrições permanentes (herdadas das ondas anteriores, sem exceção):**
- Design sóbrio: tokens reais do `index.css`, Inter, cor só pra status.
- Sem novas dependências de stack.
- `npm run build`, `npm run lint`, `npm run audit:ds`, `npx tsc --noEmit`, `npm test` limpos antes de qualquer commit.
- Nenhuma mudança de rota, permissão, dado ou lógica de negócio — só reorganização de UI + extensão aditiva do `PageHeader`. `buildAlerts`, `useAlerts`, `useGrafanaOS`, `useAIAlertas`, `AlertCard`/`RuleCard`/`GrafanaCityStrip`/`SettingsPanel` ficam intocados.
- A mudança em `PageHeader.tsx` deve ser retrocompatível: `OrdensPage.tsx`, `FilaPage.tsx`, `QualidadePage.tsx`, `RankingTecnicosPage.tsx`, `RelatoriosPage.tsx`, `PlannerPage.tsx` (já usam `PageHeader` sem `titleExtra`/`descriptionExtra`) não podem ter seu cabeçalho alterado.

---

## 2. Decisões de escopo (resolvidas com o usuário)

1. **`PageHeader` ganha `titleExtra?`/`descriptionExtra?`**: dois slots `ReactNode` opcionais, aditivos/retrocompatíveis (mesmo raciocínio de `icon?`, adicionado na Onda 5b) — sem eles, o `PageHeader` renderiza exatamente como hoje. Reutilizável se outra tela precisar de algo parecido no futuro.
2. **Grids de Alertas**: corrigir os dois `grid-cols-3` fixos pro padrão de 3 itens já usado no Dashboard (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`).
3. **`SectionLabel` de Alertas não migra pro canônico neutro**: decisão explícita — migrar mudaria a aparência (ícone/texto perdem cor), fica fora do escopo desta onda de reorganização. Planner (Onda 5d) também ficou no padrão colorido. Uma eventual unificação visual entre os dois estilos (neutro vs. colorido) fica pra uma limpeza dedicada futura, fora do roadmap de Onda 5.

---

## 3. Mudanças

### 3.1 `src/components/ui/PageHeader.tsx`

```tsx
import type { ComponentType, ReactNode } from 'react'

export interface PageHeaderProps {
  title:             string
  titleExtra?:       ReactNode
  description?:      string
  descriptionExtra?: ReactNode
  icon?:             ComponentType<{ size?: number; className?: string }>
  actions?:          ReactNode
  className?:        string
}

export function PageHeader({ title, titleExtra, description, descriptionExtra, icon: Icon, actions, className = '' }: PageHeaderProps) {
  const hasTitleRow = !!Icon || !!titleExtra
  const hasDescRow  = !!description && !!descriptionExtra

  return (
    <div className={`flex items-start justify-between gap-4 flex-wrap ${className}`}>
      <div className="min-w-0">
        <h1 className={`text-title font-semibold text-text ${hasTitleRow ? 'flex items-center gap-2' : ''}`}>
          {Icon && <Icon size={18} className="text-primary" />}
          {title}
          {titleExtra}
        </h1>
        {description && (
          hasDescRow ? (
            <div className="flex items-center gap-3 mt-0.5">
              <p className="text-label text-muted">{description}</p>
              {descriptionExtra}
            </div>
          ) : (
            <p className="text-label text-muted mt-0.5">{description}</p>
          )
        )}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  )
}
```

Igual ao que aconteceu com `icon` na Onda 5b, adotar `PageHeader` em Alertas padroniza a tipografia (título vira `text-title font-semibold`, era `text-[20px] font-headline font-bold`; descrição vira `text-label text-muted`, era `text-label text-secondary`) — mesma consequência aceita nas 6 telas anteriores.

### 3.2 `AlertasPage.tsx`

Substitui o bloco de cabeçalho (linhas 90-131: `<div className="flex items-start justify-between gap-4">` com título+badge+descrição+indicador de um lado, botão "Configurar" do outro) por:

```tsx
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <PageHeader
        title="Notificações & Alertas"
        titleExtra={
          hasAny ? (
            <span className="inline-flex items-center gap-1.5 text-caption font-bold px-2 py-0.5 rounded-full border"
                  style={{ background: 'rgba(248,113,113,0.12)', borderColor: 'rgba(248,113,113,0.35)', color: '#f87171' }}>
              {totalAlerts} ativo{totalAlerts > 1 ? 's' : ''}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-caption font-bold px-2 py-0.5 rounded-full border"
                  style={{ background: 'rgba(74,222,128,0.10)', borderColor: 'rgba(74,222,128,0.30)', color: '#4ade80' }}>
              OK
            </span>
          )
        }
        description="Motor de regras em tempo real · ERP"
        descriptionExtra={
          !isLoading && (
            <span className="flex items-center gap-1.5 text-caption text-muted">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green" />
              </span>
              Ao vivo
            </span>
          )
        }
        actions={
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-1.5 text-caption text-secondary hover:text-text
                       px-3 py-1.5 rounded-xl border border-white/[0.08] hover:border-muted/40
                       hover:bg-surface/30 transition-all duration-150 flex-shrink-0"
          >
            <Settings size={13} /> Configurar
          </button>
        }
      />
```

Badge, indicador e botão mantêm o JSX interno exato de hoje — só mudam de posição (viram props do `PageHeader`).

Grids (linhas 134 e 173: `<div className="grid grid-cols-3 gap-3">`) viram `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3` nos dois casos.

Resto do arquivo (bento de severidade, KPIs de contexto, IA de Alertas, faixa Grafana por cidade, lista de alertas/regras, painel de configurações) **inalterado**.

---

## 4. Fora do escopo desta implementação

- Migrar `SectionLabel` de Alertas (ou Planner) pro canônico neutro.
- Qualquer redesign funcional (regras de alerta, IA, integração Grafana, painel de configurações).
- Qualquer mudança de rota, permissão ou lógica de dados/negócio.

---

## 5. Testes

- **`src/components/ui/PageHeader.test.tsx`**: adicionar testes pro novo comportamento (`titleExtra` renderiza ao lado do título; `descriptionExtra` renderiza ao lado da descrição, só quando `description` também está presente) — mesmo arquivo/padrão RTL já existente.
- Suíte completa (`npm test`) deve continuar 100% verde — nenhuma mudança de comportamento esperada em `AlertasPage.tsx` (só JSX/props; `buildAlerts`/hooks/cálculos não mudam), e regressão confirmada nos 6 consumidores existentes do `PageHeader` (Ordens/Fila/Qualidade/Ranking/Relatórios/Planner).
- Verificação manual no navegador: cabeçalho com badge de contagem (ou "OK") ao lado do título, indicador "Ao vivo" ao lado da descrição (some durante loading), botão "Configurar" abrindo o painel de settings; grids de severidade e KPIs de contexto responsivos em 3 larguras (375px/768px/1440px); as 6 telas anteriores continuam com cabeçalho idêntico ao de antes.

---

## 6. Arquivos afetados

- `src/components/ui/PageHeader.tsx` — ganha `titleExtra?`/`descriptionExtra?`.
- `src/components/ui/PageHeader.test.tsx` — novos testes de `titleExtra`/`descriptionExtra`.
- `src/features/erp/alertas/AlertasPage.tsx` — adota `PageHeader`, grids responsivos.
