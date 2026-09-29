// Mapa módulo (chave usada no backend/permissões) ↔ rota do frontend.
// Mantido em sincronia com ALL_MODULOS (cabonnet/db.py) e com os links do
// Sidebar (src/components/layout/Sidebar.tsx).

export const MODULO_ROTA: Record<string, string> = {
  dashboard:         '/',
  ordens:            '/ordens',
  graficos:          '/graficos',
  cidades:           '/cidades',
  fornecedor:        '/fornecedor',
  juniper:           '/juniper',
  nivel_sinal:       '/nivel-sinal',
  fechamento:        '/fechamento',
  mapa:              '/mapa',
  cliente:           '/clientes',
  noc:               '/noc',
  erp_relatorios:    '/erp/relatorios',
  erp_alertas:       '/erp/alertas',
  erp_escala:        '/erp/escala',
  erp_fila:          '/erp/fila',
  erp_ranking:       '/erp/ranking',
}

// Rotas que herdam a permissão de um módulo existente (sem módulo próprio no backend).
const ROTA_ALIAS: Record<string, string> = {
  '/qualidade': 'dashboard',
  '/qualidade/reincidencias': 'dashboard',
}

export function moduloParaRota(chave: string): string | undefined {
  return MODULO_ROTA[chave]
}

export function rotaParaModulo(rota: string): string | undefined {
  return ROTA_ALIAS[rota] ?? Object.entries(MODULO_ROTA).find(([, r]) => r === rota)?.[0]
}
