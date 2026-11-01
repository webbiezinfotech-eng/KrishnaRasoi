import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { messagingAPI } from '../../services/api'
import Spinner from '../../components/ui/Spinner'
import Pagination from '../../components/ui/Pagination'
import StatusBadge from '../../components/ui/StatusBadge'
import EmptyState from '../../components/ui/EmptyState'
import { formatDateTime } from '../../utils/format'
import toast from 'react-hot-toast'

export default function CampaignDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [campaign, setCampaign] = useState(null)
  const [rows, setRows] = useState([])
  const [pagination, setPagination] = useState({ page: 1, pages: 1 })
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)

  const load = (p = 1) => {
    setLoading(true)
    Promise.all([
      messagingAPI.showCampaign(id),
      messagingAPI.recipients(id, { page: p, limit: 50 }),
    ]).then(([c, r]) => {
      setCampaign(c.data.data)
      setRows(r.data.data.recipients || [])
      setPagination(r.data.data.pagination || { page: 1, pages: 1 })
    }).catch(e => {
      toast.error(e.response?.data?.message || 'Failed to load campaign.')
      navigate('/customers/campaigns')
    }).finally(() => setLoading(false))
  }

  useEffect(() => { load(1) }, [id])

  if (loading && !campaign) {
    return <div className="flex justify-center py-20"><Spinner size="lg" /></div>
  }
  if (!campaign) return <EmptyState title="Campaign not found" />

  return (
    <div>
      <div className="page-header">
        <div>
          <button className="text-sm text-surface-500 hover:text-surface-800 mb-1" onClick={() => navigate('/customers/campaigns')}>← Messages</button>
          <h1 className="page-title">{campaign.name}</h1>
          <p className="page-sub">{formatDateTime(campaign.created_at)}</p>
        </div>
      </div>

      {campaign.mode === 'mock' && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>DEVELOPMENT / MOCK MODE</strong>
          <span className="ml-1">— this campaign was queued for testing and was not sent.</span>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <div className="stat-card"><p className="text-xs text-surface-500">Channel</p><p className="font-semibold mt-1 capitalize">{campaign.channel}</p></div>
        <div className="stat-card"><p className="text-xs text-surface-500">Recipients</p><p className="font-semibold mt-1">{campaign.total_recipients}</p></div>
        <div className="stat-card"><p className="text-xs text-surface-500">Queued</p><p className="font-semibold mt-1">{campaign.queued_count}</p></div>
        <div className="stat-card"><p className="text-xs text-surface-500">Sent</p><p className="font-semibold mt-1">{campaign.sent_count}</p></div>
        <div className="stat-card col-span-2 lg:col-span-1"><p className="text-xs text-surface-500">Status</p><p className="mt-1"><StatusBadge status={campaign.status} /></p></div>
      </div>

      {campaign.message_body && (
        <div className="card p-4 mb-5">
          <p className="text-xs font-semibold text-surface-500 uppercase tracking-wide mb-2">Message</p>
          <pre className="whitespace-pre-wrap text-sm text-surface-800 font-sans">{campaign.message_body}</pre>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table-auto">
            <thead>
              <tr>
                <th className="th">Name</th>
                <th className="th">Mobile</th>
                <th className="th">Status</th>
                <th className="th">Note</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id}>
                  <td className="td">{row.recipient_name || '—'}</td>
                  <td className="td font-mono text-sm">{row.recipient_mobile}</td>
                  <td className="td"><StatusBadge status={row.status} /></td>
                  <td className="td text-xs text-surface-600 max-w-xs whitespace-normal">
                    {campaign.mode === 'mock' && row.status === 'queued' ? 'Queued for development testing' : (row.error_message || '—')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <Pagination page={pagination.page || page} pages={pagination.pages || 1} onPage={p => { setPage(p); load(p) }} />
    </div>
  )
}
