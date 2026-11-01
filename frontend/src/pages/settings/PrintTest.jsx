import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  isAndroidDevice,
  runPrintDiagnostics,
  testDirectPrint,
  checkLanPrinter,
} from '../../utils/thermalPrint'
import Spinner from '../../components/ui/Spinner'

function StatusRow({ label, status, detail }) {
  const colors = {
    ok: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    warn: 'bg-amber-50 border-amber-200 text-amber-800',
    fail: 'bg-red-50 border-red-200 text-red-800',
    pending: 'bg-surface-50 border-surface-200 text-surface-600',
  }
  const icons = { ok: '✓', warn: '!', fail: '✗', pending: '…' }
  return (
    <div className={`flex items-start gap-3 rounded-xl border p-4 ${colors[status]}`}>
      <span className="text-lg font-bold w-6 text-center shrink-0">{icons[status]}</span>
      <div className="min-w-0">
        <p className="font-semibold text-sm">{label}</p>
        {detail && <p className="text-xs mt-1 opacity-90">{detail}</p>}
      </div>
    </div>
  )
}

export default function PrintTest() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [diag, setDiag] = useState(null)
  const [lanStatus, setLanStatus] = useState(null)
  const [testing, setTesting] = useState(false)

  const runDiagnostics = useCallback(async () => {
    const [d, lan] = await Promise.all([
      runPrintDiagnostics(),
      checkLanPrinter().catch(() => ({ ok: false, message: 'Could not reach server printer.' })),
    ])
    setDiag(d)
    setLanStatus(lan)
  }, [])

  useEffect(() => {
    runDiagnostics().finally(() => setLoading(false))
  }, [runDiagnostics])

  const openTest = type => {
    navigate(`/print/test/${type}?auto=1`)
  }

  const handleDirectTest = async type => {
    setTesting(true)
    try {
      const result = await testDirectPrint(type)
      if (result.ok && result.method !== 'browser') {
        toast.success(result.message || 'Print sent!')
      } else {
        openTest(type)
      }
    } catch (e) {
      toast.error(e.message || 'Failed.')
      openTest(type)
    } finally {
      setTesting(false)
    }
  }

  const posReady = diag?.cleanter?.ok || !!diag?.bridge
  const isAndroid = diag?.android

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>

  return (
    <div className="max-w-3xl">
      <div className="page-header">
        <div>
          <Link to="/settings" className="text-sm text-brand-600 hover:underline mb-1 inline-block">← Settings</Link>
          <h1 className="page-title">Printer Test</h1>
          <p className="text-sm text-surface-500 mt-1">
            Same WiFi / LAN par printer connected ho to yahan se test karo.
          </p>
        </div>
        <button onClick={runDiagnostics} className="btn-secondary btn btn-sm">Re-check</button>
      </div>

      <div className="card p-6 mb-5 border-brand-300 bg-brand-50">
        <h2 className="font-display font-bold text-surface-900 text-lg mb-2">
          Print Test
        </h2>
        <p className="text-sm text-surface-600 mb-4">
          Neeche button dabao → print page khulegi → <strong>PRINT</strong> dabao → apna printer choose karo.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button onClick={() => openTest('kot')} className="btn-primary btn btn-lg justify-center">
            Test KOT Print
          </button>
          <button onClick={() => openTest('bill')} className="btn-primary btn btn-lg justify-center">
            Test Bill Print
          </button>
        </div>
      </div>

      <div className="card p-6 mb-5">
        <h2 className="font-display font-bold text-surface-900 text-lg mb-4">System Check</h2>
        <div className="space-y-3">
          <StatusRow
            label="LAN printer (server)"
            status={lanStatus?.ok || lanStatus?.reachable ? 'ok' : 'warn'}
            detail={lanStatus?.ok || lanStatus?.reachable
              ? (lanStatus.message || 'Server se printer reachable hai — bill/KOT LAN se print ho sakta hai')
              : (lanStatus?.message || 'Server printer abhi connect nahi — browser print use hoga')}
          />
          <StatusRow
            label="Browser print"
            status="ok"
            detail="Print dialog se apna printer choose karo (default printer set karo to seedha print hoga)"
          />
          <StatusRow
            label="Built-in POS bridge"
            status={diag?.bridge ? 'ok' : isAndroid ? 'warn' : 'ok'}
            detail={diag?.bridge
              ? `${diag.bridge.name} detected`
              : isAndroid ? 'Bridge nahi mila — browser print use karo' : 'Desktop: browser / LAN print use karo'}
          />
        </div>
      </div>

      {isAndroid && posReady && (
        <div className="card p-6 mb-5">
          <h2 className="font-display font-bold text-surface-900 text-lg mb-2">Direct Print (Built-in)</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={() => handleDirectTest('kot')}
              disabled={testing}
              className="btn-primary btn btn-lg justify-center bg-emerald-600 hover:bg-emerald-700"
            >
              {testing ? '…' : 'Direct Test KOT'}
            </button>
            <button
              onClick={() => handleDirectTest('bill')}
              disabled={testing}
              className="btn-primary btn btn-lg justify-center bg-emerald-600 hover:bg-emerald-700"
            >
              {testing ? '…' : 'Direct Test Bill'}
            </button>
          </div>
        </div>
      )}

      <div className="card p-6 bg-surface-50">
        <h2 className="font-display font-bold text-surface-900 text-lg mb-3">Setup (ek baar)</h2>
        <ol className="text-sm text-surface-700 space-y-2 list-decimal list-inside">
          <li>Printer aur laptop <strong>same WiFi / LAN</strong> par hon</li>
          <li>Windows mein printer add karo aur <strong>Default</strong> set karo</li>
          <li>Software se order/bill banao → <strong>Print</strong> dabao</li>
        </ol>
      </div>
    </div>
  )
}
