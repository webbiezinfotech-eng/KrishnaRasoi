export default function Pagination({ page, pages, onPage }) {
  if (pages <= 1) return null
  return (
    <div className="flex items-center gap-2 justify-end mt-4">
      <button onClick={() => onPage(page - 1)} disabled={page <= 1} className="btn btn-secondary btn-sm">‹ Prev</button>
      <span className="text-sm text-surface-500">Page {page} of {pages}</span>
      <button onClick={() => onPage(page + 1)} disabled={page >= pages} className="btn btn-secondary btn-sm">Next ›</button>
    </div>
  )
}
