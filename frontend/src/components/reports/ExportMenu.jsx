import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { exportReportExcel, exportReportPdf } from '../../utils/reportExport'

export default function ExportMenu({ exportContext, disabled = false }) {
  const [open, setOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const onDocClick = e => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const handleExport = async format => {
    setOpen(false)
    setExporting(true)
    try {
      if (format === 'excel') exportReportExcel(exportContext)
      else exportReportPdf(exportContext)
      toast.success(`${format === 'excel' ? 'Excel' : 'PDF'} file download ho gayi.`)
    } catch (e) {
      toast.error(e.message || 'Export failed.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        disabled={disabled || exporting}
        className="btn-secondary btn gap-2"
      >
        {exporting ? 'Exporting…' : '⬇ Export'}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 min-w-[160px] rounded-xl border border-surface-200 bg-white shadow-lg py-1">
          <button
            type="button"
            onClick={() => handleExport('excel')}
            className="w-full text-left px-4 py-2.5 text-sm hover:bg-surface-50 flex items-center gap-2"
          >
            <span>📊</span> Excel (.xlsx)
          </button>
          <button
            type="button"
            onClick={() => handleExport('pdf')}
            className="w-full text-left px-4 py-2.5 text-sm hover:bg-surface-50 flex items-center gap-2"
          >
            <span>📄</span> PDF (.pdf)
          </button>
        </div>
      )}
    </div>
  )
}
