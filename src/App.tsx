import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { LoginPage } from './features/auth/LoginPage'
import { useAuthStore } from './store/authStore'
import { api } from './lib/api'
import {
  ERPRelatoriosPage,
  ERPAlertasPage,
  ERPProdutividadePage, ERPQualidadePage, ERPPlannerPage, ERPJustificativaPage,
  DashboardPage, OrdensPage, CapacidadePage,
  GraficosPage, CidadesPage, CampoPage,
  FornecedorPage, JuniperPage, NotFoundPage, NocPage, FechamentoPage,
  MapaPage, GerencialPage,
} from './pages/index'

export default function App() {
  const { status, setAuthed, setUnauthed } = useAuthStore()

  useEffect(() => {
    // Verifica sessão com o servidor sempre — mas só mostra spinner se ainda não
    // temos estado do sessionStorage (aba nova). Em aba duplicada, 'status' já
    // é 'authed' e a verificação acontece em background sem bloquear a UI.
    api.auth.check()
      .then((res) => {
        const { ok, role } = res as { ok: boolean; role?: string }
        ok ? setAuthed((role ?? 'viewer') as 'gestor' | 'operador' | 'viewer') : setUnauthed()
      })
      .catch(() => {
        // Erro de rede: só desloga se ainda estava em 'checking'
        // (aba nova sem sessionStorage). Aba duplicada mantém conteúdo visível.
        if (status === 'checking') setUnauthed()
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handle = () => setUnauthed()
    window.addEventListener('auth:unauthorized', handle)
    return () => window.removeEventListener('auth:unauthorized', handle)
  }, [setUnauthed])

  if (status === 'checking') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (status === 'unauthed') {
    return <LoginPage />
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        {/* ── ERP ── */}
        <Route path="erp">
          <Route path="relatorios"    element={<ERPRelatoriosPage />}   />
          <Route path="alertas"       element={<ERPAlertasPage />}      />
          <Route path="produtividade" element={<ERPProdutividadePage />}/>
          <Route path="qualidade"      element={<ERPQualidadePage />}       />
          <Route path="justificativa" element={<ERPJustificativaPage />}  />
          <Route path="planner"       element={<ERPPlannerPage />}         />
        </Route>

        <Route index             element={<DashboardPage />}  />
        <Route path="ordens"     element={<OrdensPage />}     />
        <Route path="capacidade" element={<CapacidadePage />} />
        <Route path="graficos"   element={<GraficosPage />}   />
        <Route path="cidades"    element={<CidadesPage />}    />
        <Route path="campo"      element={<CampoPage />}      />
        <Route path="fornecedor" element={<FornecedorPage />} />
        <Route path="juniper"    element={<JuniperPage />}    />
        <Route path="fechamento" element={<FechamentoPage />} />
        <Route path="mapa"       element={<MapaPage />}     />
        <Route path="gerencial" element={<GerencialPage />} />
        <Route path="*"          element={<NotFoundPage />}   />
      </Route>
      <Route path="noc" element={<NocPage />} />
    </Routes>
  )
}
