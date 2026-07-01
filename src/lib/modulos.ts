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
  fechamento:        '/fechamento',
  mapa:              '/mapa',
  noc:               '/noc',
  erp_relatorios:    '/erp/relatorios',
  erp_alertas:       '/erp/alertas',
  erp_produtividade: '/erp/produtividade',
  erp_qualidade:     '/erp/qualidade',
  erp_planner:       '/erp/planner',
  erp_fila:          '/erp/fila',
  erp_ranking:       '/erp/ranking',
  erp_acao:          '/erp/acao',
}

export function moduloParaRota(chave: string): string | undefined {
  return MODULO_ROTA[chave]
}

export function rotaParaModulo(rota: string): string | undefined {
  return Object.entries(MODULO_ROTA).find(([, r]) => r === rota)?.[0]
}
