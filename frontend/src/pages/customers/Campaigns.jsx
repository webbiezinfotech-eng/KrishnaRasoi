import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { messagingAPI } from '../../services/api'
import EmptyState from '../../components/ui/EmptyState'
import Spinner from '../../components/ui/Spinner'
import Pagination from '../../components/ui/Pagination'
import StatusBadge from '../../components/ui/StatusBadge'
import { formatDateTime } from '../../utils/format'
import toast from 'react-hot-toast'

export default function Campaigns() {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [pagination, setPagination] = useState({ page: 1, pages: 1 })
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [config, setConfig] = useState(null)
  const [health, setHealth] = useState(null)
  const [logs, setLogs] = useState([])

  const load = (p = 1) => {
    setLoading(true)
    messagingAPI.listCampaigns({ page: p, limit: 20 }).then(r => {
      setRows(r.data.data.campaigns || [])
      setPagination(r.data.data.pagination || { page: 1, pages: 1 })
    }).catch(e => toast.error(e.response?.data?.message || 'Failed to load messages.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load(1) }, [])
  useEffect(() => {
    messagingAPI.config().then(r => {
      const cfg = r.data.data
      setConfig(cfg)
      if ((cfg?.mode || 'mock') === 'live') {
        messagingAPI.whatsappHealth().then(h => setHealth(h.data.data)).catch(() => {})
      }
    }).catch(() => {})
  }, [])

  const isMock = (config?.mode || 'mock') === 'mock'

  useEffect(() => {
    messagingAPI.logs({ page: 1, limit: 20 }).then(r => setLogs(r.data.data.logs || [])).catch(() => {})
  }, [])

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Messages</h1>
          <p className="page-sub">Campaign history and delivery status.</p>
        </div>
        <button className="btn-primary btn" onClick={() => navigate('/customers')}>New Message</button>
      </div>

      {isMock && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>DEVELOPMENT / MOCK MODE</strong>
          <span className="ml-1">— queued campaigns were not sent to a real provider.</span>
        </div>
      )}
      {health && !isMock && (
        <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${health.reachable ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-300 bg-red-50 text-red-800'}`}>
          <strong>{health.reachable ? 'Zaptilo reachable' : 'Zaptilo not reachable'}</strong>
          <span className="ml-1">
            {health.reachable
              ? (health.authenticated ? '— API accepted the token.' : `— HTTP ${health.http_code}. Check token/credits.`)
              : `— ${health.error || 'Hostinger could not connect to web.zaptilo.ai.'}`}
          </span>
        </div>
      )}

      {loading ? <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      : rows.length === 0
        ? <EmptyState icon="✉" title="No messages yet" message="Select customers and write a message to create a campaign." action={<button className="btn-primary btn" onClick={() => navigate('/customers')}>Open Customers</button>} />
        : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="table-auto">
                <thead>
                  <tr>
                    <th className="th">Campaign</th>
                    <th className="th">Date</th>
                    <th className="th">Channel</th>
                    <th className="th">Recipients</th>
                    <th className="th">Sent</th>
                    <th className="th">Failed</th>
                    <th className="th">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={row.id} className="cursor-pointer" onClick={() => navigate(`/customers/campaigns/${row.id}`)}>
                      <td className="td font-medium">
                        {row.name}
                        {row.mode === 'mock' && <span className="ml-2 badge-amber">Mock</span>}
                      </td>
                      <td className="td text-sm text-surface-500">{formatDateTime(row.created_at)}</td>
                      <td className="td"><StatusBadge status={row.channel} /></td>
                      <td className="td">{row.total_recipients}</td>
                      <td className="td">{row.sent_count}</td>
                      <td className="td">{row.failed_count}</td>
                      <td className="td"><StatusBadge status={row.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      }
      <Pagination page={pagination.page || page} pages={pagination.pages || 1} onPage={p => { setPage(p); load(p) }} />

      {logs.length > 0 && (
        <div className="mt-8">
          <h2 className="font-display text-lg font-bold text-surface-900 mb-3">Message logs</h2>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="table-auto">
                <thead>
                  <tr>
                    <th className="th">Date</th>
                    <th className="th">Channel</th>
                    <th className="th">Contact</th>
                    <th className="th">Status</th>
                    <th className="th hidden md:table-cell">Provider</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(row => (
                    <tr key={row.id}>
                      <td className="td text-sm text-surface-500">{formatDateTime(row.created_at)}</td>
                      <td className="td capitalize">{row.channel}</td>
                      <td className="td">{row.contact_name || row.mobile_number || 'Test number'}</td>
                      <td className="td"><StatusBadge status={String(row.status || '').toLowerCase()} /></td>
                      <td className="td hidden md:table-cell text-sm text-surface-500">{row.provider || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
