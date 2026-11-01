import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { billingAPI } from '../../services/api'
import { formatCurrency, formatDateTime, orderTypeLabel, paymentModeLabel } from '../../utils/format'
import StatusBadge from '../../components/ui/StatusBadge'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import Pagination from '../../components/ui/Pagination'
import toast from 'react-hot-toast'
import { openWhatsApp, buildBillMessage } from '../../utils/whatsappLink'

export default function Bills() {
  const [bills, setBills]     = useState([])
  const [loading, setLoading] = useState(true)
  const [actionLoadingId, setActionLoadingId] = useState(null)
  const [payModalOpen, setPayModalOpen] = useState(false)
  const [selectedBill, setSelectedBill] = useState(null)
  const [settleMode, setSettleMode] = useState('cash')
  const [pagination, setPagination] = useState({ page: 1, pages: 1 })
  const [filters, setFilters] = useState({ from_date: '', to_date: '', payment_mode: '', order_type: '' })
  const [search, setSearch] = useState('')
  const navigate = useNavigate()

  const load = (page = 1) => {
    setLoading(true)
    billingAPI.list({ ...filters, page, limit: 20 }).then(r => {
      setBills(r.data.data.bills)
      setPagination(r.data.data.pagination)
    }).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const updateBillRow = updatedBill => {
    setBills(prev => prev.map(b => b.id === updatedBill.id ? { ...b, ...updatedBill } : b))
  }
  const filteredBills = bills.filter(b => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return String(b.bill_number || '').toLowerCase().includes(q)
      || String(b.order_number || '').toLowerCase().includes(q)
      || String(b.guest_name || '').toLowerCase().includes(q)
      || String(b.table_label || '').toLowerCase().includes(q)
      || String(b.payment_status || '').toLowerCase().includes(q)
  })

  const handleMarkCredit = async bill => {
    setActionLoadingId(bill.id)
    try {
      const r = await billingAPI.updatePaymentStatus(bill.bill_number, { payment_status: 'unpaid' })
      updateBillRow(r.data.data)
      toast.success('Bill marked as credit (due).')
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to update bill.')
    } finally {
      setActionLoadingId(null)
    }
  }

  const openMarkPaidModal = bill => {
    setSelectedBill(bill)
    setSettleMode('cash')
    setPayModalOpen(true)
  }

  const handleMarkPaid = async () => {
    if (!selectedBill) return
    setActionLoadingId(selectedBill.id)
    try {
      const r = await billingAPI.updatePaymentStatus(selectedBill.bill_number, {
        payment_status: 'paid',
        payment_mode: settleMode,
      })
      updateBillRow(r.data.data)
      toast.success('Bill marked as paid.')
      setPayModalOpen(false)
      setSelectedBill(null)
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to update bill.')
    } finally {
      setActionLoadingId(null)
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Bills</h1>
      </div>

      {/* Filters */}
      <div className="card p-4 mb-5 flex gap-3 flex-wrap items-end">
        <div>
          <label className="label">From</label>
          <input type="date" className="input w-full sm:w-36" value={filters.from_date} onChange={e => setFilters(p => ({...p, from_date: e.target.value}))} />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" className="input w-full sm:w-36" value={filters.to_date} onChange={e => setFilters(p => ({...p, to_date: e.target.value}))} />
        </div>
        <div>
          <label className="label">Payment Mode</label>
          <select className="input w-full sm:w-32" value={filters.payment_mode} onChange={e => setFilters(p => ({...p, payment_mode: e.target.value}))}>
            <option value="">All</option>
            <option value="cash">Cash</option><option value="upi">Online (UPI)</option><option value="card">Card</option><option value="credit">Credit (Due)</option>
          </select>
        </div>
        <div>
          <label className="label">Order Type</label>
          <select className="input w-full sm:w-36" value={filters.order_type} onChange={e => setFilters(p => ({...p, order_type: e.target.value}))}>
            <option value="">All</option>
            <option value="dine_in">Dine In</option><option value="guest_house">Guest House</option>
          </select>
        </div>
        <div>
          <label className="label">Search</label>
          <input
            className="input w-full sm:w-56"
            placeholder="Bill #, order #, guest..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button onClick={() => load(1)} className="btn-primary btn">Apply</button>
        <button onClick={() => { setFilters({ from_date:'',to_date:'',payment_mode:'',order_type:'' }); setTimeout(() => load(1),0) }} className="btn-secondary btn">Reset</button>
      </div>

      {loading ? <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      : filteredBills.length === 0
        ? <EmptyState icon="🧾" title="No bills found" message="Adjust filters or generate new bills." />
        : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
            <table className="table-auto">
              <thead><tr>
                <th className="th">Bill #</th><th className="th">Order #</th><th className="th">Type</th><th className="th">Table/Guest</th>
                <th className="th">Payment</th><th className="th">Status</th><th className="th">Amount</th><th className="th">Date</th><th className="th"></th>
              </tr></thead>
              <tbody>
                {filteredBills.map(b => (
                  <tr key={b.id} className="hover:bg-surface-50 cursor-pointer" onClick={() => navigate(`/bills/${b.bill_number}`)}>
                    <td className="td font-mono text-xs text-brand-600 font-medium">{b.bill_number}</td>
                    <td className="td font-mono text-xs text-surface-500">{b.order_number}</td>
                    <td className="td"><StatusBadge status={b.order_type} /></td>
                    <td className="td text-sm">{b.table_label || b.guest_name || '—'}</td>
                    <td className="td"><span className="badge badge-blue">{paymentModeLabel(b.payment_mode)}</span></td>
                    <td className="td"><StatusBadge status={b.payment_status} /></td>
                    <td className="td font-bold text-surface-900">{formatCurrency(b.grand_total)}</td>
                    <td className="td text-xs text-surface-400">{formatDateTime(b.created_at)}</td>
                    <td className="td">
                          <button type="button" className="btn-ghost btn btn-sm" title="WhatsApp bill"
                            onClick={() => {
                              const phone = b.guest_phone || b.customer_phone
                              const raw = phone || window.prompt('WhatsApp number (10 digit):')
                              if (!raw) return
                              openWhatsApp(raw, buildBillMessage(b, {}))
                            }}>💬</button>
                      <div className="flex items-center gap-2 justify-end">
                        {b.payment_status === 'paid' ? (
                          <button
                            className="btn-secondary btn btn-sm"
                            onClick={e => {
                              e.stopPropagation()
                              handleMarkCredit(b)
                            }}
                            disabled={actionLoadingId === b.id}
                          >
                            {actionLoadingId === b.id ? 'Updating…' : 'Mark Credit'}
                          </button>
                        ) : (
                          <button
                            className="btn-primary btn btn-sm"
                            onClick={e => {
                              e.stopPropagation()
                              openMarkPaidModal(b)
                            }}
                            disabled={actionLoadingId === b.id}
                          >
                            Mark Paid
                          </button>
                        )}
                        <button className="btn-ghost btn btn-sm text-brand-500">View →</button>
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
      <Pagination page={pagination.page} pages={pagination.pages} onPage={load} />

      {payModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setPayModalOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-card-lg w-full max-w-sm p-6">
            <h3 className="font-display text-xl font-bold mb-2">Mark Paid</h3>
            <p className="text-sm text-surface-500 mb-4">Choose payment mode for bill {selectedBill?.bill_number}.</p>
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
                <button onClick={() => setPayModalOpen(false)} className="btn-secondary btn flex-1 justify-center">
                  Cancel
                </button>
                <button onClick={handleMarkPaid} className="btn-primary btn flex-1 justify-center" disabled={actionLoadingId === selectedBill?.id}>
                  {actionLoadingId === selectedBill?.id ? 'Saving…' : 'Confirm Paid'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
