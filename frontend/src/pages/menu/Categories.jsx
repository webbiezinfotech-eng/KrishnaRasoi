import { useState, useEffect } from 'react'
import { categoryAPI } from '../../services/api'
import Modal from '../../components/ui/Modal'
import ConfirmModal from '../../components/ui/ConfirmModal'
import EmptyState from '../../components/ui/EmptyState'
import StatusBadge from '../../components/ui/StatusBadge'
import Spinner from '../../components/ui/Spinner'
import Pagination from '../../components/ui/Pagination'
import toast from 'react-hot-toast'

const EMPTY_FORM = { name: '', description: '', sort_order: 0, is_active: 1 }

export default function Categories() {
  const [cats, setCats]       = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState(false)
  const [delModal, setDelModal] = useState(null)
  const [editing, setEditing] = useState(null)
  const [form, setForm]       = useState(EMPTY_FORM)
  const [saving, setSaving]   = useState(false)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const perPage = 10

  const load = () => categoryAPI.list({ all: 1 }).then(r => { setCats(r.data.data); setLoading(false) })
  useEffect(() => { load() }, [])
  const filteredCats = cats.filter(c => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return String(c.name || '').toLowerCase().includes(q)
      || String(c.description || '').toLowerCase().includes(q)
  })
  useEffect(() => { setPage(1) }, [filteredCats.length, search])
  const pages = Math.max(1, Math.ceil(filteredCats.length / perPage))
  const pagedCats = filteredCats.slice((page - 1) * perPage, page * perPage)

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setModal(true) }
  const openEdit   = c => { setEditing(c); setForm({ name: c.name, description: c.description || '', sort_order: c.sort_order, is_active: c.is_active }); setModal(true) }

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Category name is required.'); return }
    setSaving(true)
    try {
      if (editing) {
        await categoryAPI.update(editing.id, form)
        toast.success('Category updated.')
      } else {
        await categoryAPI.create(form)
        toast.success('Category created.')
      }
      setModal(false); load()
    } catch(e) { toast.error(e.response?.data?.message || 'Failed.') }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    setSaving(true)
    try { await categoryAPI.delete(delModal.id); toast.success('Category deleted.'); setDelModal(null); load() }
    catch(e) { toast.error(e.response?.data?.message || 'Failed.') }
    finally { setSaving(false) }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Categories</h1>
        <button onClick={openCreate} className="btn-primary btn">+ Add Category</button>
      </div>
      <div className="mb-4">
        <input
          className="input w-full sm:w-80"
          placeholder="Search category name/description..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {loading ? <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      : cats.length === 0
        ? <EmptyState icon="⊟" title="No categories yet" action={<button onClick={openCreate} className="btn-primary btn">Add First Category</button>} />
        : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
            <table className="table-auto">
              <thead><tr>
                <th className="th">Name</th><th className="th">Description</th><th className="th">Sort</th><th className="th">Status</th><th className="th">Actions</th>
              </tr></thead>
              <tbody>
                {pagedCats.map(c => (
                  <tr key={c.id} className="hover:bg-surface-50">
                    <td className="td font-medium">{c.name}</td>
                    <td className="td text-surface-500 text-sm">{c.description || '—'}</td>
                    <td className="td">{c.sort_order}</td>
                    <td className="td"><StatusBadge status={c.is_active ? 'available' : 'cancelled'} /></td>
                    <td className="td">
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(c)} className="btn-secondary btn btn-sm">Edit</button>
                        <button onClick={() => setDelModal(c)} className="btn-secondary btn btn-sm text-red-500">Delete</button>
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
      <Pagination page={page} pages={pages} onPage={setPage} />

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Category' : 'New Category'}>
        <div className="space-y-4">
          <div className="form-group"><label className="label">Name *</label>
            <input className="input" value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} placeholder="e.g. Starters" /></div>
          <div className="form-group"><label className="label">Description</label>
            <textarea className="input" rows={2} value={form.description} onChange={e => setForm(p => ({...p, description: e.target.value}))} /></div>
          <div className="form-group"><label className="label">Sort Order</label>
            <input className="input" type="number" value={form.sort_order} onChange={e => setForm(p => ({...p, sort_order: e.target.value}))} /></div>
          {editing && (
            <div className="form-group"><label className="label">Status</label>
              <select className="input" value={form.is_active} onChange={e => setForm(p => ({...p, is_active: parseInt(e.target.value)}))}>
                <option value={1}>Active</option><option value={0}>Inactive</option>
              </select></div>
          )}
          <div className="flex gap-3 justify-end pt-2">
            <button onClick={() => setModal(false)} className="btn-secondary btn" disabled={saving}>Cancel</button>
            <button onClick={handleSave} className="btn-primary btn" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </Modal>

      <ConfirmModal open={!!delModal} onClose={() => setDelModal(null)} onConfirm={handleDelete}
        title="Delete Category" message={`Delete "${delModal?.name}"? This cannot be undone.`}
        confirmLabel="Delete" danger loading={saving} />
    </div>
  )
}
