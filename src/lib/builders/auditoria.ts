import type { OSRow } from '../types'

export function buildAuditoria(rows: OSRow[], discardedLixo = 0, duplicadosLixo = 0) {
  const total      = rows.length
  const semEquipe  = rows.filter(r => !r.nomedaequipe?.trim()).length
  const semData    = rows.filter(r => !r.datacadastro?.trim()).length
  const semCidade  = rows.filter(r => !r.nomedacidade?.trim()).length
  const semTipo    = rows.filter(r => !r.tiposervico?.trim()).length
  const duplicados = duplicadosLixo

  const issues  = [semEquipe, semData, semCidade, semTipo, duplicados]
  const penalty = issues.reduce((s, v) => s + (total > 0 ? v / total * 100 : 0), 0)
  const scoreVal   = Math.max(0, Math.round(100 - penalty))
  const scoreLabel = scoreVal >= 90 ? 'Excelente' : scoreVal >= 75 ? 'Bom' : scoreVal >= 50 ? 'Regular' : 'Crítico'

  const summary = [
    { label: 'Total OS',           value: total,         ok: true },
    { label: 'Sem Equipe',         value: semEquipe,     ok: semEquipe      === 0, sub: `${Math.round(semEquipe / (total || 1) * 100)}% do total` },
    { label: 'Sem Data',           value: semData,       ok: semData        === 0 },
    { label: 'Duplicados',         value: duplicados,    ok: duplicados     === 0 },
    { label: 'Descartadas (lixo)', value: discardedLixo, ok: discardedLixo === 0, sub: 'numos inválido (texto/CEP/telefone)' },
  ]

  const problems = [
    semEquipe > 0 && {
      title: 'OS sem equipe atribuída', severity: 'red',
      desc:  `${semEquipe} OS em aberto sem equipe definida. Verifique a fila de distribuição.`,
      rows:  rows.filter(r => !r.nomedaequipe?.trim()).slice(0, 50).map(r => ({ numos: r.numos, status: r.descsituacao, cidade: r.nomedacidade })),
    },
    semData > 0 && {
      title: 'OS sem data de cadastro', severity: 'yellow',
      desc:  `${semData} OS sem datacadastro preenchido. Pode impactar o cálculo de aging.`,
      rows:  rows.filter(r => !r.datacadastro?.trim()).slice(0, 50).map(r => ({ numos: r.numos, status: r.descsituacao, cidade: r.nomedacidade })),
    },
    duplicados > 0 && {
      title: 'numos duplicados detectados', severity: 'yellow',
      desc:  `${duplicados} OS com número duplicado — podem ser merges de pendente + agendado.`,
      rows:  [] as { numos: string; status: string; cidade: string }[],
    },
    discardedLixo > 0 && {
      title: 'Linhas descartadas por numos inválido', severity: 'yellow',
      desc:  `${discardedLixo} linhas descartadas por ter texto, CEP ou telefone no campo de número da OS (esperado: exatamente 7 dígitos).`,
      rows:  [] as { numos: string; status: string; cidade: string }[],
    },
  ].filter(Boolean) as { title: string; severity: string; desc: string; rows: { numos: string; status: string; cidade: string }[] }[]

  const tips = [
    { text: 'Exporte CSVs pendente, agendado e futuro em UTF-8.' },
    { text: 'Verifique se todas as OS têm equipe atribuída antes de fechar o dia.' },
    { text: 'OS "Concluída/Sem Execução" indicam fechamentos sem atendimento real — monitore.' },
  ]

  return { score: { value: scoreVal, label: scoreLabel, ts: new Date().toLocaleTimeString('pt-BR') }, summary, problems, tips }
}
