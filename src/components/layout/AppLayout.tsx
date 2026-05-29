import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Navbar } from './Navbar'
import { DateFilterBar } from '../ui/DateFilterBar'
import { useUIStore } from '../../store/uiStore'
import { OSDataProvider } from '../../contexts/OSDataContext'
import { useFilterURL } from '../../hooks/useFilterURL'

function FilterURLSync() {
  useFilterURL()
  return null
}

export function AppLayout() {
  const { sidebarOpen } = useUIStore()

  return (
    <OSDataProvider>
      <FilterURLSync />
      <div className="min-h-screen bg-bg text-text">
        <Sidebar />
        <Navbar />
        <DateFilterBar sidebarOpen={sidebarOpen} />

        {/* pt-14 (navbar) + pt-10 (date filter bar) = pt-24 */}
        <main className={`pt-24 transition-all duration-200
                          ${sidebarOpen ? 'pl-[224px]' : 'pl-[52px]'}`}>
          <div className="p-6 animate-page-enter">
            <Outlet />
          </div>
        </main>
      </div>
    </OSDataProvider>
  )
}
