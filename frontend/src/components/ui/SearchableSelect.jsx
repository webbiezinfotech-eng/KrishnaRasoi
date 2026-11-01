import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * Compact searchable picker.
 * Optional onSearch(q) = server-side filter (debounced).
 */
export default function SearchableSelect({
  options = [],
  value = '',
  placeholder = 'Search & select…',
  emptyText = 'No results',
  getOptionLabel = o => o.label || o.name || '',
  getOptionValue = o => String(o.id),
  onChange,
  onSearch,
  selectedFallbackLabel = '',
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [remoteOptions, setRemoteOptions] = useState(null)
  const [searching, setSearching] = useState(false)
  const rootRef = useRef(null)
  const inputRef = useRef(null)
  const searchTimer = useRef(null)

  const selected = useMemo(() => {
    const all = remoteOptions || options
    return all.find(o => getOptionValue(o) === String(value))
      || options.find(o => getOptionValue(o) === String(value))
      || null
  }, [options, remoteOptions, value, getOptionValue])

  const list = useMemo(() => {
    if (typeof onSearch === 'function' && remoteOptions) return remoteOptions
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(o => getOptionLabel(o).toLowerCase().includes(q))
  }, [options, remoteOptions, query, getOptionLabel, onSearch])

  useEffect(() => {
    if (!open) return
    const onDoc = e => {
      if (!rootRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  useEffect(() => {
    if (open) {
      setQuery('')
      setRemoteOptions(null)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  useEffect(() => () => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
  }, [])

  const runSearch = q => {
    setQuery(q)
    if (typeof onSearch !== 'function') return
    if (searchTimer.current) clearTimeout(searchTimer.current)
    const trimmed = q.trim()
    if (!trimmed) {
      setRemoteOptions(null)
      setSearching(false)
      return
    }
    setSearching(true)
    searchTimer.current = setTimeout(async () => {
      try {
        const rows = await onSearch(trimmed)
        setRemoteOptions(Array.isArray(rows) ? rows : [])
      } catch {
        setRemoteOptions([])
      } finally {
        setSearching(false)
      }
    }, 250)
  }

  const pick = opt => {
    onChange?.(getOptionValue(opt), opt)
    setOpen(false)
    setQuery('')
    setRemoteOptions(null)
  }

  const buttonLabel = selected
    ? getOptionLabel(selected)
    : (value && selectedFallbackLabel ? selectedFallbackLabel : '')

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="input w-full text-left flex items-center justify-between gap-2"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={`truncate ${buttonLabel ? 'text-surface-900' : 'text-surface-400'}`}>
          {buttonLabel || placeholder}
        </span>
        <span className="text-surface-400 text-xs shrink-0">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="absolute z-40 mt-1 w-full rounded-lg border border-surface-200 bg-white shadow-lg overflow-hidden">
          <div className="p-2 border-b border-surface-100">
            <input
              ref={inputRef}
              className="input w-full"
              placeholder="Type to search…"
              value={query}
              onChange={e => runSearch(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') setOpen(false)
                if (e.key === 'Enter' && list[0]) {
                  e.preventDefault()
                  pick(list[0])
                }
              }}
            />
          </div>
          <ul className="max-h-48 overflow-y-auto py-1" role="listbox">
            {searching ? (
              <li className="px-3 py-2 text-sm text-surface-400">Searching…</li>
            ) : list.length === 0 ? (
              <li className="px-3 py-2 text-sm text-surface-400">{emptyText}</li>
            ) : (
              list.map(opt => {
                const id = getOptionValue(opt)
                const active = id === String(value)
                return (
                  <li key={id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-brand-50 ${
                        active ? 'bg-brand-50 text-brand-700 font-medium' : 'text-surface-800'
                      }`}
                      onClick={() => pick(opt)}
                    >
                      <span className="block truncate">{getOptionLabel(opt)}</span>
                    </button>
                  </li>
                )
              })
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
