import { Link } from 'react-router-dom'
import { LayoutDashboard } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5 text-center px-4">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
        <span className="font-mono font-black text-2xl text-primary/60">404</span>
      </div>
      <div className="space-y-1.5">
        <p className="text-[15px] font-semibold text-text">Página não encontrada</p>
        <p className="text-[13px] text-muted max-w-xs">Esta rota não existe no sistema Cabonnet.</p>
      </div>
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 h-9 px-4 text-[13px] font-semibold rounded-md
                   border border-primary/40 text-primary hover:bg-primary/10 hover:border-primary/70
                   transition-colors duration-150"
      >
        <LayoutDashboard size={13} /> Ir para o Resumo
      </Link>
    </div>
  )
}
