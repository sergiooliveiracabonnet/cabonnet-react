import { useState } from 'react'
import { MapPin, Briefcase } from 'lucide-react'
import { TabBar } from '../../components/ui/TabBar'
import CidadesPage from './CidadesPage'
import GerencialPage from '../gerencial/GerencialPage'

// Cidades e Gerencial eram duas páginas separadas com o mesmo propósito de fundo —
// "detalhar a fila atual de OS por uma dimensão" — só que uma agrupava por status
// (Em Atendimento/Pendente/Concluída/...) e a outra por categoria de serviço
// (Instalação/VT-Manutenção/Serviço). Consolidadas aqui como abas de uma página só,
// para deixar explícito que são duas lentes sobre os mesmos dados, não duas ferramentas.

const TABS = [
  { id: 'status',    label: 'Por Status',    icon: MapPin    },
  { id: 'categoria', label: 'Por Categoria', icon: Briefcase },
]

export default function CidadesGerencialPage() {
  const [tab, setTab] = useState('status')

  return (
    <div className="space-y-4 animate-fade-in">
      <TabBar tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'status'    && <CidadesPage />}
      {tab === 'categoria' && <GerencialPage />}
    </div>
  )
}
