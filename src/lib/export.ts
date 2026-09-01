const COLS = [
  { key: 'numos',           label: 'Nº OS'           },
  { key: 'nomecliente',     label: 'Cliente'          },
  { key: 'nomedacidade',    label: 'Cidade'           },
  { key: 'bairro',          label: 'Bairro'           },
  { key: 'logradouro',      label: 'Endereço'         },
  { key: 'tiposervico',     label: 'Tipo Serviço'     },
  { key: 'servico',         label: 'Serviço'          },
  { key: 'nomedaequipe',    label: 'Equipe'           },
  { key: 'descsituacao',    label: 'Situação'         },
  { key: '_fornecedor',     label: 'Fornecedor'       },
  { key: '_aging',          label: 'Aging (dias)'     },
  { key: '_slaLimite',      label: 'SLA Limite (d)'   },
  { key: '_slaExcedido',    label: 'SLA Excedido'     },
  { key: '_slaCritico',     label: 'SLA Crítico'      },
  { key: '_slaTipoLabel',   label: 'Tipo SLA'         },
  { key: 'datacadastro',    label: 'Data Cadastro'    },
  { key: 'dataagendamento', label: 'Agendamento'      },
  { key: 'dataexecucao',    label: 'Data Execução'    },
  { key: 'databaixa',       label: 'Data Baixa'       },
]

function cell(v: unknown): string {
  if (v == null) return ''
  const s = String(v)
  return s.includes(';') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s
}

export function exportCSV(rows: Record<string, unknown>[], filename = 'ordens.csv'): void {
  const lines = [
    COLS.map(c => c.label).join(';'),
    ...rows.map(r => COLS.map(c => cell(r[c.key])).join(';')),
  ]
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
