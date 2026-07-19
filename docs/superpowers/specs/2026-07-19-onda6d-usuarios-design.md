# Redesign Enterprise — Onda 6d: Usuários (Design)

**Data:** 2026-07-19
**Status:** Aprovado pelo usuário
**Escopo deste documento:** design da Onda 6d — quarta e última sub-onda de "Onda 6: Periféricas" (`docs/superpowers/specs/2026-07-15-redesign-enterprise-onda1-fundacao-design.md` §3, decomposta em 4 sub-ondas: Fornecedor/Juniper/Fechamento/Usuários — ver `docs/superpowers/specs/2026-07-19-onda6a-fornecedor-design.md` §1). Escopo: `src/features/admin/UsuariosPage.tsx` — adoção do `PageHeader`, usando `icon`+`description`+`actions` juntos (combinação nova — cada par já foi usado isoladamente nas 9 telas anteriores, mas nunca os três juntos — sem mudança de API).

---

## 1. Contexto

`UsuariosPage.tsx` é a mais simples e de menor risco das 4 telas desta decomposição: seu cabeçalho já tem a forma exata do `PageHeader` — ícone (`Shield`, já em `size={18}`, mesmo tamanho que o `PageHeader` usa) + `<h1>` (única tela da série que já usava `<h1>` real; as outras 9 usavam `<h2>`) + descrição abaixo do título + botão "Novo usuário" à direita via `flex items-center justify-between`. Nenhum grid no arquivo (só tabelas de usuários e de permissões) — nenhuma correção de responsividade necessária.

**Container `p-6 space-y-5` já é padrão aceito**: diferente de `space-y-4 animate-fade-in` usado por Fornecedor/Juniper/Fechamento, `UsuariosPage.tsx` usa `p-6 space-y-5` — mas esse container já coexiste com `PageHeader` em `FilaPage.tsx` (Onda 4), então não é um obstáculo nem precisa de ajuste.

**Bloco "Permissões por papel" fora do escopo**: tem seu próprio `<h2>`+`<p>` local (não usa `SectionTitle`/`SectionLabel`) — é um cabeçalho de seção bespoke, não uma duplicação de componente, e não é o cabeçalho principal da página. Fica intocado.

**Restrições permanentes (herdadas das ondas anteriores, sem exceção):**
- Design sóbrio: tokens reais do `index.css`, Inter, cor só pra status.
- Sem novas dependências de stack.
- `npm run build`, `npm run lint`, `npm run audit:ds`, `npx tsc --noEmit`, `npm test` limpos antes de qualquer commit.
- Nenhuma mudança de rota, permissão, dado ou lógica de negócio — `useUsuarios`, `useUsuariosActions`, `usePermissoes`, `usePermissoesActions`, `NovoUsuarioModal`, `ResetSenhaModal`, `PermissoesMatrix`, tabela de usuários (papel/status/ações) ficam intocados.
- `PageHeader` já suporta `icon?`/`description?`/`actions?` — nenhuma mudança de API necessária nesta sub-onda.
- Nota de precisão herdada da Onda 6a (não repetir o erro): adotar `PageHeader` padroniza Usuários com as 9 telas já migradas, mas o `Navbar.tsx` já renderiza seu próprio `<h1>` por rota — a página passa a ter dois `<h1>` (era o único caso da série que já tinha exatamente um antes desta mudança), igual às demais 9 depois de migradas.

---

## 2. Decisões de escopo (resolvidas com o usuário)

1. **Cabeçalho de Usuários**: `icon` recebe `Shield`, `description` recebe o texto já existente ("Cadastro de usuários e módulos liberados por papel", sem alteração), `actions` recebe o botão "Novo usuário" (JSX interno idêntico, só realocado — mesmo padrão de Alertas na Onda 5e).
2. **Nenhum grid muda** (não existem grids neste arquivo) e o bloco "Permissões por papel" fica fora do escopo (não é o cabeçalho principal, não usa `SectionTitle`/`SectionLabel`).

---

## 3. Mudanças

### 3.1 `UsuariosPage.tsx` — cabeçalho

Substitui:
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

Novo import (após `import type { UserRole, UsuarioItem } from '../../lib/api'`, mantendo a ordem de imports já usada no arquivo — checar posição exata na implementação):
```tsx
import { PageHeader } from '../../components/ui/PageHeader'
```

Resto do arquivo (tabela de usuários com papel/status/ações, modais `NovoUsuarioModal`/`ResetSenhaModal`, bloco "Permissões por papel" com `PermissoesMatrix`) **inalterado**.

---

## 4. Fora do escopo desta implementação

- Qualquer redesign funcional (criação de usuário, reset de senha, matriz de permissões).
- Qualquer mudança de rota, permissão ou lógica de dados/negócio.
- O bloco "Permissões por papel" (cabeçalho de seção local, não é o cabeçalho principal).
- Container `p-6 space-y-5` (já é padrão aceito, coexiste com `PageHeader` em `FilaPage.tsx`).

---

## 5. Testes

- Suíte completa (`npm test`) deve continuar 100% verde — nenhuma mudança de comportamento esperada (só JSX/import; hooks/lógica não mudam), regressão confirmada nos 9 consumidores existentes do `PageHeader`.
- Verificação manual no navegador: cabeçalho com ícone `Shield`, título "Usuários e Permissões" e descrição abaixo, botão "Novo usuário" à direita continuando a abrir o modal de criação; tabela de usuários (trocar papel, ativar/desativar, redefinir senha) e bloco "Permissões por papel" (toggle de módulos por papel) continuam funcionando normalmente.

---

## 6. Arquivos afetados

- `src/features/admin/UsuariosPage.tsx` — adota `PageHeader` com `icon`/`description`/`actions`.

---

## 7. Fecha a Onda 6

Esta é a última das 4 sub-ondas de "Onda 6: Periféricas" (Fornecedor → Juniper → Fechamento → Usuários). Após esta sub-onda, todas as 10 telas com cabeçalho convencional do sistema (Ordens/Fila/Qualidade/Ranking/Relatórios/Planner/Alertas/Fornecedor/Juniper/Fechamento/Usuários — 11, na verdade) usam `PageHeader`. Mapa, NOC e Login permanecem fora (estruturalmente diferentes, ver §1 da spec da Onda 6a).
