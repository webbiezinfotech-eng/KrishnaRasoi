import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { tableAPI, orderAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import StatusBadge from '../../components/ui/StatusBadge'
import Spinner from '../../components/ui/Spinner'
import { formatCurrency, formatDateTime } from '../../utils/format'
import toast from 'react-hot-toast'

function TableCard({ table, onOpen, onReset, canReset }) {
  const statusColor = { available: 'border-green-200 bg-green-50', occupied: 'border-amber-200 bg-amber-50', billing_pending: 'border-red-200 bg-red-50' }
  return (
    <div className={`rounded-xl border-2 p-4 cursor-pointer transition-all hover:shadow-card-md ${statusColor[table.status] || 'border-surface-200 bg-white'}`} onClick={() => table.status === 'available' && onOpen(table)}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-display font-bold text-surface-900 text-lg">{table.label}</h3>
          <p className="text-xs text-surface-400">Capacity: {table.capacity}</p>
        </div>
        <StatusBadge status={table.status} />
      </div>
      {table.status !== 'available' && (
        <div className="mt-2 space-y-1">
          {table.order_number && <p className="text-xs text-surface-600 font-mono">#{table.order_number}</p>}
          {table.item_count > 0 && <p className="text-xs text-surface-500">{table.item_count} items · {formatCurrency(table.current_order_total)}</p>}
          {table.order_started_at && <p className="text-xs text-surface-400">Since {formatDateTime(table.order_started_at)}</p>}
          <div className="flex gap-2 mt-3">
            <button className="btn-primary btn btn-sm flex-1 justify-center" onClick={e => { e.stopPropagation(); onOpen(table) }}>Continue Order</button>
            {canReset && (
              <button className="btn-secondary btn btn-sm" onClick={e => { e.stopPropagation(); onReset(table) }}>Reset</button>
            )}
          </div>
        </div>
      )}
      {table.status === 'available' && (
        <button
          className="mt-3 w-full btn-primary btn btn-sm justify-center"
          onClick={e => { e.stopPropagation(); onOpen(table) }}
        >
          Open Order
        </button>
      )}
    </div>
  )
}

export default function Tables() {
  const [tables, setTables]   = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const { isWaiter } = useAuth()

  const loadTables = () => {
    tableAPI.list().then(r => { setTables(r.data.data); setLoading(false) }).catch(() => setLoading(false))
  }

  useEffect(() => { loadTables(); const iv = setInterval(loadTables, 30000); return () => clearInterval(iv) }, [])

  const handleOpen = async table => {
    if (table.status === 'available') {
      try {
        const r = await orderAPI.createDineIn({ table_id: table.id })
        const createdOrderId = r?.data?.data?.id
        if (createdOrderId) {
          navigate(`/orders/${createdOrderId}`)
          return
        }
        navigate('/orders/new/dine-in', { state: { tableId: table.id, tableLabel: table.label } })
      } catch (e) {
        if (e.response?.status === 409) {
          try {
            const list = await tableAPI.list()
            const latest = (list.data.data || []).find(t => t.id === table.id)
            if (latest?.current_order_id) {
              toast('Table already occupied. Opening current order.')
              navigate(`/orders/${latest.current_order_id}`)
              setTables(list.data.data || [])
              return
            }
            setTables(list.data.data || [])
          } catch (_) {}
        }
        toast.error(e.response?.data?.message || 'Failed to open order.')
      }
      return
    }
    if (table.current_order_id) navigate(`/orders/${table.current_order_id}`)
  }

  const handleReset = async table => {
    if (!confirm(`Reset ${table.label} to available? This will not cancel the order.`)) return
    try { await tableAPI.reset(table.id); toast.success(`${table.label} reset.`); loadTables() }
    catch (e) { toast.error(e.response?.data?.message || 'Failed.') }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>

  const available = tables.filter(t => t.status === 'available').length

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{isWaiter ? 'Take Order' : 'Tables'}</h1>
          <p className="text-sm text-surface-400">{available} of {tables.length} tables available</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {!isWaiter && (
            <button onClick={() => navigate('/orders/new/guest-house')} className="btn-secondary btn">+ Guest House Order</button>
          )}
          <button onClick={loadTables} className="btn-ghost btn">↻ Refresh</button>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-4">
        {tables.map(t => (
          <TableCard
            key={t.id}
            table={t}
            onOpen={handleOpen}
            onReset={handleReset}
            canReset={!isWaiter}
          />
        ))}
      </div>
    </div>
  )
}
