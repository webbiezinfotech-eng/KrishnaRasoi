import { useEffect, useState, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { orderAPI } from '../../services/api'
import {
  getKotPrintCss,
  getPrintBarCss,
} from '../../utils/printLayout'
import { shouldAutoPrint } from '../../utils/thermalPrint'
import { printReadyPage } from '../../utils/printReadyPage'

function KOTReceipt({ order }) {
  const when = new Date().toLocaleString('en-IN')
  const isDineIn = order.order_type === 'dine_in'
  const place = isDineIn
    ? 'RESTAURANT (DINE IN)'
    : `GUEST HOUSE: ${order.guest_name || 'GUEST HOUSE'}`
  const location = isDineIn
    ? `TABLE: ${order.table_number || order.table_label || '-'}`
    : `ROOM: ${order.guest_room || '-'}`

  return (
    <>
      <div className="center title">KITCHEN ORDER</div>
      <div className="line" />
      <div className="center meta bold">ORDER: {order.order_number || order.id}</div>
      <div className="meta">DATE: {when}</div>
      <div className="meta">PLACE: {place}</div>
      <div className="meta">{location}</div>
      <div className="line" />
      <table>
        <thead><tr><th>ITEM</th><th className="qty">QTY</th></tr></thead>
        <tbody>
          {order.items?.map((item, i) => (
            <tr key={i}>
              <td>{String(item.item_name || '').toUpperCase()}</td>
              <td className="qty">{item.quantity}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {order.notes && <div className="meta">Remarks: {order.notes}</div>}
      <div className="line" />
      <div className="center bold">TOTAL ITEMS: {order.items?.length || 0}</div>
    </>
  )
}

export default function PrintKOTPage() {
  const { orderId } = useParams()
  const navigate = useNavigate()
  const [order, setOrder] = useState(null)
  const [error, setError] = useState('')
  const [printing, setPrinting] = useState(false)
  const [pageReady, setPageReady] = useState(false)
  const printLock = useRef(false)
  const autoPrinted = useRef(false)

  const printCss = useMemo(
    () => `${getKotPrintCss()}${getPrintBarCss()}`,
    [],
  )

  useEffect(() => {
    document.title = 'Kitchen Order'
    orderAPI.show(parseInt(orderId))
      .then(r => setOrder(r.data.data))
      .catch(e => setError(e.response?.data?.message || 'Order not found.'))
  }, [orderId])

  // Wait one paint after order + CSS are in the DOM before allowing/auto print.
  useEffect(() => {
    if (!order) {
      setPageReady(false)
      return
    }
    setPageReady(false)
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setPageReady(true))
    })
    return () => cancelAnimationFrame(id)
  }, [order])

  const runPrint = async () => {
    if (!order || !pageReady || printLock.current) return
    printLock.current = true
    setPrinting(true)
    try {
      await printReadyPage({ delayMs: 500 })
    } finally {
      setPrinting(false)
      setTimeout(() => { printLock.current = false }, 2500)
    }
  }

  useEffect(() => {
    if (!order || !pageReady || !shouldAutoPrint() || autoPrinted.current) return
    autoPrinted.current = true
    runPrint()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, pageReady])

  if (error) {
    return <div style={{ padding: 24, textAlign: 'center' }}><p style={{ color: 'red' }}>{error}</p></div>
  }
  if (!order) {
    return <div style={{ padding: 24, textAlign: 'center' }}><p>Loading…</p></div>
  }

  return (
    <>
      <style>{printCss}</style>
      <div className="wrap print-preview-root">
        <button type="button" className="back-link no-print" onClick={() => navigate(-1)}>← Wapas jao</button>
        <KOTReceipt order={order} />
        <div style={{ height: 120 }} className="no-print" />
      </div>
      <div className="print-bar no-print">
        <button type="button" className="print-btn" onClick={runPrint} disabled={printing || !pageReady}>
          {printing ? 'Printing…' : '🖨 PRINT KOT'}
        </button>
      </div>
    </>
  )
}
