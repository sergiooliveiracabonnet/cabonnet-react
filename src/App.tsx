import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { LoginPage } from './features/auth/LoginPage'
import { RequireModulo, RequireGestor } from './components/auth/RequireAcesso'
import { useAuthStore } from './store/authStore'
import { api } from './lib/api'
import {
  ERPRelatoriosPage,
  ERPAlertasPage,
  ERPQualidadePage, ERPPlannerPage, ERPFilaPage, ERPRankingTecnicosPage, ERPBiGestaoTecnicaPage,
  DashboardPage, OrdensPage,
  GraficosPage, CidadesGerencialPage,
  FornecedorPage, JuniperPage, NotFoundPage, NocPage, FechamentoPage,
  MapaPage, UsuariosPage,
} from './pages/index'

export default function App() {
  const { status, setAuthed, setUnauthed } = useAuthStore()

  useEffect(() => {
    // Verifica sessão com o servidor sempre — mas só mostra spinner se ainda não
    // temos estado do sessionStorage (aba nova). Em aba duplicada, 'status' já
    // é 'authed' e a verificação acontece em background sem bloquear a UI.
    api.auth.check()
      .then((res) => {
        const { ok, role, modulos } = res
        ok ? setAuthed((role ?? 'viewer') as 'gestor' | 'operador' | 'viewer', modulos ?? []) : setUnauthed()
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
          <Route path="relatorios"    element={<RequireModulo modulo="erp_relatorios">   <ERPRelatoriosPage />   </RequireModulo>} />
          <Route path="alertas"       element={<RequireModulo modulo="erp_alertas">      <ERPAlertasPage />      </RequireModulo>} />
          <Route path="produtividade" element={<Navigate to="/erp/planner" replace />} />
          <Route path="qualidade"     element={<RequireModulo modulo="erp_qualidade">    <ERPQualidadePage />    </RequireModulo>} />
          <Route path="bi-gestao-tecnica" element={<RequireModulo modulo="erp_bi_tecnica"><ERPBiGestaoTecnicaPage /></RequireModulo>} />
          <Route path="planner"       element={<RequireModulo modulo="erp_planner">      <ERPPlannerPage />      </RequireModulo>} />
          <Route path="fila"          element={<RequireModulo modulo="erp_fila">         <ERPFilaPage />         </RequireModulo>} />
          {/* /erp/vt virou a fila unica em /erp/fila */}
          <Route path="vt"            element={<Navigate to="/erp/fila" replace />} />
          <Route path="ranking"       element={<RequireModulo modulo="erp_ranking">      <ERPRankingTecnicosPage /></RequireModulo>} />
          {/* /erp/acao removido — agregava dado que já existe em /erp/alertas e no Dashboard */}
          <Route path="acao"          element={<Navigate to="/" replace />} />
          <Route path="usuarios"      element={<RequireGestor>                           <UsuariosPage />        </RequireGestor>} />
        </Route>

        <Route index             element={<RequireModulo modulo="dashboard"> <DashboardPage />          </RequireModulo>} />
        <Route path="ordens"     element={<RequireModulo modulo="ordens">    <OrdensPage />              </RequireModulo>} />
        <Route path="graficos"   element={<RequireModulo modulo="graficos">  <GraficosPage />            </RequireModulo>} />
        <Route path="cidades"    element={<RequireModulo modulo="cidades">   <CidadesGerencialPage />    </RequireModulo>} />
        <Route path="fornecedor" element={<RequireModulo modulo="fornecedor"><FornecedorPage />          </RequireModulo>} />
        <Route path="juniper"    element={<RequireModulo modulo="juniper">   <JuniperPage />              </RequireModulo>} />
        <Route path="fechamento" element={<RequireModulo modulo="fechamento"><FechamentoPage />          </RequireModulo>} />
        <Route path="mapa"       element={<RequireModulo modulo="mapa">      <MapaPage />                </RequireModulo>} />
        {/* /gerencial virou a aba "Por Categoria" dentro de /cidades */}
        <Route path="gerencial" element={<Navigate to="/cidades" replace />} />
        <Route path="*"          element={<NotFoundPage />}   />
      </Route>
      <Route path="noc" element={<RequireModulo modulo="noc"><NocPage /></RequireModulo>} />
    </Routes>
  )
}
