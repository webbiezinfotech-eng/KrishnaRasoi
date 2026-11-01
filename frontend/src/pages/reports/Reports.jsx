import { useEffect, useMemo, useState } from 'react'
import { reportAPI, dashboardAPI, guestHouseAPI } from '../../services/api'
import { formatCurrency, formatDate } from '../../utils/format'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import Pagination from '../../components/ui/Pagination'
import ExportMenu from '../../components/reports/ExportMenu'
import toast from 'react-hot-toast'

const today = new Date().toISOString().split('T')[0]
const monthStart = today.slice(0,8) + '01'

const REPORTS = [
  { key: 'sales',       label: 'Daily Sales',         icon: '📊' },
  { key: 'item-wise',   label: 'Item-Wise Sales',      icon: '🍽' },
  { key: 'table-wise',  label: 'Table-Wise Sales',     icon: '⊞' },
  { key: 'commission',  label: 'Commission Report',    icon: '💰' },
  { key: 'payment',     label: 'Payment Mode Report',  icon: '💳' },
  { key: 'occupancy',   label: 'Occupancy Report',     icon: '🏨' },
  { key: 'pending',     label: 'Pending Payments',     icon: '⏳' },
]

export default function Reports() {
  const [activeReport, setActiveReport] = useState('sales')
  const [from, setFrom] = useState(monthStart)
  const [to, setTo]     = useState(today)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [overview, setOverview] = useState(null)
  const [itemSearch, setItemSearch] = useState('')
  const [commissionSearch, setCommissionSearch] = useState('')
  const [guestHouseProfiles, setGuestHouseProfiles] = useState([])
  const [selectedGuestHouseId, setSelectedGuestHouseId] = useState('')
  const [orderType, setOrderType] = useState('')
  const [reportSearch, setReportSearch] = useState('')
  const [reportPage, setReportPage] = useState(1)
  const [commissionSummaryPage, setCommissionSummaryPage] = useState(1)
  const perPage = 10

  useEffect(() => {
    dashboardAPI.get().then(r => setOverview(r.data.data)).catch(() => {})
    guestHouseAPI.profiles().then(r => setGuestHouseProfiles(r.data.data || [])).catch(() => {})
  }, [])

  useEffect(() => {
    fetchReport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeReport])

  useEffect(() => {
    if (orderType === 'dine_in' && selectedGuestHouseId) {
      setSelectedGuestHouseId('')
    }
  }, [orderType, selectedGuestHouseId])

  const fetchReport = async () => {
    setLoading(true); setData(null)
    setReportPage(1)
    setCommissionSummaryPage(1)
    const params = { from_date: from, to_date: to }
    if (orderType) params.order_type = orderType
    if (selectedGuestHouseId) params.guest_house_id = selectedGuestHouseId
    try {
      let r
      if (activeReport === 'sales')      r = await reportAPI.sales(params)
      else if (activeReport === 'item-wise')   r = await reportAPI.itemWise(params)
      else if (activeReport === 'table-wise')  r = await reportAPI.tableWise(params)
      else if (activeReport === 'commission') {
        const cParams = { ...params }
        if (commissionSearch.trim()) cParams.q = commissionSearch.trim()
        r = await reportAPI.commission(cParams)
      }
      else if (activeReport === 'payment')     r = await reportAPI.paymentMode(params)
      else if (activeReport === 'occupancy')   r = await reportAPI.occupancy(params)
      else if (activeReport === 'pending')     r = await reportAPI.pendingPayments(params)
      setData(r.data.data)
    } catch { toast.error('Failed to load report.') }
    finally { setLoading(false) }
  }

  const itemRows = activeReport === 'item-wise'
    ? (data?.rows || []).filter(r =>
      !itemSearch.trim()
      || String(r.item_name || '').toLowerCase().includes(itemSearch.trim().toLowerCase())
      || String(r.item_category || '').toLowerCase().includes(itemSearch.trim().toLowerCase())
    )
    : []
  const genericReportRows = (data?.rows || []).filter(r => {
    const q = reportSearch.trim().toLowerCase()
    if (!q) return true
    return Object.values(r || {}).some(v => String(v ?? '').toLowerCase().includes(q))
  })

  const paginateRows = rows => {
    const safeRows = rows || []
    const pages = Math.max(1, Math.ceil(safeRows.length / perPage))
    const currentPage = Math.min(reportPage, pages)
    const pageRows = safeRows.slice((currentPage - 1) * perPage, currentPage * perPage)
    return { pages, currentPage, pageRows }
  }

  const exportContext = useMemo(() => ({
    activeReport,
    from,
    to,
    orderType,
    selectedGuestHouseId,
    guestHouseProfiles,
    itemSearch,
    commissionSearch,
    reportSearch,
    data,
    itemRows,
    genericReportRows,
  }), [
    activeReport, from, to, orderType, selectedGuestHouseId, guestHouseProfiles,
    itemSearch, commissionSearch, reportSearch, data, itemRows, genericReportRows,
  ])

  const SummaryCard = ({ label, value, color = '' }) => (
    <div className="card p-4 text-center">
      <p className="text-xs text-surface-400 mb-1">{label}</p>
      <p className={`font-display text-xl font-bold ${color || 'text-surface-900'}`}>{value}</p>
    </div>
  )

  return (
    <div>
      <div className="page-header"><h1 className="page-title">Reports</h1></div>

      {overview && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
          <SummaryCard label="Today's Sales" value={formatCurrency(overview.today_sales)} color="text-brand-600" />
          <SummaryCard label="Dine-In Sales" value={formatCurrency(overview.today_dine_in)} color="text-blue-600" />
          <SummaryCard label="Guest House Sales" value={formatCurrency(overview.today_guest_house)} color="text-purple-600" />
          <SummaryCard label="Commission Paid (Today)" value={formatCurrency(overview.today_commission)} color="text-amber-600" />
        </div>
      )}

      <div className="flex gap-2 mb-5 flex-wrap">
        {REPORTS.map(r => (
          <button key={r.key} onClick={() => { setActiveReport(r.key); setData(null) }}
            className={`btn btn-sm gap-2 ${activeReport === r.key ? 'btn-primary' : 'btn-secondary'}`}>
            {r.icon} {r.label}
          </button>
        ))}
      </div>

      <div className="card p-4 mb-5 flex items-end gap-4 flex-wrap">
        <div><label className="label">From Date</label><input type="date" className="input w-full sm:w-40" value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div><label className="label">To Date</label><input type="date" className="input w-full sm:w-40" value={to} onChange={e => setTo(e.target.value)} /></div>
        {activeReport === 'item-wise' && (
          <div className="min-w-[220px]">
            <label className="label">Search Item</label>
            <input
              className="input w-full"
              placeholder="Item name / category"
              value={itemSearch}
              onChange={e => setItemSearch(e.target.value)}
            />
          </div>
        )}
        {(activeReport === 'sales' || activeReport === 'table-wise' || activeReport === 'payment') && (
          <div className="min-w-[240px]">
            <label className="label">Search</label>
            <input
              className="input w-full"
              placeholder="Type to filter rows..."
              value={reportSearch}
              onChange={e => setReportSearch(e.target.value)}
            />
          </div>
        )}
        {activeReport === 'commission' && (
          <>
            <div className="min-w-[220px]">
              <label className="label">Search</label>
              <input
                className="input w-full"
                placeholder="Guest house / guest / bill / order"
                value={commissionSearch}
                onChange={e => setCommissionSearch(e.target.value)}
              />
            </div>
          </>
        )}
        {activeReport !== 'table-wise' && (
          <div className="min-w-[180px]">
            <label className="label">Order Type</label>
            <select className="input w-full" value={orderType} onChange={e => setOrderType(e.target.value)}>
              <option value="">All</option>
              <option value="dine_in">Dine-In</option>
              <option value="guest_house">Guest House</option>
            </select>
          </div>
        )}
        {activeReport !== 'table-wise' && (
          <div className="min-w-[240px]">
            <label className="label">Guest House</label>
            <select
              className="input w-full"
              value={selectedGuestHouseId}
              onChange={e => setSelectedGuestHouseId(e.target.value)}
              disabled={orderType === 'dine_in'}
            >
              <option value="">All Guest Houses</option>
              {guestHouseProfiles.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}
        <button onClick={fetchReport} className="btn-primary btn" disabled={loading}>
          {loading ? 'Loading…' : 'Generate Report'}
        </button>
      </div>

      {loading && <div className="flex justify-center py-20"><Spinner size="lg" /></div>}

      {data && !loading && (
        <div>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <p className="text-sm text-surface-500">
              Showing filtered data — export includes all rows below (not just current page).
            </p>
            <ExportMenu exportContext={exportContext} />
          </div>
          {/* Sales Report */}
          {activeReport === 'sales' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 mb-5">
                <SummaryCard label="Total Sales" value={formatCurrency(data.summary?.total_sales)} color="text-brand-600" />
                <SummaryCard label="Total Orders" value={data.summary?.total_orders} />
                <SummaryCard label="Dine-In Sales" value={formatCurrency(data.summary?.dine_in_sales)} color="text-blue-600" />
                <SummaryCard label="Guest House" value={formatCurrency(data.summary?.guest_house_sales)} color="text-purple-600" />
                <SummaryCard label="Commission Paid" value={formatCurrency(data.summary?.total_commission)} color="text-amber-600" />
              </div>
              {(() => {
                const pg = paginateRows(genericReportRows)
                return (
                <>
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                <table className="table-auto">
                  <thead><tr>
                    <th className="th">Date</th><th className="th text-right">Orders</th>
                    <th className="th text-right">Dine-In</th><th className="th text-right">Guest House</th>
                    <th className="th text-right">Commission Paid</th><th className="th text-right">Total Sales</th>
                  </tr></thead>
                  <tbody>
                    {pg.pageRows.length === 0
                      ? <tr><td colSpan={6} className="td text-center text-surface-400 py-8">No data for this period.</td></tr>
                      : pg.pageRows.map((r, i) => (
                        <tr key={i} className="hover:bg-surface-50">
                          <td className="td font-medium">{formatDate(r.date)}</td>
                          <td className="td text-right">{r.total_orders}</td>
                          <td className="td text-right text-blue-600">{formatCurrency(r.dine_in_sales)}</td>
                          <td className="td text-right text-purple-600">{formatCurrency(r.guest_house_sales)}</td>
                          <td className="td text-right text-amber-600">{formatCurrency(r.total_commission)}</td>
                          <td className="td text-right font-bold">{formatCurrency(r.total_sales)}</td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
                </div>
              </div>
              <Pagination page={pg.currentPage} pages={pg.pages} onPage={setReportPage} />
              </>
              )})()}
            </>
          )}

          {/* Item-Wise */}
          {activeReport === 'item-wise' && (
            (() => {
              const pg = paginateRows(itemRows)
              return (
            <>
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
              <table className="table-auto">
                <thead><tr>
                  <th className="th">Item Name</th><th className="th">Category</th>
                  <th className="th text-right">Qty Sold</th><th className="th text-right">Avg Price</th><th className="th text-right">Revenue</th>
                </tr></thead>
                <tbody>
                  {pg.pageRows.length === 0
                    ? <tr><td colSpan={5} className="td text-center text-surface-400 py-8">No data.</td></tr>
                    : pg.pageRows.map((r,i) => (
                      <tr key={i} className="hover:bg-surface-50">
                        <td className="td font-medium">{r.item_name}</td>
                        <td className="td text-surface-500 text-sm">{r.item_category}</td>
                        <td className="td text-right font-bold">{r.total_qty}</td>
                        <td className="td text-right text-surface-500">{formatCurrency(r.avg_price)}</td>
                        <td className="td text-right font-bold text-brand-600">{formatCurrency(r.total_revenue)}</td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
              </div>
            </div>
            <Pagination page={pg.currentPage} pages={pg.pages} onPage={setReportPage} />
            </>
              )
            })()
          )}

          {/* Table-Wise */}
          {activeReport === 'table-wise' && (
            (() => {
              const pg = paginateRows(genericReportRows)
              return (
            <>
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
              <table className="table-auto">
                <thead><tr>
                  <th className="th">Table</th><th className="th text-right">Orders</th><th className="th text-right">Total Sales</th>
                </tr></thead>
                <tbody>
                  {pg.pageRows.map((r,i) => (
                    <tr key={i} className="hover:bg-surface-50">
                      <td className="td font-medium">{r.table_label}</td>
                      <td className="td text-right">{r.total_orders}</td>
                      <td className="td text-right font-bold text-brand-600">{formatCurrency(r.total_sales)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
            <Pagination page={pg.currentPage} pages={pg.pages} onPage={setReportPage} />
            </>
              )
            })()
          )}

          {/* Commission */}
          {activeReport === 'commission' && (
            <>
              <div className="card p-4 mb-4 flex items-center gap-4">
                <span className="text-surface-500 text-sm">Total Commission Paid:</span>
                <span className="font-display text-2xl font-bold text-amber-600">{formatCurrency(data.total_commission)}</span>
              </div>
              {(() => {
                const rows = data.house_summary || []
                const pages = Math.max(1, Math.ceil(rows.length / perPage))
                const currentPage = Math.min(commissionSummaryPage, pages)
                const pageRows = rows.slice((currentPage - 1) * perPage, currentPage * perPage)
                return (
              <>
              <div className="card overflow-hidden mb-2">
                <div className="px-5 py-4 border-b border-surface-200">
                  <h3 className="font-display text-lg font-bold text-surface-900">Guest House Wise Commission</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="table-auto">
                    <thead><tr>
                      <th className="th">Guest House</th>
                      <th className="th text-right">Orders</th>
                      <th className="th text-right">Sales</th>
                      <th className="th text-right">Commission Paid</th>
                    </tr></thead>
                    <tbody>
                      {pageRows.length === 0 ? (
                        <tr><td colSpan={4} className="td text-center text-surface-400 py-8">No guest house summary.</td></tr>
                      ) : pageRows.map((h, i) => (
                        <tr key={i} className="hover:bg-surface-50">
                          <td className="td font-medium">{h.guest_house_name || '—'}</td>
                          <td className="td text-right">{h.total_orders}</td>
                          <td className="td text-right">{formatCurrency(h.total_sales)}</td>
                          <td className="td text-right font-bold text-amber-600">{formatCurrency(h.total_commission_paid)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <Pagination page={currentPage} pages={pages} onPage={setCommissionSummaryPage} />
              </>
                )
              })()}
              {(() => {
                const pg = paginateRows(data.rows)
                return (
              <>
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                <table className="table-auto">
                  <thead><tr>
                    <th className="th">Date</th><th className="th">Order #</th><th className="th">Bill #</th>
                    <th className="th">Guest House</th><th className="th">Guest</th><th className="th">Room</th>
                    <th className="th text-right">Order Total</th><th className="th text-right">Commission Paid</th>
                  </tr></thead>
                  <tbody>
                    {pg.pageRows.length === 0 ? (
                      <tr><td colSpan={8} className="td text-center text-surface-400 py-8">No data.</td></tr>
                    ) : pg.pageRows.map((r,i) => (
                      <tr key={i} className="hover:bg-surface-50">
                        <td className="td text-sm">{formatDate(r.date)}</td>
                        <td className="td font-mono text-xs">{r.order_number}</td>
                        <td className="td font-mono text-xs text-brand-600">{r.bill_number}</td>
                        <td className="td">{r.guest_house_name || '—'}</td>
                        <td className="td">{r.guest_name}</td>
                        <td className="td text-surface-500">{r.guest_room || '—'}</td>
                        <td className="td text-right">{formatCurrency(r.grand_total)}</td>
                        <td className="td text-right font-bold text-amber-600">{formatCurrency(r.commission_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
              <Pagination page={pg.currentPage} pages={pg.pages} onPage={setReportPage} />
              </>
                )
              })()}
            </>
          )}

          {/* Payment Mode */}
          {activeReport === 'occupancy' && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                <SummaryCard label="Total Rooms" value={data.summary?.total_rooms ?? '—'} />
                <SummaryCard label="Days in Range" value={data.summary?.days ?? '—'} />
                <SummaryCard label="Occupied Room-Nights" value={data.summary?.occupied_nights ?? '—'} />
                <SummaryCard label="Average Occupancy" value={`${data.summary?.avg_occupancy ?? 0}%`} color="text-brand-600" />
              </div>
              {(() => {
                const pg = paginateRows(genericReportRows)
                return (
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                <table className="table-auto">
                  <thead><tr>
                    <th className="th">Date</th><th className="th text-right">Occupied Rooms</th><th className="th text-right">Occupancy %</th>
                  </tr></thead>
                  <tbody>
                    {pg.pageRows.length === 0 ? (
                      <tr><td colSpan={3} className="td text-center text-surface-400 py-8">No data.</td></tr>
                    ) : pg.pageRows.map((r,i) => (
                      <tr key={i} className="hover:bg-surface-50">
                        <td className="td">{formatDate(r.day)}</td>
                        <td className="td text-right">{r.occupied_rooms}</td>
                        <td className="td text-right font-bold text-brand-600">{r.occupancy_percent}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
                )
              })()}
            </>
          )}

          {activeReport === 'pending' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <SummaryCard label="Guest House Pending" value={formatCurrency(data.guest_house?.total)} color="text-amber-600" />
                <SummaryCard label="Restaurant Unpaid Bills" value={formatCurrency(data.bills?.total)} color="text-blue-600" />
                <SummaryCard label="Total Pending" value={formatCurrency(data.grand_total)} color="text-red-600" />
              </div>
              <div className="card overflow-hidden mb-4">
                <div className="px-5 py-4 border-b border-surface-200"><h3 className="font-display text-lg font-bold text-surface-900">Guest House — Balance Due</h3></div>
                <div className="overflow-x-auto">
                <table className="table-auto">
                  <thead><tr>
                    <th className="th">Guest</th><th className="th">Phone</th><th className="th">Room</th>
                    <th className="th">Status</th><th className="th text-right">Total</th><th className="th text-right">Paid</th><th className="th text-right">Balance</th>
                  </tr></thead>
                  <tbody>
                    {(data.guest_house?.rows || []).length === 0 ? (
                      <tr><td colSpan={7} className="td text-center text-surface-400 py-8">Nothing pending.</td></tr>
                    ) : data.guest_house.rows.map(g => (
                      <tr key={g.id} className="hover:bg-surface-50">
                        <td className="td font-medium">{g.guest_name}</td>
                        <td className="td">{g.phone}</td>
                        <td className="td">{g.room_no}</td>
                        <td className="td capitalize">{g.status}</td>
                        <td className="td text-right">{formatCurrency(g.total_amount)}</td>
                        <td className="td text-right">{formatCurrency(g.paid_amount)}</td>
                        <td className="td text-right font-bold text-red-600">{formatCurrency(g.balance_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
              <div className="card overflow-hidden">
                <div className="px-5 py-4 border-b border-surface-200"><h3 className="font-display text-lg font-bold text-surface-900">Restaurant — Unpaid Bills</h3></div>
                <div className="overflow-x-auto">
                <table className="table-auto">
                  <thead><tr>
                    <th className="th">Bill #</th><th className="th">Guest</th><th className="th">Type</th>
                    <th className="th">Date</th><th className="th text-right">Amount</th>
                  </tr></thead>
                  <tbody>
                    {(data.bills?.rows || []).length === 0 ? (
                      <tr><td colSpan={5} className="td text-center text-surface-400 py-8">Nothing pending.</td></tr>
                    ) : data.bills.rows.map((b,i) => (
                      <tr key={i} className="hover:bg-surface-50">
                        <td className="td font-mono text-xs">{b.bill_number}</td>
                        <td className="td">{b.guest_name || '—'}</td>
                        <td className="td">{b.order_type}</td>
                        <td className="td text-sm text-surface-500">{formatDate(b.created_at)}</td>
                        <td className="td text-right font-bold text-red-600">{formatCurrency(b.grand_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            </>
          )}

          {activeReport === 'payment' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {data.rows?.map((r,i) => (
                <div key={i} className="card p-6 text-center">
                  <p className="text-3xl mb-2">{r.payment_mode === 'cash' ? '💵' : r.payment_mode === 'upi' ? '📱' : '💳'}</p>
                  <p className="font-display text-lg font-bold text-surface-900 capitalize">{r.payment_mode}</p>
                  <p className="text-2xl font-bold text-brand-600 mt-2">{formatCurrency(r.total_amount)}</p>
                  <p className="text-sm text-surface-400">{r.total_transactions} transactions</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!data && !loading && (
        <EmptyState icon="📊" title="Select a report type and date range" message="Click Generate Report to view data." />
      )}
    </div>
  )
}
