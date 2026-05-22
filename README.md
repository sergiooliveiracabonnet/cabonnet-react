# Cabonnet — Dashboard Operacional

Dashboard interno para gestão de ordens de serviço, SLA, atendimento e capacidade operacional da Cabonnet.

## Stack

- **React 19** + Vite 8
- **TanStack Query v5** — cache e sincronização de dados
- **Zustand 5** — estado global (UI, auth)
- **React Router v7** — navegação SPA
- **Tailwind CSS 3** — estilização via tokens customizados
- **Chart.js / react-chartjs-2** — gráficos
- **Vitest + jsdom** — testes unitários

## Pré-requisitos

- Node.js 20+
- Backend Cabonnet rodando em `http://localhost:5000`

## Instalação

```bash
npm install
```

## Desenvolvimento

```bash
npm run dev
# Abre em http://localhost:3000
# API proxiada automaticamente para http://localhost:5000
```

## Testes

```bash
npm run test          # modo watch
npm run test -- --run # uma execução só
```

## Build de produção

```bash
npm run build   # gera dist/
npm run preview # serve o build local
```

## Variáveis de ambiente

Crie um arquivo `.env.local` na raiz (nunca commitar):

```env
# Sobrescreve a URL do backend se necessário
VITE_API_BASE=http://localhost:5000
```

## Estrutura

```
src/
  features/      # páginas por domínio (dashboard, ordens, sla, etc.)
  components/    # componentes reutilizáveis (ui/, layout/)
  lib/           # api.js, transform.js, osFormat.js, queryClient.js
  store/         # Zustand (authStore, uiStore)
  contexts/      # OSDataContext — dados globais transformados
  hooks/         # hooks de domínio
```

## Lint

```bash
npm run lint
```
