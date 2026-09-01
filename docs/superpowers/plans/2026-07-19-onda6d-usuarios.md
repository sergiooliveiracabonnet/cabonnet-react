# Onda 6d — Usuários (PageHeader) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `UsuariosPage.tsx` adota o `PageHeader` (já usado em Ordens/Fila/Qualidade/Ranking/Relatórios/Planner/Alertas/Fornecedor/Juniper/Fechamento) usando `icon`+`description`+`actions` juntos — quarta e última sub-onda de "Onda 6: Periféricas", fecha toda a Onda 6.

**Architecture:** Substituição de JSX num único arquivo — o bloco `<div className="flex items-center justify-between"><div><h1>...</h1><p>...</p></div><Button>...</Button></div>` vira `<PageHeader title description icon={Shield} actions={<Button>...</Button>} />`, usando props já existentes (cada uma já usada isoladamente nas 9 telas anteriores, combinação dos três é nova mas suportada sem mudança de API). Nenhuma lógica (hooks de usuários/permissões, modais) muda. Nenhum grid no arquivo.

**Tech Stack:** React 18 + TypeScript.

## Global Constraints

- Design sóbrio: tokens reais do `index.css`, Inter, cor só pra status.
- Sem novas dependências de stack.
- Antes de commitar: `npx tsc --noEmit`, `npm run lint`, `npm run audit:ds`, `npm test`, `npm run build` devem passar limpos.
- Nenhuma mudança de rota, permissão, dado ou lógica de negócio — `useUsuarios`, `useUsuariosActions`, `usePermissoes`, `usePermissoesActions`, `NovoUsuarioModal`, `ResetSenhaModal`, `PermissoesMatrix`, tabela de usuários não mudam.
- `PageHeader` já suporta `icon?`/`description?`/`actions?` — nenhuma mudança de API necessária nesta sub-onda.
- O bloco "Permissões por papel" (h2+p locais) não muda — não é o cabeçalho principal, fora do escopo.
- Container `p-6 space-y-5` não muda — já é padrão aceito (mesmo de `FilaPage.tsx`).
- Mudanças de UI exigem verificação manual no navegador — o controller faz essa verificação depois que a task e a review terminam (mesmo padrão das ondas anteriores).
- Não repetir a alegação incorreta de "exatamente um `<h1>` por página" (corrigida na Onda 6a) — adotar `PageHeader` padroniza Usuários com as 9 telas já migradas, mas o `Navbar.tsx` já renderiza seu próprio `<h1>` por rota, então a página passa a ter dois `<h1>` (era o único caso da série com exatamente um antes desta mudança), igual às demais depois de migradas.

---

### Task 1: Adotar `PageHeader` em `UsuariosPage.tsx`

**Files:**
- Modify: `src/features/admin/UsuariosPage.tsx` (só o bloco de cabeçalho + 1 import)

**Interfaces:**
- Consumes: `PageHeader` de `../../components/ui/PageHeader` (`{ title, description, icon, actions }`, todas já existentes, sem mudanças de API necessárias aqui).

- [ ] **Step 1: Adicionar o import do `PageHeader`**

Adicionar, após `import type { UserRole, UsuarioItem } from '../../lib/api'`:

```tsx
import { PageHeader } from '../../components/ui/PageHeader'
```

- [ ] **Step 2: Substituir o bloco de cabeçalho**

Substituir:

```tsx
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-bold text-text flex items-center gap-2">
            <Shield size={18} className="text-primary" /> Usuários e Permissões
          </h1>
          <p className="text-label text-muted mt-0.5">Cadastro de usuários e módulos liberados por papel</p>
        </div>
        <Button variant="primary" size="sm" className="gap-1.5" onClick={() => setNovoOpen(true)}>
          <UserPlus size={14} /> Novo usuário
        </Button>
      </div>
```

por:

```tsx
      <PageHeader
        title="Usuários e Permissões"
        description="Cadastro de usuários e módulos liberados por papel"
        icon={Shield}
        actions={
          <Button variant="primary" size="sm" className="gap-1.5" onClick={() => setNovoOpen(true)}>
            <UserPlus size={14} /> Novo usuário
          </Button>
        }
      />
```

(`Shield` já está importado no topo do arquivo, de `lucide-react` — não precisa de novo import. `Button` já está importado de `../../components/ui/Button`.)

- [ ] **Step 3: Rodar a suíte completa de testes (regressão)**

Run: `npm test`
Expected: PASS — sem regressão (`UsuariosPage.tsx` não tem testes próprios hoje).

- [ ] **Step 4: Type-check, lint, audit de design system e build**

Run: `npx tsc --noEmit && npm run lint && npm run audit:ds && npm run build`
Expected: sem erros.

- [ ] **Step 5: Verificação manual no navegador**

Run: `npm run dev` (porta 3000, `strictPort: true`).

No navegador, autenticado como gestor, em `/erp/usuarios`:
1. `PageHeader` mostra o ícone `Shield`, título "Usuários e Permissões" e a descrição "Cadastro de usuários e módulos liberados por papel" abaixo do título, botão "Novo usuário" à direita — mesmo estilo visual de antes (só agora via `PageHeader` compartilhado), abrindo o modal de criação ao clicar.
2. Tabela de usuários continua funcionando: trocar papel (select), ativar/desativar (ícone Power), redefinir senha (ícone Key abre modal).
3. Bloco "Permissões por papel" (matriz de checkboxes por módulo/papel) continua funcionando, incluindo o estado "Gestor sempre marcado e desabilitado".

Reportar o resultado de cada item antes de prosseguir. Se algo divergir do esperado, corrigir antes do commit.

- [ ] **Step 6: Commit**

```bash
git add src/features/admin/UsuariosPage.tsx
git commit -m "refactor(usuarios): adota PageHeader com icon/description/actions"
```

---

## Self-Review (executado ao escrever este plano)

**Cobertura do spec:** §3.1 (cabeçalho de Usuários) → Task 1, único bloco de mudança. §5 (testes) → regressão da suíte completa + verificação manual cobrindo cabeçalho/tabela/modais/matriz de permissões.

**Placeholders:** nenhum "TBD" — código completo e literal; o bloco "antes" é cópia exata do arquivo lido durante o brainstorming.

**Consistência de tipos:** `PageHeader` consumido com `title`+`description`+`icon`+`actions`, mesma assinatura já estabelecida (título/descrição desde a Onda 4/5b, `actions` desde a Onda 4, `icon` desde a Onda 5b) — nenhuma mudança de API necessária nesta sub-onda.
