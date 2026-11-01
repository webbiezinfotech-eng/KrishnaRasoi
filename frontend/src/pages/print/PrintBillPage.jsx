import { useEffect, useState, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { billingAPI } from '../../services/api'
import BillReceipt from '../../components/billing/BillReceipt'
import {
  getBillPrintCss,
  getPrintBarCss,
} from '../../utils/printLayout'
import { shouldAutoPrint } from '../../utils/thermalPrint'
import { printReadyPage } from '../../utils/printReadyPage'

export default function PrintBillPage() {
  const { billNumber } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [printing, setPrinting] = useState(false)
  const [pageReady, setPageReady] = useState(false)
  const printLock = useRef(false)
  const autoPrinted = useRef(false)

  const printCss = useMemo(
    () => `${getBillPrintCss()}${getPrintBarCss()}`,
    [],
  )

  useEffect(() => {
    document.title = `Bill ${billNumber}`
    billingAPI.show(billNumber)
      .then(r => setData(r.data.data))
      .catch(e => setError(e.response?.data?.message || 'Bill not found.'))
  }, [billNumber])

  useEffect(() => {
    if (!data) {
      setPageReady(false)
      return
    }
    setPageReady(false)
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setPageReady(true))
    })
    return () => cancelAnimationFrame(id)
  }, [data])

  const runPrint = async () => {
    if (!data || !pageReady || printLock.current) return
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
    if (!data || !pageReady || !shouldAutoPrint() || autoPrinted.current) return
    autoPrinted.current = true
    runPrint()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, pageReady])

  if (error) {
    return <div style={{ padding: 24, textAlign: 'center' }}><p style={{ color: 'red' }}>{error}</p></div>
  }
  if (!data) {
    return <div style={{ padding: 24, textAlign: 'center' }}><p>Loading bill…</p></div>
  }

  const settings = data.settings || {}

  return (
    <>
      <style>{printCss}</style>
      <div className="wrap print-preview-root">
        <button type="button" className="back-link no-print" onClick={() => navigate(-1)}>← Wapas jao</button>
        <BillReceipt bill={data} settings={settings} />
        <div style={{ height: 120 }} className="no-print" />
      </div>
      <div className="print-bar no-print">
        <button type="button" className="print-btn" onClick={runPrint} disabled={printing || !pageReady}>
          {printing ? 'Printing…' : '🖨 PRINT BILL'}
        </button>
      </div>
    </>
  )
}
