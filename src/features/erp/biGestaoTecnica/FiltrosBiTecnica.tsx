import { FilterSelect } from '../../../components/ui/FilterSelect'
import { shortEquipe } from '../../../lib/osFormat'
import { opcoesCidade, opcoesFornecedor, opcoesEquipe, type BiTecnicaFiltros } from '../../../lib/builders/biTecnicaFiltros'
import type { BacklogRow } from '../../../hooks/useBacklog'

interface FiltrosBiTecnicaProps {
  rows:     BacklogRow[]
  filtros:  BiTecnicaFiltros
  onChange: (filtros: BiTecnicaFiltros) => void
}

export function FiltrosBiTecnica({ rows, filtros, onChange }: FiltrosBiTecnicaProps) {
  const cidades      = opcoesCidade(rows)
  const fornecedores = opcoesFornecedor(rows)
  const equipes      = opcoesEquipe(rows)

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <FilterSelect
        value={filtros.cidade}
        onChange={v => onChange({ ...filtros, cidade: v })}
        options={cidades.map(c => ({ value: c, label: c }))}
        placeholder="Todas as cidades"
        className="w-40"
      />
      <FilterSelect
        value={filtros.fornecedor}
        onChange={v => onChange({ ...filtros, fornecedor: v })}
        options={fornecedores.map(f => ({ value: f, label: f }))}
        placeholder="Todos os fornecedores"
        className="w-44"
      />
      <FilterSelect
        value={filtros.equipe}
        onChange={v => onChange({ ...filtros, equipe: v })}
        options={equipes.map(e => ({ value: e, label: shortEquipe(e) }))}
        placeholder="Todas as equipes"
        className="w-48"
      />
    </div>
  )
}
