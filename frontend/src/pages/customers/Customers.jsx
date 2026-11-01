import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { customerAPI, messagingAPI } from '../../services/api'
import Modal from '../../components/ui/Modal'
import ConfirmModal from '../../components/ui/ConfirmModal'
import EmptyState from '../../components/ui/EmptyState'
import Spinner from '../../components/ui/Spinner'
import Pagination from '../../components/ui/Pagination'
import toast from 'react-hot-toast'
import { applyMessageName, newIdempotencyKey } from '../../utils/messagePreview'

const todayStr = new Date().toISOString().slice(0, 10)
const EMPTY = { name: '', mobile_number: '', contact_type: 'CUSTOMER', is_active: true, whatsapp_opt_in: true, sms_opt_in: true }
const TYPE_LABEL = { CUSTOMER: 'Customer', GUEST_HOUSE: 'Guest House', OTHER: 'Other' }

export default function Customers() {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [testing, setTesting] = useState(false)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState(() => new Set())
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [delRow, setDelRow] = useState(null)
  const [composer, setComposer] = useState(false)
  const [message, setMessage] = useState('')
  const [confirm, setConfirm] = useState(null)
  const [sending, setSending] = useState(false)
  const [config, setConfig] = useState(null)
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey)
  const [templates, setTemplates] = useState([])
  const [budget, setBudget] = useState(null)
  const [guestFrom, setGuestFrom] = useState(todayStr)
  const [guestTo, setGuestTo] = useState(todayStr)
  const [guestMode, setGuestMode] = useState('checkin')
  const [guestList, setGuestList] = useState([])
  const [guestLoading, setGuestLoading] = useState(false)

  const perPage = 50

  const load = (p = page, q = search, type = typeFilter) => {
    setLoading(true)
    customerAPI.list({ page: p, limit: perPage, q, contact_type: type || undefined }).then(r => {
      setRows(r.data.data.customers || [])
      setPagination(r.data.data.pagination || { page: 1, pages: 1, total: 0 })
    }).catch(e => toast.error(e.response?.data?.message || 'Failed to load customers.'))
      .finally(() => setLoading(false))
  }

  const searchReady = useRef(false)
  useEffect(() => { load(1, '') }, [])
  useEffect(() => {
    messagingAPI.config().then(r => setConfig(r.data.data)).catch(() => {})
    messagingAPI.localTemplates().then(r => setTemplates(r.data.data?.templates || [])).catch(() => {})
    messagingAPI.budget().then(r => setBudget(r.data.data)).catch(() => {})
  }, [])

  useEffect(() => {
    if (!searchReady.current) {
      searchReady.current = true
      return
    }
    const t = setTimeout(() => {
      const q = searchInput.trim()
      setSearch(q)
      setPage(1)
      setSelected(new Set())
      load(1, q, typeFilter)
    }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput])

  const selectedCount = selected.size
  const allMatchingSelected = pagination.total > 0 && selectedCount === pagination.total
  const someSelected = selectedCount > 0

  const toggleOne = id => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = async () => {
    if (allMatchingSelected) {
      clearSelection()
      return
    }
    await selectAllMatching()
  }

  const selectAllMatching = async () => {
    try {
      const r = await customerAPI.ids({ q: search, contact_type: typeFilter || undefined })
      const ids = r.data.data.ids || []
      setSelected(new Set(ids))
      toast.success(`Selected ${ids.length} customer${ids.length === 1 ? '' : 's'}.`)
    } catch (e) {
      toast.error(e.response?.data?.message || 'Could not select all customers.')
    }
  }

  const clearSelection = () => setSelected(new Set())

  const changePage = p => {
    setPage(p)
    load(p, search, typeFilter)
  }

  const changeType = t => {
    setTypeFilter(t)
    setPage(1)
    setSelected(new Set())
    load(1, search, t)
  }

  const openCreate = () => { setEditing(null); setForm(EMPTY); setModal(true) }
  const openEdit = row => {
    setEditing(row)
    setForm({
      name: row.name || '',
      mobile_number: row.mobile_number || '',
      contact_type: row.contact_type || 'CUSTOMER',
      is_active: row.is_active !== false,
      whatsapp_opt_in: !!row.whatsapp_opt_in,
      sms_opt_in: !!row.sms_opt_in,
    })
    setModal(true)
  }

  const handleSave = async () => {
    if (!form.mobile_number.trim()) { toast.error('Mobile number is required.'); return }
    setSaving(true)
    try {
      if (editing) {
        await customerAPI.update(editing.id, form)
        toast.success('Customer updated.')
      } else {
        await customerAPI.create(form)
        toast.success('Customer saved.')
      }
      setModal(false)
      load(page, search)
    } catch (e) {
      toast.error(e.response?.data?.message || Object.values(e.response?.data?.errors || {}).flat()?.[0] || 'Failed.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!delRow) return
    setSaving(true)
    try {
      await customerAPI.delete(delRow.id)
      toast.success('Customer deleted.')
      setSelected(prev => { const n = new Set(prev); n.delete(delRow.id); return n })
      setDelRow(null)
      load(page, search)
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed.')
    } finally {
      setSaving(false)
    }
  }

  const firstSelected = rows.find(r => selected.has(r.id))
  const previewText = applyMessageName(message, firstSelected?.name)

  const openConfirm = channel => {
    if (!message.trim()) { toast.error('Write a message first.'); return }
    if (selectedCount === 0) { toast.error('Select at least one customer.'); return }
    setConfirm(channel)
  }

  const handleSend = async () => {
    if (!confirm || sending) return
    setSending(true)
    try {
      const created = await messagingAPI.createCampaign({
        channel: confirm,
        message_body: message.trim(),
        customer_ids: [...selected],
        select_all: false,
        search,
        idempotency_key: idempotencyKey,
      })
      const campaign = created.data.data
      const sent = await messagingAPI.sendCampaign(campaign.id)
      const payload = sent.data?.data || {}
      const summary = payload.summary
      const failed = Number(summary?.failed || 0)
      const sentCount = Number(summary?.sent || 0)
      if (payload.success === false || (failed > 0 && sentCount === 0)) {
        toast.error(payload.message || sent.data?.message || 'Message was not delivered.')
      } else {
        toast.success(payload.message || sent.data?.message || 'WhatsApp sent.')
      }
      if (summary) {
        toast[failed > 0 && sentCount === 0 ? 'error' : 'success'](
          `Result: ${sentCount} sent, ${failed} failed.`
        )
      }
      setConfirm(null)
      setComposer(false)
      setMessage('')
      setSelected(new Set())
      setIdempotencyKey(newIdempotencyKey())
      navigate(`/customers/campaigns/${campaign.id}`)
    } catch (e) {
      toast.error(e.response?.data?.message || e.message || 'Failed to queue message.')
    } finally {
      setSending(false)
    }
  }

  const handleTestWhatsApp = async () => {
    if (testing) return
    setTesting(true)
    try {
      const r = await messagingAPI.testWhatsApp({
        message: message.trim() || 'Krishna Rasoi Restaurant WhatsApp integration test message.',
      })
      toast.success(r.data.message || 'Test WhatsApp sent to the configured test number.')
    } catch (e) {
      toast.error(e.response?.data?.message || 'Test WhatsApp failed.')
    } finally {
      setTesting(false)
    }
  }

  const toggleGuest = id => setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const selectAllGuests = () => setSelected(prev => { const n = new Set(prev); guestList.forEach(g => { if (g.customer_id) n.add(g.customer_id) }); return n })
  const loadGuestsByDate = async () => {
    setGuestLoading(true)
    try {
      const r = await customerAPI.byDate({ from_date: guestFrom, to_date: guestTo, mode: guestMode })
      const list = r.data.data.guests || []
      setGuestList(list)
      if (!list.length) toast.error('Is date range me koi guest nahi mila.')
      else toast.success(`${list.length} guest mile — checkbox se select karein.`)
    } catch (e) {
      toast.error(e.response?.data?.message || 'Guest list load nahi hui.')
    } finally { setGuestLoading(false) }
  }

  const isMock = (config?.mode || 'mock') === 'mock'

  return (
    <div className={selectedCount > 0 ? 'pb-24 lg:pb-0' : ''}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Customers</h1>
          <p className="page-sub">Customers + WhatsApp ek jagah — template chunein, date-wise guests select karein, send karein.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleTestWhatsApp} className="btn-secondary btn" disabled={testing}>
            {testing ? 'Testing…' : 'Send test WhatsApp'}
          </button>
          <button onClick={() => navigate('/customers/campaigns')} className="btn-secondary btn">Message History</button>
          <button onClick={openCreate} className="btn-primary btn">+ Add Customer</button>
        </div>
      </div>

      {isMock && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>DEVELOPMENT / MOCK MODE</strong>
          <span className="ml-1">— messages are queued for testing and are not sent on WhatsApp or SMS.</span>
        </div>
      )}
      {!isMock && (
        <div className="mb-4 rounded-xl border border-surface-200 bg-surface-50 px-4 py-3 text-sm text-surface-700">
          Contacts stay in this software. WhatsApp is sent from your Zaptilo account to the numbers you select here. You do not add those numbers in Zaptilo.
        </div>
      )}

      {budget && (Number(budget.budget) > 0 || Number(budget.spent) > 0) && (
        <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${budget.over_budget ? 'border-red-300 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
          <strong>WhatsApp {budget.month}:</strong>
          {' '}Budget Rs {Number(budget.budget).toFixed(0)} / Spent Rs {Number(budget.spent).toFixed(2)}
          {budget.remaining !== null && <> / Left Rs {Number(budget.remaining).toFixed(2)}</>}
          {' '}/ {budget.sent_this_month} sent
          {budget.usage_percent !== null && <> ({budget.usage_percent}%)</>}
        </div>
      )}

      {/* Date-wise guest audience — Kripa Shanti ke guests ko WhatsApp bhejne ke liye */}
      <div className="card p-4 mb-4">
        <p className="text-sm font-semibold text-surface-900 mb-2">Date-wise guests (Kripa Shanti)</p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="form-group mb-0"><label className="label">From Date</label>
            <input type="date" className="input" value={guestFrom} onChange={e => setGuestFrom(e.target.value)} /></div>
          <div className="form-group mb-0"><label className="label">To Date</label>
            <input type="date" className="input" value={guestTo} onChange={e => setGuestTo(e.target.value)} /></div>
          <div className="form-group mb-0"><label className="label">Filter by</label>
            <select className="select" value={guestMode} onChange={e => setGuestMode(e.target.value)}>
              <option value="checkin">Check-in date</option>
              <option value="checkout">Check-out date</option>
              <option value="stay">Booking / stay date</option>
            </select></div>
          <button type="button" className="btn-secondary btn" onClick={loadGuestsByDate} disabled={guestLoading}>
            {guestLoading ? 'Loading…' : 'Load guests'}
          </button>
          {guestList.length > 0 && (
            <button type="button" className="btn-primary btn" onClick={selectAllGuests}>Select all {guestList.length}</button>
          )}
        </div>
        {guestList.length > 0 && (
          <div className="mt-3 max-h-56 overflow-y-auto rounded-lg border border-surface-200 divide-y divide-surface-100">
            {guestList.map(g => (
              <label key={g.customer_id || g.mobile_number} className="flex items-center justify-between gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-surface-50">
                <span className="flex items-center gap-2">
                  <input type="checkbox" className="h-4 w-4 accent-brand-600"
                    checked={g.customer_id ? selected.has(g.customer_id) : false}
                    onChange={() => g.customer_id && toggleGuest(g.customer_id)} />
                  <span className="font-medium text-surface-900">{g.name || 'Guest'}</span>
                  <span className="text-surface-500">{g.mobile_number}</span>
                </span>
                <span className="text-xs text-surface-400">Room {g.room_no} · {g.status} · ₹{Number(g.balance || 0).toFixed(0)} due</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          className="input w-full sm:max-w-xs"
          placeholder="Search name or mobile..."
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
        />
        <select className="input w-full sm:w-44" value={typeFilter} onChange={e => changeType(e.target.value)}>
          <option value="">All types</option>
          <option value="CUSTOMER">Customer</option>
          <option value="GUEST_HOUSE">Guest House</option>
          <option value="OTHER">Other</option>
        </select>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary btn btn-sm" onClick={selectAllMatching}>
            Select All
          </button>
          <button type="button" className="btn-secondary btn btn-sm" onClick={clearSelection} disabled={selectedCount === 0}>
            Clear Selection
          </button>
        </div>
      </div>

      <p className="text-sm text-surface-600 mb-3">
        Selected: <strong>{selectedCount}</strong> customer{selectedCount === 1 ? '' : 's'}
        {pagination.total ? <span className="text-surface-400"> · {pagination.total} total</span> : null}
      </p>

      {loading ? <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      : rows.length === 0
        ? <EmptyState icon="👤" title="No customers yet" message="Add a contact, or they will appear automatically when a guest house booking includes a mobile number." action={<button className="btn-primary btn" onClick={openCreate}>Add Customer</button>} />
        : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="table-auto">
                <thead>
                  <tr>
                    <th className="th w-12">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-brand-600"
                        checked={allMatchingSelected}
                        ref={el => { if (el) el.indeterminate = someSelected && !allMatchingSelected }}
                        onChange={toggleSelectAll}
                        aria-label="Select all"
                      />
                    </th>
                    <th className="th">Name</th>
                    <th className="th">Mobile Number</th>
                    <th className="th hidden sm:table-cell">Type</th>
                    <th className="th hidden sm:table-cell">Consent</th>
                    <th className="th">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={row.id} className={selected.has(row.id) ? 'bg-brand-50/60' : ''}>
                      <td className="td">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-brand-600"
                          checked={selected.has(row.id)}
                          onChange={() => toggleOne(row.id)}
                          aria-label={`Select ${row.name || row.mobile_number}`}
                        />
                      </td>
                      <td className="td font-medium">{row.name || <span className="text-surface-400">—</span>}</td>
                      <td className="td font-mono text-sm">{row.mobile_number}</td>
                      <td className="td hidden sm:table-cell text-sm text-surface-500">{TYPE_LABEL[row.contact_type] || row.contact_type || 'Customer'}</td>
                      <td className="td hidden sm:table-cell">
                        <span className="flex gap-1">
                          {row.whatsapp_opt_in && <span className="badge-green">WhatsApp</span>}
                          {row.sms_opt_in && <span className="badge-blue">SMS</span>}
                          {!row.whatsapp_opt_in && !row.sms_opt_in && <span className="badge-gray">No consent</span>}
                        </span>
                      </td>
                      <td className="td">
                        <div className="flex gap-2">
                          <button onClick={() => openEdit(row)} className="btn-secondary btn btn-sm">Edit</button>
                          <button onClick={() => setDelRow(row)} className="btn-secondary btn btn-sm text-red-500">Deactivate</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      }
      <Pagination page={pagination.page || page} pages={pagination.pages || 1} onPage={changePage} />

      {selectedCount > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-20 lg:static lg:mt-4 border-t lg:border border-surface-200 bg-white lg:rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] lg:shadow-none">
          <p className="text-sm font-medium text-surface-800">Selected: {selectedCount} customers</p>
          <button className="btn-primary btn w-full sm:w-auto sm:ml-auto" onClick={() => setComposer(true)}>Write Message</button>
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Customer' : 'Add Customer'} size="md">
        <div className="space-y-4">
          <div className="form-group">
            <label className="label">Name</label>
            <input className="input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Optional" />
          </div>
          <div className="form-group">
            <label className="label">Mobile Number *</label>
            <input className="input" value={form.mobile_number} onChange={e => setForm(p => ({ ...p, mobile_number: e.target.value }))} placeholder="98XXXXXXXX" />
          </div>
          <div className="form-group">
            <label className="label">Type</label>
            <select className="input" value={form.contact_type} onChange={e => setForm(p => ({ ...p, contact_type: e.target.value }))}>
              <option value="CUSTOMER">Customer</option>
              <option value="GUEST_HOUSE">Guest House</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-surface-700">
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={form.whatsapp_opt_in} onChange={e => setForm(p => ({ ...p, whatsapp_opt_in: e.target.checked }))} />
            WhatsApp marketing consent
          </label>
          <label className="flex items-center gap-2 text-sm text-surface-700">
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={form.sms_opt_in} onChange={e => setForm(p => ({ ...p, sms_opt_in: e.target.checked }))} />
            SMS marketing consent
          </label>
          <div className="flex gap-3 justify-end pt-2">
            <button onClick={() => setModal(false)} className="btn-secondary btn" disabled={saving}>Cancel</button>
            <button onClick={handleSave} className="btn-primary btn" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={!!delRow}
        onClose={() => setDelRow(null)}
        onConfirm={handleDelete}
        title="Deactivate Customer"
        message={`Deactivate ${delRow?.name || delRow?.mobile_number}? They will be hidden from lists and skipped when sending.`}
        confirmLabel="Deactivate"
        danger
        loading={saving}
      />

      <Modal open={composer} onClose={() => setComposer(false)} title="Write Message" size="lg">
        <div className="space-y-4">
          {isMock && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 font-semibold">
              DEVELOPMENT / MOCK MODE
            </div>
          )}
          {templates.length > 0 && (
            <div className="form-group">
              <label className="label">Use a saved template</label>
              <div className="flex flex-wrap gap-2">
                {templates.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    className={`btn btn-sm ${message.trim() === String(t.body).trim() ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setMessage(t.body)}
                    title={t.body}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
              <p className="text-xs text-surface-400">Tip: templates support {'{{name}}'} — customer name is filled automatically for each recipient.</p>
            </div>
          )}
          <div className="form-group">
            <label className="label">Message</label>
            <textarea
              className="textarea min-h-[160px] sm:min-h-[200px]"
              rows={8}
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder={'Hi {{name}},\n\nWrite your message here.'}
            />
            <p className="text-xs text-surface-400">Optional placeholder: {'{{name}}'} — replaced with the saved customer name.</p>
          </div>
          {message.trim() && (
            <div className="rounded-lg border border-surface-200 bg-surface-50 p-3">
              <p className="text-xs font-semibold text-surface-500 uppercase tracking-wide mb-1">Preview</p>
              <pre className="whitespace-pre-wrap text-sm text-surface-800 font-sans">{previewText}</pre>
            </div>
          )}
          <p className="text-sm text-surface-600">Selected customers: <strong>{selectedCount}</strong></p>
          <div className="flex flex-col sm:flex-row gap-3">
            <button type="button" className="btn-primary btn w-full sm:flex-1" onClick={() => openConfirm('whatsapp')}>WhatsApp</button>
            <button type="button" className="btn-secondary btn w-full sm:flex-1" onClick={() => openConfirm('sms')}>SMS</button>
          </div>
        </div>
      </Modal>

      <Modal open={!!confirm} onClose={() => !sending && setConfirm(null)} title="Confirm & Send" size="md">
        <div className="space-y-4">
          {isMock && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 font-semibold">
              DEVELOPMENT / MOCK MODE — messages will not be delivered
            </div>
          )}
          <p className="text-sm text-surface-700">
            You are about to send this WhatsApp/SMS message to <strong>{selectedCount} contacts</strong>. Continue?
          </p>
          <p className="text-sm text-surface-700">
            Channel: <strong>{confirm === 'sms' ? 'SMS' : 'WhatsApp'}</strong>
          </p>
          <div className="rounded-lg border border-surface-200 bg-surface-50 p-3">
            <p className="text-xs font-semibold text-surface-500 uppercase tracking-wide mb-1">Message preview</p>
            <pre className="whitespace-pre-wrap text-sm text-surface-800 font-sans">{previewText}</pre>
          </div>
          <div className="flex flex-col-reverse sm:flex-row gap-3 justify-end pt-1">
            <button className="btn-secondary btn w-full sm:w-auto" disabled={sending} onClick={() => setConfirm(null)}>Cancel</button>
            <button className="btn-primary btn w-full sm:w-auto" disabled={sending} onClick={handleSend}>
              {sending ? 'Queuing…' : 'Confirm & Send'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
