import { useState, useMemo } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import InstallPwaBanner from '../pwa/InstallPwaBanner'
import CopyrightFooter from './CopyrightFooter'
import toast from 'react-hot-toast'

/**
 * Sidebar sirf wahi modules dikhata hai jinki permission admin ne us staff user ko di hai.
 * `perm` kis permission se ye item visible hai. `adminOnly` = sirf admin.
 */
const ADMIN_NAV = [
  { to: '/dashboard', perm: 'reports',   icon: '▦', label: 'Dashboard' },
  { to: '/tables',    perm: 'tables',    icon: '⊞', label: 'Tables' },
  { to: '/orders',    perm: 'orders',    icon: '📋', label: 'Running Orders' },
  { to: '/bills',     perm: 'billing',   icon: '🧾', label: 'Bills' },
  { group: 'Menu', perm: 'menu', items: [
    { to: '/menu/categories', icon: '⊟', label: 'Categories' },
    { to: '/menu/items',      icon: '≡', label: 'Menu Items' },
  ]},
  { to: '/reports',        perm: 'reports',     icon: '📊', label: 'Reports' },
  { to: '/guest-house',    perm: 'guest_house', icon: '🏨', label: 'Kripa Shanti' },
  { to: '/gh-reports',     perm: 'guest_house', icon: '📈', label: 'Kripa Shanti Reports' },
  { to: '/customers',      perm: 'messaging',   icon: '💬', label: 'Customers & WhatsApp' },
  { to: '/settings',       perm: 'settings',    icon: '⚙', label: 'Settings', adminOnly: true },
  { to: '/backup',         perm: 'settings',    icon: '💾', label: 'Backup & Restore', adminOnly: true },
]

export default function AppLayout() {
  const { admin, logout, isWaiter, role, can, permissions } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const nav = useMemo(() => {
    return ADMIN_NAV
      .map(item => {
        if (item.group) {
          const items = item.items.filter(sub => can(item.perm))
          return items.length ? { ...item, items } : null
        }
        if (item.adminOnly && role !== 'admin') return null
        return can(item.perm) ? item : null
      })
      .filter(Boolean)
  }, [can, role, permissions])

  const roleLabel = role === 'admin' ? 'Administrator'
    : role === 'manager' ? 'Manager'
    : role === 'reception' ? 'Reception'
    : 'Waiter'
  const brandTitle = role === 'admin' ? 'Manager' : 'Manager'

  const handleLogout = async () => {
    await logout()
    toast.success('Logged out.')
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-surface-50 overflow-hidden">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`no-print fixed z-40 inset-y-0 left-0 w-72 max-w-[85vw] flex-shrink-0 bg-white border-r border-surface-200 flex flex-col transform transition-transform duration-200 lg:static lg:w-64 lg:max-w-none ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="px-5 py-5 border-b border-surface-200">
          <h1 className="font-display text-surface-900 text-xl font-bold leading-tight">Restaurant<br/><span className="text-brand-600">{brandTitle}</span></h1>
          {role !== 'admin' && (
            <p className="text-xs text-surface-500 mt-1">{roleLabel} login · {permissions.length} modules</p>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {nav.length === 0 && (
            <p className="px-3 py-4 text-xs text-surface-500">
              Abhi koi module assign nahi hua. Admin se permission lein.
            </p>
          )}
          {nav.map((item, i) =>
            item.group ? (
              <div key={i} className="pt-3 pb-1">
                <p className="px-3 text-xs font-semibold text-surface-500 uppercase tracking-widest mb-1">{item.group}</p>
                {item.items.map(sub => (
                  <NavLink key={sub.to} to={sub.to} end={!!sub.end} onClick={() => setSidebarOpen(false)} className={({ isActive }) => 'sidebar-link' + (isActive ? ' active' : '')}>
                    <span className="text-base w-5 text-center">{sub.icon}</span>{sub.label}
                  </NavLink>
                ))}
              </div>
            ) : (
              <NavLink key={item.to} to={item.to} onClick={() => setSidebarOpen(false)} className={({ isActive }) => 'sidebar-link' + (isActive ? ' active' : '')}>
                <span className="text-base w-5 text-center">{item.icon}</span>{item.label}
              </NavLink>
            )
          )}
        </nav>

        <div className="px-4 py-4 border-t border-surface-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center text-white text-sm font-bold">
              {admin?.full_name?.[0] || 'A'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-surface-900 text-sm font-medium truncate">{admin?.full_name}</p>
              <p className="text-surface-500 text-xs">{roleLabel}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="w-full text-left text-surface-500 hover:text-surface-900 text-xs py-1.5 px-2 rounded hover:bg-surface-100 transition-colors">
            → Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <header className="no-print lg:hidden h-14 border-b border-surface-200 bg-white flex items-center justify-between px-4">
          <button className="btn-secondary btn btn-sm" onClick={() => setSidebarOpen(true)}>☰ Menu</button>
          <p className="font-display text-surface-900 font-semibold">Restaurant Manager</p>
        </header>
        <main className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6">
          <Outlet />
        </main>
        <CopyrightFooter className="border-t border-surface-200 bg-white px-3 py-2.5 sm:px-4" />
      </div>
      {role === 'admin' && <InstallPwaBanner />}
    </div>
  )
}
