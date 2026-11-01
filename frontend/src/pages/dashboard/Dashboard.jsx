import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { dashboardAPI, messagingAPI, guestHouseAPI } from '../../services/api'
import { formatCurrency, formatDateTime, orderTypeLabel } from '../../utils/format'
import StatusBadge from '../../components/ui/StatusBadge'
import Spinner from '../../components/ui/Spinner'
import Pagination from '../../components/ui/Pagination'

function StatCard({ label, value, icon, color = 'brand', sub }) {
  const colors = { brand: 'bg-brand-50 text-brand-600', green: 'bg-green-50 text-green-600', blue: 'bg-blue-50 text-blue-600', purple: 'bg-purple-50 text-purple-600', amber: 'bg-amber-50 text-amber-700' }
  return (
    <div className="stat-card">
      <div className="flex items-center justify-between">
        <span className="text-sm text-surface-500 font-medium">{label}</span>
        <span className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg ${colors[color]}`}>{icon}</span>
      </div>
      <div className="text-2xl font-display font-bold text-surface-900">{value}</div>
      {sub && <div className="text-xs text-surface-400">{sub}</div>}
    </div>
  )
}

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [recentSearch, setRecentSearch] = useState('')
  const perPage = 6
  const navigate = useNavigate()

  const [budget, setBudget] = useState(null)
  const [ghSummary, setGhSummary] = useState(null)

  useEffect(() => {
    dashboardAPI.get().then(r => { setData(r.data.data); setLoading(false) }).catch(() => setLoading(false))
    messagingAPI.budget().then(r => setBudget(r.data.data)).catch(() => {})
    guestHouseAPI.dashboard().then(r => setGhSummary(r.data.data?.summary || null)).catch(() => {})
  }, [])

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>
  if (!data) return <div className="text-surface-400 text-center py-20">Failed to load dashboard.</div>

  const sym = '₹'
  const recentOrders = (data.recent_orders || []).filter(o => {
    const q = recentSearch.trim().toLowerCase()
    if (!q) return true
    return String(o.order_number || '').toLowerCase().includes(q)
      || String(o.table_label || '').toLowerCase().includes(q)
      || String(o.guest_name || '').toLowerCase().includes(q)
      || String(o.status || '').toLowerCase().includes(q)
  })
  const pages = Math.max(1, Math.ceil(recentOrders.length / perPage))
  const pagedRecentOrders = recentOrders.slice((page - 1) * perPage, page * perPage)
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="text-sm text-surface-400 mt-0.5">Today's overview — {new Date().toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button onClick={() => navigate('/tables')} className="btn-primary btn">+ Dine In Order</button>
          <button onClick={() => navigate('/orders/new/guest-house')} className="btn-secondary btn">+ Guest House</button>
        </div>
      </div>

      {/* Operational cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <StatCard label="Running Orders" value={data.running_orders}     icon="⚡" color="amber" />
        <StatCard label="Active Tables"  value={data.active_tables}      icon="⊞" color="blue" />
        <StatCard label="Bills Closed"   value={data.closed_bills_today} icon="✓" color="green" sub="Today" />
        <StatCard label="Total Orders"   value={data.today_orders}       icon="📋" color="brand" sub="Billed today" />
      </div>

      {/* Guest house money cards */}
      {ghSummary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
          <StatCard label="Guest House — Today Income" value={`${sym}${Number(ghSummary.today_income || 0).toFixed(0)}`} icon="🏨" color="green" sub="Collected today" />
          <StatCard label="Guest House — Pending" value={`${sym}${Number(ghSummary.pending_payments || 0).toFixed(0)}`} icon="⏳" color="amber" sub={`${ghSummary.pending_count || 0} stay(s) with balance`} />
          <StatCard label="Today Check-ins" value={ghSummary.today_check_ins ?? 0} icon="🛎" color="blue" />
          <StatCard label="Today Check-outs" value={ghSummary.today_check_outs ?? 0} icon="🚪" color="purple" />
        </div>
      )}

      {/* WhatsApp budget box */}
      {budget && (Number(budget.budget) > 0 || Number(budget.spent) > 0) && (
        <div className={`card p-5 mb-8 border ${budget.over_budget ? 'border-red-300 bg-red-50' : 'border-emerald-200 bg-emerald-50'}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display font-bold text-surface-900 text-lg">WhatsApp Budget — {budget.month}</h2>
              <p className="text-sm text-surface-600">
                Budget: <strong>{sym}{Number(budget.budget).toFixed(0)}</strong> ·
                Spent: <strong className={budget.over_budget ? 'text-red-600' : 'text-emerald-700'}>{sym}{Number(budget.spent).toFixed(2)}</strong>
                {budget.remaining !== null && <> · Remaining: <strong>{sym}{Number(budget.remaining).toFixed(2)}</strong></>}
                {' '}· Sent this month: <strong>{budget.sent_this_month}</strong> messages
              </p>
            </div>
            <div className="text-right">
              <div className={`text-3xl font-display font-bold ${budget.over_budget ? 'text-red-600' : 'text-emerald-700'}`}>
                {budget.usage_percent !== null ? `${budget.usage_percent}%` : '—'}
              </div>
              <div className="text-xs text-surface-400">of monthly budget used</div>
            </div>
          </div>
          {budget.usage_percent !== null && (
            <div className="mt-3 h-2.5 w-full rounded-full bg-white border border-surface-200 overflow-hidden">
              <div
                className={`h-full rounded-full ${budget.over_budget ? 'bg-red-500' : 'bg-emerald-500'}`}
                style={{ width: `${Math.min(100, budget.usage_percent || 0)}%` }}
              />
            </div>
          )}
          {budget.message_stats && (
            <p className="mt-2 text-xs text-surface-500">
              All-time: {budget.message_stats.sent} sent · {budget.message_stats.pending} pending · {budget.message_stats.failed} failed
            </p>
          )}
        </div>
      )}

 

      {/* WhatsApp budget box */}
      {budget && (Number(budget.budget) > 0 || Number(budget.spent) > 0) && (
        <div className={`card p-5 mb-8 border ${budget.over_budget ? 'border-red-300 bg-red-50' : 'border-emerald-200 bg-emerald-50'}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display font-bold text-surface-900 text-lg">WhatsApp Budget — {budget.month}</h2>
              <p className="text-sm text-surface-600">
                Budget: <strong>{sym}{Number(budget.budget).toFixed(0)}</strong> ·
                Spent: <strong className={budget.over_budget ? 'text-red-600' : 'text-emerald-700'}>{sym}{Number(budget.spent).toFixed(2)}</strong>
                {budget.remaining !== null && <> · Remaining: <strong>{sym}{Number(budget.remaining).toFixed(2)}</strong></>}
                {' '}· Sent this month: <strong>{budget.sent_this_month}</strong> messages
              </p>
            </div>
            <div className="text-right">
              <div className={`text-3xl font-display font-bold ${budget.over_budget ? 'text-red-600' : 'text-emerald-700'}`}>
                {budget.usage_percent !== null ? `${budget.usage_percent}%` : '—'}
              </div>
              <div className="text-xs text-surface-400">of monthly budget used</div>
            </div>
          </div>
          {budget.usage_percent !== null && (
            <div className="mt-3 h-2.5 w-full rounded-full bg-white border border-surface-200 overflow-hidden">
              <div
                className={`h-full rounded-full ${budget.over_budget ? 'bg-red-500' : 'bg-emerald-500'}`}
                style={{ width: `${Math.min(100, budget.usage_percent || 0)}%` }}
              />
            </div>
          )}
          {budget.message_stats && (
            <p className="mt-2 text-xs text-surface-500">
              All-time: {budget.message_stats.sent} sent · {budget.message_stats.pending} pending · {budget.message_stats.failed} failed
            </p>
          )}
        </div>
      )}

      {/* Recent orders */}
      <div className="card">
        <div className="px-5 py-4 border-b border-surface-100 flex items-center justify-between">
          <h2 className="font-display font-bold text-surface-900 text-lg">Recent Orders</h2>
          <div className="flex items-center gap-2">
            <input
              className="input w-56"
              placeholder="Search recent orders..."
              value={recentSearch}
              onChange={e => { setRecentSearch(e.target.value); setPage(1) }}
            />
            <button onClick={() => navigate('/orders')} className="btn-ghost btn btn-sm text-brand-500">View all →</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="table-auto">
            <thead><tr>
              <th className="th">Order #</th><th className="th">Type</th><th className="th">Table / Guest</th>
              <th className="th">Status</th><th className="th">Amount</th><th className="th">Time</th>
            </tr></thead>
            <tbody>
              {recentOrders.length === 0
                ? <tr><td colSpan={6} className="td text-center text-surface-400 py-8">No recent orders</td></tr>
                : pagedRecentOrders.map(o => (
                  <tr key={o.id} className="hover:bg-surface-50 cursor-pointer" onClick={() => navigate(`/orders/${o.id}`)}>
                    <td className="td font-mono text-xs font-medium text-brand-600">{o.order_number}</td>
                    <td className="td"><StatusBadge status={o.order_type} /></td>
                    <td className="td text-surface-600">{o.table_label || o.guest_name || '—'}</td>
                    <td className="td"><StatusBadge status={o.status} /></td>
                    <td className="td font-medium">{formatCurrency(o.grand_total, sym)}</td>
                    <td className="td text-surface-400 text-xs">{formatDateTime(o.created_at)}</td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>
      <Pagination page={page} pages={pages} onPage={setPage} />
    </div>
  )
}
