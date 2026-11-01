import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth, homePathForRole } from './context/AuthContext'
import AppLayout from './components/layout/AppLayout'
import Login from './pages/auth/Login'
import Dashboard from './pages/dashboard/Dashboard'
import Tables from './pages/tables/Tables'
import OrderPage from './pages/orders/OrderPage'
import RunningOrders from './pages/orders/RunningOrders'
import Bills from './pages/billing/Bills'
import BillDetail from './pages/billing/BillDetail'
import Categories from './pages/menu/Categories'
import MenuItems from './pages/menu/MenuItems'
import Reports from './pages/reports/Reports'
import GuestHouseReports from './pages/reports/GuestHouseReports'
import Settings from './pages/settings/Settings'
import Backup from './pages/settings/Backup'
import PrintTest from './pages/settings/PrintTest'
import PrintBillPage from './pages/print/PrintBillPage'
import PrintKOTPage from './pages/print/PrintKOTPage'
import PrintTestPage from './pages/print/PrintTestPage'
import GuestHouse from './pages/guesthouse/GuestHouse'
import Customers from './pages/customers/Customers'
import Campaigns from './pages/customers/Campaigns'
import CampaignDetail from './pages/customers/CampaignDetail'

function PrivateRoute({ children }) {
  const { isAuthenticated, loading } = useAuth()
  if (loading) return <div className="h-screen flex items-center justify-center text-surface-400 text-sm">Loading...</div>
  return isAuthenticated ? children : <Navigate to="/login" replace />
}

/** Permission-gated route — server bhi wahi permission check karta hai. */
function PermRoute({ perm, children }) {
  const { isAuthenticated, loading, role, can } = useAuth()
  if (loading) return <div className="h-screen flex items-center justify-center text-surface-400 text-sm">Loading...</div>
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (role !== 'admin' && !can(perm)) {
    return (
      <div className="max-w-lg mx-auto mt-16 card p-8 text-center">
        <p className="text-4xl mb-3">🔒</p>
        <h2 className="font-display text-lg font-bold text-surface-900 mb-1">Access nahi hai</h2>
        <p className="text-sm text-surface-500">
          Is module ki permission aapke login me nahi hai. Admin Settings → Staff Users me se
          permission de sakta hai.
        </p>
      </div>
    )
  }
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/print/kot/:orderId" element={<PrivateRoute><PrintKOTPage /></PrivateRoute>} />
        <Route path="/print/bill/:billNumber" element={<PermRoute perm="billing"><PrintBillPage /></PermRoute>} />
        <Route path="/print/test/bill" element={<PermRoute perm="settings"><PrintTestPage type="bill" /></PermRoute>} />
        <Route path="/print/test/kot" element={<PermRoute perm="settings"><PrintTestPage type="kot" /></PermRoute>} />
        <Route path="/" element={<PrivateRoute><AppLayout /></PrivateRoute>}>
          <Route index element={<RoleHomeRedirect />} />
          <Route path="tables" element={<PermRoute perm="tables"><Tables /></PermRoute>} />
          <Route path="orders/:id" element={<PermRoute perm="orders"><OrderPage /></PermRoute>} />
          <Route path="orders/new/:type" element={<PermRoute perm="orders"><OrderPage /></PermRoute>} />
          <Route path="dashboard" element={<PermRoute perm="reports"><Dashboard /></PermRoute>} />
          <Route path="orders" element={<PermRoute perm="orders"><RunningOrders /></PermRoute>} />
          <Route path="bills" element={<PermRoute perm="billing"><Bills /></PermRoute>} />
          <Route path="bills/:billNumber" element={<PermRoute perm="billing"><BillDetail /></PermRoute>} />
          <Route path="menu/categories" element={<PermRoute perm="menu"><Categories /></PermRoute>} />
          <Route path="menu/items" element={<PermRoute perm="menu"><MenuItems /></PermRoute>} />
          <Route path="reports" element={<PermRoute perm="reports"><Reports /></PermRoute>} />
          <Route path="gh-reports" element={<PermRoute perm="guest_house"><GuestHouseReports /></PermRoute>} />
          <Route path="guest-house" element={<PermRoute perm="guest_house"><GuestHouse /></PermRoute>} />
          <Route path="customers" element={<PermRoute perm="messaging"><Customers /></PermRoute>} />
          <Route path="customers/campaigns" element={<PermRoute perm="messaging"><Campaigns /></PermRoute>} />
          <Route path="customers/campaigns/:id" element={<PermRoute perm="messaging"><CampaignDetail /></PermRoute>} />
          <Route path="settings" element={<PermRoute perm="settings"><Settings /></PermRoute>} />
          <Route path="backup" element={<PermRoute perm="settings"><Backup /></PermRoute>} />
          <Route path="settings/print-test" element={<PermRoute perm="settings"><PrintTest /></PermRoute>} />
        </Route>
        <Route path="*" element={<CatchAllRedirect />} />
      </Routes>
    </AuthProvider>
  )
}

function RoleHomeRedirect() {
  const { role, permissions } = useAuth()
  return <Navigate to={homePathForRole(role, permissions)} replace />
}

function CatchAllRedirect() {
  const { isAuthenticated, role, permissions } = useAuth()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <Navigate to={homePathForRole(role, permissions)} replace />
}
