import { useEffect, useMemo, useState } from 'react'
import { guestHouseAPI } from '../../services/api'
import Spinner from '../../components/ui/Spinner'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const TYPES = [
  { key: 'checkins',   label: 'Check-in Report' },
  { key: 'checkouts',  label: 'Check-out Report' },
  { key: 'bookings',   label: 'Advance Booking Report' },
  { key: 'payments',   label: 'Payment Collection' },
  { key: 'pending',    label: 'Pending Payments' },
  { key: 'occupancy',  label: 'Occupancy Report' },
]

const today = new Date().toISOString().slice(0, 10)
const monthStart = today.slice(0, 8) + '01'

const labelOf = key => key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

const isDateKey = key => /_at$|^day$|date$/.test(key)

function cellLabel(key, value) {
  if (value === null || value === undefined || value === '') return '-'
  if (isDateKey(key)) {
    const d = new Date(String(value).replace(' ', 'T'))
    if (!isNaN(d)) return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }
  if (['total_amount', 'paid_amount', 'balance_amount', 'amount', 'revenue'].includes(key)) {
    return Number(value).toFixed(2)
  }
  return String(value)
}

const rupeeKeys = ['total_amount', 'paid_amount', 'balance_amount', 'amount', 'revenue']

export default function GuestHouseReports() {
  const [type, setType] = useState('checkins')
  const [from, setFrom] = useState(monthStart)
  const [to, setTo]     = useState(today)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [search, setSearch]   = useState('')

  const setPreset = (kind) => {
    const now = new Date()
    const iso = d => d.toISOString().slice(0, 10)
    if (kind === 'today') { setFrom(iso(now)); setTo(iso(now)) }
    else if (kind === 'month') {
      setFrom(iso(new Date(now.getFullYear(), now.getMonth(), 1)))
      setTo(iso(now))
    } else if (kind === 'year') {
      setFrom(`${now.getFullYear()}-01-01`)
      setTo(iso(now))
    } else if (kind === 'lastmonth') {
      const s0 = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const e0 = new Date(now.getFullYear(), now.getMonth(), 0)
      setFrom(iso(s0)); setTo(iso(e0))
    }
  }

  const load = async () => {
    setLoading(true)
    try {
      const r = await guestHouseAPI.report({ type, from_date: from, to_date: to })
      setData(r.data.data)
    } catch (e) {
      toast.error(e.response?.data?.message || 'Report load nahi hui.')
      setData(null)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() /* eslint-disable-next-line */ }, [type])

  const columns = data?.columns || []
  const rows = useMemo(() => {
    const list = data?.rows || []
    const q = search.trim().toLowerCase()
    if (!q) return list
    return list.filter(r => columns.some(c => String(r[c.key] ?? '').toLowerCase().includes(q)))
  }, [data, search, columns])

  const summaryCards = data ? [
    { label: 'Check-ins',        value: data.summary.check_ins },
    { label: 'Check-outs',       value: data.summary.check_outs },
    { label: 'Advance Bookings', value: data.summary.bookings },
    { label: 'Advance Received', value: `₹${Number(data.summary.advance || 0).toFixed(0)}` },
    { label: 'Billed',           value: `₹${Number(data.summary.billed || 0).toFixed(0)}` },
    { label: 'Collected',        value: `₹${Number(data.summary.collected || 0).toFixed(0)}` },
    { label: 'Outstanding',      value: `₹${Number(data.summary.outstanding || 0).toFixed(0)}` },
    { label: 'Guests',           value: data.summary.persons },
  ] : []

  const metaRows = () => ([
    ['Guest House', data?.house?.name || ''],
    ['Report', TYPES.find(t => t.key === (data?.type || type))?.label || type],
    ['From Date', data?.from_date || from],
    ['To Date', data?.to_date || to],
    ['Generated On', new Date().toLocaleString('en-IN')],
    ...(search.trim() ? [['Filter', search.trim()]] : []),
  ])

  const exportExcel = () => {
    if (!rows.length) { toast.error('Export ke liye koi row nahi.'); return }
    const wb = XLSX.utils.book_new()
    const info = [['Kripa Shanti Report'], ...metaRows()]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(info), 'Info')
    const head = columns.map(c => c.label)
    const body = rows.map(r => columns.map(c => {
      const v = r[c.key]
      if (isDateKey(c.key)) return cellLabel(c.key, v)
      if (rupeeKeys.includes(c.key)) return Number(v || 0)
      return v ?? ''
    }))
    const ws = XLSX.utils.aoa_to_sheet([head, ...body])
    XLSX.utils.book_append_sheet(wb, ws, 'Report')
    const s = data?.summary || {}
    const sum = [['Metric', 'Value'],
      ['Check-ins', s.check_ins], ['Check-outs', s.check_outs], ['Advance Bookings', s.bookings],
      ['Advance Received', s.advance], ['Billed', s.billed], ['Collected', s.collected],
      ['Outstanding', s.outstanding], ['Guests', s.persons]]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sum), 'Summary')
    XLSX.writeFile(wb, `KripaShanti-${type}-${from}_to_${to}.xlsx`)
    toast.success('Excel download ho gayi.')
  }

  const exportPdf = () => {
    if (!rows.length) { toast.error('Export ke liye koi row nahi.'); return }
    const doc = new jsPDF({ orientation: columns.length > 6 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' })
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14)
    doc.text(data?.house?.name || 'Kripa Shanti Atithi Bhavan', 40, 44)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90)
    let y = 58
    metaRows().forEach(([k, v]) => { doc.text(`${k}: ${v}`, 40, y); y += 12 })
    doc.setTextColor(20)

    autoTable(doc, {
      startY: y + 8,
      head: [columns.map(c => c.label)],
      body: rows.map(r => columns.map(c => cellLabel(c.key, r[c.key]))),
      theme: 'grid',
      styles: { fontSize: 7.5, cellPadding: 3, overflow: 'linebreak' },
      headStyles: { fillColor: [235, 235, 235], textColor: 20, fontStyle: 'bold' },
    })
    const s = data?.summary || {}
    autoTable(doc, {
      startY: (doc.lastAutoTable?.finalY || y) + 14,
      head: [['Summary', 'Value']],
      body: [
        ['Check-ins', s.check_ins], ['Check-outs', s.check_outs], ['Advance Bookings', s.bookings],
        ['Advance Received', `Rs ${Number(s.advance || 0).toFixed(2)}`],
        ['Billed', `Rs ${Number(s.billed || 0).toFixed(2)}`],
        ['Collected', `Rs ${Number(s.collected || 0).toFixed(2)}`],
        ['Outstanding', `Rs ${Number(s.outstanding || 0).toFixed(2)}`],
        ['Guests', s.persons],
      ],
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [235, 235, 235], textColor: 20 },
      tableWidth: 260,
    })
    doc.save(`KripaShanti-${type}-${from}_to_${to}.pdf`)
    toast.success('PDF download ho gayi.')
  }

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Kripa Shanti Reports</h1>
          <p className="page-sub">Guest house ka filter-wise report — Excel ya PDF me download karein.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary btn" onClick={exportExcel} disabled={!rows.length}>⬇ Excel</button>
          <button className="btn-secondary btn" onClick={exportPdf} disabled={!rows.length}>⬇ PDF</button>
          <button className="btn-primary btn" onClick={load} disabled={loading}>{loading ? 'Loading…' : '↻ Refresh'}</button>
        </div>
      </div>

      <div className="card p-4">
        <div className="flex flex-wrap gap-2 mb-3">
          <span className="text-xs text-surface-500 self-center mr-1">Quick range:</span>
          <button type="button" className="btn-secondary btn btn-sm" onClick={() => setPreset('today')}>Daily (Aaj)</button>
          <button type="button" className="btn-secondary btn btn-sm" onClick={() => setPreset('month')}>Monthly (Is mahine)</button>
          <button type="button" className="btn-secondary btn btn-sm" onClick={() => setPreset('lastmonth')}>Last Month</button>
          <button type="button" className="btn-secondary btn btn-sm" onClick={() => setPreset('year')}>Yearly (Is saal)</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="form-group mb-0">
            <label className="label">Report Type</label>
            <select className="select" value={type} onChange={e => setType(e.target.value)}>
              {TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>
          <div className="form-group mb-0">
            <label className="label">From Date</label>
            <input type="date" className="input" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div className="form-group mb-0">
            <label className="label">To Date</label>
            <input type="date" className="input" value={to} onChange={e => setTo(e.target.value)} />
          </div>
          <div className="form-group mb-0">
            <label className="label">Search in report</label>
            <input className="input" placeholder="guest / room / mode" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex items-end">
            <button className="btn-primary btn w-full justify-center" onClick={load} disabled={loading}>
              {loading ? 'Loading…' : 'Generate Report'}
            </button>
          </div>
        </div>
      </div>

      {loading && <div className="flex justify-center py-16"><Spinner size="lg" /></div>}

      {data && !loading && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-3">
            {summaryCards.map(c => (
              <div key={c.label} className="card p-3">
                <p className="text-xs text-surface-500">{c.label}</p>
                <p className="font-display font-bold text-lg text-surface-900">{c.value}</p>
              </div>
            ))}
          </div>

          <div className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-surface-200 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display font-bold text-surface-900">
                {TYPES.find(t => t.key === data.type)?.label || data.type}
                <span className="text-surface-400 text-sm font-normal ml-2">
                  {data.from_date} → {data.to_date} · {rows.length} row(s)
                </span>
              </h2>
              <span className="text-xs text-surface-400">GST {data.summary.gst_percent || 0}%</span>
            </div>
            <div className="overflow-x-auto">
              <table className="table-auto">
                <thead>
                  <tr>{columns.map(c => <th key={c.key} className="th">{c.label}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      {columns.map(c => (
                        <td key={c.key} className={`td ${rupeeKeys.includes(c.key) ? 'text-right' : ''}`}>
                          {cellLabel(c.key, r[c.key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr><td className="td text-center text-surface-500" colSpan={Math.max(1, columns.length)}>
                      Is date range me koi record nahi mila.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
