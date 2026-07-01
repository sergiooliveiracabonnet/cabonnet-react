import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { LoginPage } from './features/auth/LoginPage'
import { useAuthStore } from './store/authStore'
import { api } from './lib/api'
import {
  ERPRelatoriosPage,
  ERPAlertasPage,
  ERPProdutividadePage, ERPQualidadePage, ERPPlannerPage, ERPFilaPage, ERPRankingTecnicosPage, ERPCentralAcaoPage,
  DashboardPage, OrdensPage,
  GraficosPage, CidadesGerencialPage,
  FornecedorPage, JuniperPage, NotFoundPage, NocPage, FechamentoPage,
  MapaPage,
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
          <Route path="planner"       element={<ERPPlannerPage />}         />
          <Route path="fila"         element={<ERPFilaPage />}        />
          {/* /erp/vt virou a fila unica em /erp/fila */}
          <Route path="vt"           element={<Navigate to="/erp/fila" replace />} />
          <Route path="ranking"      element={<ERPRankingTecnicosPage />} />
          <Route path="acao"         element={<ERPCentralAcaoPage />} />
        </Route>

        <Route index             element={<DashboardPage />}  />
        <Route path="ordens"     element={<OrdensPage />}     />
        <Route path="graficos"   element={<GraficosPage />}   />
        <Route path="cidades"    element={<CidadesGerencialPage />} />
        <Route path="fornecedor" element={<FornecedorPage />} />
        <Route path="juniper"    element={<JuniperPage />}    />
        <Route path="fechamento" element={<FechamentoPage />} />
        <Route path="mapa"       element={<MapaPage />}     />
        {/* /gerencial virou a aba "Por Categoria" dentro de /cidades */}
        <Route path="gerencial" element={<Navigate to="/cidades" replace />} />
        <Route path="*"          element={<NotFoundPage />}   />
      </Route>
      <Route path="noc" element={<NocPage />} />
    </Routes>
  )
}
