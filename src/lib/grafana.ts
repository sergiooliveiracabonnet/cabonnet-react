// Client-side wrappers for the /grafana proxy routes in servidor.js

async function get(path: string): Promise<unknown> {
  const r = await fetch(path)
  const json = await r.json()
  if (!r.ok) throw new Error(json?.error ?? `HTTP ${r.status}`)
  return json
}

export const grafana = {
  osTotais:       () => get('/grafana/os-totais'),
  osCidades:      () => get('/grafana/os-cidades'),
  incidentes:     () => get('/grafana/incidentes'),
  zabbixMttr:        () => get('/grafana/zabbix/mttr'),
  zabbixCidades:     () => get('/grafana/zabbix/cidades'),
  zabbixTopEquip:    () => get('/grafana/zabbix/top-equipamentos'),
  zabbixPppoe:       () => get('/grafana/zabbix/pppoe'),
  zabbixOlt:         () => get('/grafana/zabbix/olt'),
  zabbixInfra:       () => get('/grafana/zabbix/infra'),
  zabbixAssinantes:  () => get('/grafana/zabbix/assinantes'),
}
