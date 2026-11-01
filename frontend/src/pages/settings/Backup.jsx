import { useEffect, useRef, useState } from 'react'
import { backupAPI } from '../../services/api'
import Spinner from '../../components/ui/Spinner'
import toast from 'react-hot-toast'

/**
 * One-click Backup + Restore.
 * Export: poora database .sql file me download (shared hosting par bhi chalta hai,
 * kyunki mysqldump ki zaroorat nahi — PHP se generate hota hai).
 * Restore: .sql file upload karke wapas import.
 */
export default function Backup() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [confirmRestore, setConfirmRestore] = useState(false)
  const fileRef = useRef(null)

  const load = () => {
    setLoading(true)
    backupAPI.stats()
      .then(r => setStats(r.data.data))
      .catch(e => toast.error(e.response?.data?.message || 'Backup info load nahi hui.'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const download = () => {
    const token = localStorage.getItem('auth_token') || ''
    const url = `${backupAPI.exportUrl()}?token=${encodeURIComponent(token)}`
    window.location.href = url
    toast.success('Backup download shuru — file save karein.')
  }

  const onRestore = async () => {
    const file = fileRef.current?.files?.[0]
    if (!file) { toast.error('Pehle .sql backup file chunein.'); return }
    if (!confirmRestore) { setConfirmRestore(true); return }
    setImporting(true)
    try {
      const r = await backupAPI.import(file)
      toast.success(r.data?.message || 'Restore ho gaya.')
      const errs = r.data?.data?.errors || []
      if (errs.length) console.warn('Restore warnings:', errs)
      setConfirmRestore(false)
      if (fileRef.current) fileRef.current.value = ''
      load()
    } catch (e) {
      toast.error(e.response?.data?.message || 'Restore fail ho gaya.')
    } finally { setImporting(false) }
  }

  const totalRows = (stats?.tables || []).reduce((a, t) => a + Number(t.rows || 0), 0)

  return (
    <div className="max-w-4xl space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Backup &amp; Restore</h1>
          <p className="page-sub">Poora database ek click me download karein — restore bhi wahin se.</p>
        </div>
        <button className="btn-secondary btn" onClick={load}>↻ Refresh</button>
      </div>

      <div className="card p-6">
        <h2 className="font-display font-bold text-surface-900 text-lg mb-1">One-click Backup</h2>
        <p className="text-sm text-surface-500 mb-4">
          Saare tables (guest, bills, orders, settings, users) ek .sql file me. Isko apne computer ya
          Google Drive me rakhein — problem aane par yahin se restore ho jayega.
        </p>
        {loading ? <Spinner /> : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className="rounded-lg border border-surface-200 p-3">
                <p className="text-xs text-surface-500">Database</p>
                <p className="font-semibold text-sm break-all">{stats?.db_name || '-'}</p>
              </div>
              <div className="rounded-lg border border-surface-200 p-3">
                <p className="text-xs text-surface-500">Tables</p>
                <p className="font-semibold text-sm">{stats?.tables?.length || 0}</p>
              </div>
              <div className="rounded-lg border border-surface-200 p-3">
                <p className="text-xs text-surface-500">Total Rows</p>
                <p className="font-semibold text-sm">{totalRows}</p>
              </div>
              <div className="rounded-lg border border-surface-200 p-3">
                <p className="text-xs text-surface-500">PHP</p>
                <p className="font-semibold text-sm">{stats?.php_version || '-'}</p>
              </div>
            </div>
            <button className="btn-primary btn" onClick={download}>⬇ Download Backup (.sql)</button>
            <div className="mt-4 max-h-56 overflow-y-auto rounded-lg border border-surface-200">
              <table className="w-full text-sm">
                <thead><tr className="bg-surface-50 text-left text-surface-500">
                  <th className="px-3 py-2 font-medium">Table</th><th className="px-3 py-2 font-medium text-right">Rows</th>
                </tr></thead>
                <tbody>
                  {(stats?.tables || []).map(t => (
                    <tr key={t.table} className="border-t border-surface-100">
                      <td className="px-3 py-1.5 font-mono text-xs">{t.table}</td>
                      <td className="px-3 py-1.5 text-right">{t.rows}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="card p-6">
        <h2 className="font-display font-bold text-surface-900 text-lg mb-1">Restore Backup</h2>
        <p className="text-sm text-surface-500 mb-3">
          Pehle wala backup .sql file upload karein. <strong>Dhyan:</strong> restore purana data replace kar
          sakta hai — pehle current backup download kar lein.
        </p>
        <input ref={fileRef} type="file" accept=".sql,application/sql,text/plain"
          className="input mb-3" onChange={() => setConfirmRestore(false)} />
        {confirmRestore && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            Confirm karein — restore se existing data overwrite ho sakta hai.
          </div>
        )}
        <button className="btn-primary btn" onClick={onRestore} disabled={importing}>
          {importing ? 'Restoring…' : confirmRestore ? 'Confirm Restore' : 'Restore Backup'}
        </button>
      </div>
    </div>
  )
}
