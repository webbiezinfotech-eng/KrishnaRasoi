import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { orderAPI, billingAPI } from '../../services/api'
import StatusBadge from '../../components/ui/StatusBadge'
import { formatCurrency, formatDateTime } from '../../utils/format'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import Pagination from '../../components/ui/Pagination'
import toast from 'react-hot-toast'

export default function RunningOrders() {
  const [orders, setOrders]   = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [payModalOpen, setPayModalOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [settleMode, setSettleMode] = useState('cash')
  const [actionLoadingId, setActionLoadingId] = useState(null)
  const perPage = 10
  const navigate = useNavigate()

  const load = () => {
    orderAPI.list({ status: 'running' }).then(r => { setOrders(r.data.data.orders); setLoading(false) }).catch(() => setLoading(false))
  }
  useEffect(() => { load(); const iv = setInterval(load, 20000); return () => clearInterval(iv) }, [])

  const filteredOrders = orders.filter(o => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return String(o.order_number || '').toLowerCase().includes(q)
      || String(o.table_label || '').toLowerCase().includes(q)
      || String(o.guest_name || '').toLowerCase().includes(q)
      || String(o.order_type || '').toLowerCase().includes(q)
      || String(o.bill?.bill_number || '').toLowerCase().includes(q)
  })
  useEffect(() => { setPage(1) }, [filteredOrders.length, search])
  const pages = Math.max(1, Math.ceil(filteredOrders.length / perPage))
  const pagedOrders = filteredOrders.slice((page - 1) * perPage, page * perPage)

  const openMarkPaid = (order, e) => {
    e?.stopPropagation?.()
    setSelectedOrder(order)
    setSettleMode('cash')
    setPayModalOpen(true)
  }

  const handleMarkPaid = async () => {
    if (!selectedOrder?.bill?.bill_number) return
    setActionLoadingId(selectedOrder.id)
    try {
      await billingAPI.updatePaymentStatus(selectedOrder.bill.bill_number, {
        payment_status: 'paid',
        payment_mode: settleMode,
      })
      toast.success('Bill marked as paid.')
      setPayModalOpen(false)
      setSelectedOrder(null)
      load()
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to update payment.')
    } finally {
      setActionLoadingId(null)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Running Orders</h1>
          <p className="text-sm text-surface-400">
            {orders.length} due for payment — guest house jinka bill credit par hai. Paid bills <button type="button" onClick={() => navigate('/bills')} className="text-brand-600 hover:underline">Bills</button> mein dekho.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button onClick={() => navigate('/tables')} className="btn-primary btn">+ Dine In</button>
          <button onClick={() => navigate('/orders/new/guest-house')} className="btn-secondary btn">+ Guest House</button>
          <button onClick={load} className="btn-ghost btn">↻</button>
        </div>
      </div>
      <div className="mb-4">
        <input
          className="input w-full sm:w-80"
          placeholder="Search order #, table, guest..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {loading ? <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      : orders.length === 0
        ? <EmptyState icon="📋" title="No due payments" message="Sab clear! Guest house ka bill credit par nahi hai. Paid bills Bills section mein hain." />
        : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
            <table className="table-auto">
              <thead><tr>
                <th className="th">Order #</th><th className="th">Type</th><th className="th">Table / Guest</th>
                <th className="th">Items</th><th className="th">Total</th><th className="th">Bill / Payment</th><th className="th">Started</th><th className="th">Action</th>
              </tr></thead>
              <tbody>
                {pagedOrders.map(o => (
                  <tr key={o.id} className="hover:bg-surface-50">
                    <td className="td font-mono text-xs font-medium text-brand-600">{o.order_number}</td>
                    <td className="td"><StatusBadge status={o.order_type} /></td>
                    <td className="td">{o.table_label || o.guest_name || '—'}</td>
                    <td className="td">{o.item_count}</td>
                    <td className="td font-medium">{formatCurrency(o.grand_total)}</td>
                    <td className="td">
                      {o.bill ? (
                        <div className="space-y-1">
                          <p className="font-mono text-xs text-surface-600">{o.bill.bill_number}</p>
                          <StatusBadge status={o.bill.payment_status} />
                        </div>
                      ) : (
                        <span className="text-xs text-surface-400">No bill yet</span>
                      )}
                    </td>
                    <td className="td text-surface-400 text-xs">{formatDateTime(o.created_at)}</td>
                    <td className="td">
                      <div className="flex flex-wrap items-center gap-2">
                        {o.order_type === 'guest_house' && o.bill?.payment_status === 'unpaid' && (
                          <button
                            onClick={e => openMarkPaid(o, e)}
                            className="btn-primary btn btn-sm"
                            disabled={actionLoadingId === o.id}
                          >
                            Mark Paid
                          </button>
                        )}
                        <button onClick={() => navigate(`/orders/${o.id}`)} className="btn-secondary btn btn-sm">Manage</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )
      }
      <Pagination page={page} pages={pages} onPage={setPage} />

      {payModalOpen && selectedOrder?.bill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setPayModalOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-card-lg w-full max-w-sm p-6">
            <h3 className="font-display text-xl font-bold mb-2">Mark as Paid</h3>
            <p className="text-sm text-surface-500 mb-1">{selectedOrder.guest_name} · Room {selectedOrder.guest_room || '—'}</p>
            <p className="text-sm text-surface-500 mb-4">
              Bill {selectedOrder.bill.bill_number} · {formatCurrency(selectedOrder.bill.grand_total)}
            </p>
            <div className="space-y-4">
              <div>
                <label className="label">Payment Mode</label>
                <div className="flex gap-2">
                  {[
                    { id: 'cash', label: 'Cash' },
                    { id: 'upi', label: 'Online (UPI)' },
                    { id: 'card', label: 'Card' },
                  ].map(m => (
                    <button
                      key={m.id}
                      onClick={() => setSettleMode(m.id)}
                      className={`flex-1 btn btn-sm justify-center ${settleMode === m.id ? 'btn-primary' : 'btn-secondary'}`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setPayModalOpen(false)} className="btn-secondary btn flex-1 justify-center">Cancel</button>
                <button onClick={handleMarkPaid} className="btn-primary btn flex-1 justify-center" disabled={actionLoadingId === selectedOrder.id}>
                  {actionLoadingId === selectedOrder.id ? 'Saving…' : 'Confirm Paid'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
