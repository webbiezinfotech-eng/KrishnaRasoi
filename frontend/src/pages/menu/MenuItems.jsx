import { useState, useEffect } from 'react'
import { menuAPI, categoryAPI } from '../../services/api'
import Modal from '../../components/ui/Modal'
import ConfirmModal from '../../components/ui/ConfirmModal'
import EmptyState from '../../components/ui/EmptyState'
import Spinner from '../../components/ui/Spinner'
import { formatCurrency } from '../../utils/format'
import Pagination from '../../components/ui/Pagination'
import toast from 'react-hot-toast'

const EMPTY = { category_id: '', name: '', description: '', restaurant_price: '', guest_house_price: '', sort_order: 0, is_active: 1 }

export default function MenuItems() {
  const [items, setItems]     = useState([])
  const [cats, setCats]       = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState(false)
  const [delModal, setDelModal] = useState(null)
  const [editing, setEditing] = useState(null)
  const [form, setForm]       = useState(EMPTY)
  const [saving, setSaving]   = useState(false)
  const [filterCat, setFilterCat] = useState('')
  const [search, setSearch]   = useState('')
  const [page, setPage] = useState(1)
  const perPage = 10

  const load = () => {
    Promise.all([menuAPI.list({ all: 1 }), categoryAPI.list({ all: 1 })]).then(([items, cats]) => {
      setItems(items.data.data); setCats(cats.data.data); setLoading(false)
    })
  }
  useEffect(() => { load() }, [])

  const openCreate = () => { setEditing(null); setForm({ ...EMPTY, category_id: cats[0]?.id || '' }); setModal(true) }
  const openEdit = item => { setEditing(item); setForm({ category_id: item.category_id, name: item.name, description: item.description || '', restaurant_price: item.restaurant_price, guest_house_price: item.guest_house_price, sort_order: item.sort_order, is_active: item.is_active }); setModal(true) }

  const handleSave = async () => {
    if (!form.name || !form.category_id || !form.restaurant_price || !form.guest_house_price) { toast.error('Fill all required fields.'); return }
    setSaving(true)
    try {
      if (editing) { await menuAPI.update(editing.id, form); toast.success('Item updated.') }
      else { await menuAPI.create(form); toast.success('Item created.') }
      setModal(false); load()
    } catch(e) { toast.error(e.response?.data?.message || 'Failed.') }
    finally { setSaving(false) }
  }

  const handleDeactivate = async () => {
    setSaving(true)
    try { await menuAPI.delete(delModal.id); toast.success('Item deactivated.'); setDelModal(null); load() }
    catch(e) { toast.error('Failed.') }
    finally { setSaving(false) }
  }

  const filtered = items.filter(i =>
    (!filterCat || i.category_id == filterCat) &&
    (!search || i.name.toLowerCase().includes(search.toLowerCase()))
  )
  useEffect(() => { setPage(1) }, [search, filterCat, items.length])
  const pages = Math.max(1, Math.ceil(filtered.length / perPage))
  const pagedItems = filtered.slice((page - 1) * perPage, page * perPage)

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Menu Items</h1>
        <button onClick={openCreate} className="btn-primary btn">+ Add Item</button>
      </div>

      <div className="flex gap-3 mb-5 flex-wrap">
        <input className="input w-full sm:w-56" placeholder="Search items..." value={search} onChange={e => setSearch(e.target.value)} />
        <select className="input w-full sm:w-44" value={filterCat} onChange={e => setFilterCat(e.target.value)}>
          <option value="">All Categories</option>
          {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {loading ? <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      : filtered.length === 0
        ? <EmptyState icon="≡" title="No items found" />
        : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
            <table className="table-auto">
              <thead><tr>
                <th className="th">Name</th><th className="th">Category</th>
                <th className="th text-right">Restaurant Price</th><th className="th text-right">Guest House Price</th>
                <th className="th">Status</th><th className="th">Actions</th>
              </tr></thead>
              <tbody>
                {pagedItems.map(item => (
                  <tr key={item.id} className={`hover:bg-surface-50 ${!item.is_active ? 'opacity-50' : ''}`}>
                    <td className="td font-medium">{item.name}</td>
                    <td className="td text-sm text-surface-500">{item.category_name}</td>
                    <td className="td text-right font-medium text-brand-600">{formatCurrency(item.restaurant_price)}</td>
                    <td className="td text-right font-medium text-purple-600">{formatCurrency(item.guest_house_price)}</td>
                    <td className="td"><span className={`badge ${item.is_active ? 'badge-green' : 'badge-red'}`}>{item.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td className="td">
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(item)} className="btn-secondary btn btn-sm">Edit</button>
                        {item.is_active && <button onClick={() => setDelModal(item)} className="btn-secondary btn btn-sm text-red-500">Deactivate</button>}
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

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Menu Item' : 'New Menu Item'} size="md">
        <div className="space-y-4">
          <div className="form-group"><label className="label">Category *</label>
            <select className="input" value={form.category_id} onChange={e => setForm(p => ({...p, category_id: e.target.value}))}>
              <option value="">Select category</option>
              {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></div>
          <div className="form-group"><label className="label">Item Name *</label>
            <input className="input" value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} /></div>
          <div className="form-group"><label className="label">Description</label>
            <textarea className="input" rows={2} value={form.description} onChange={e => setForm(p => ({...p, description: e.target.value}))} /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="form-group"><label className="label">Restaurant Price (₹) *</label>
              <input className="input" type="number" step="0.01" value={form.restaurant_price} onChange={e => setForm(p => ({...p, restaurant_price: e.target.value}))} /></div>
            <div className="form-group"><label className="label">Guest House Price (₹) *</label>
              <input className="input" type="number" step="0.01" value={form.guest_house_price} onChange={e => setForm(p => ({...p, guest_house_price: e.target.value}))} /></div>
          </div>
          {editing && <div className="form-group"><label className="label">Status</label>
            <select className="input" value={form.is_active} onChange={e => setForm(p => ({...p, is_active: parseInt(e.target.value)}))}>
              <option value={1}>Active</option><option value={0}>Inactive</option>
            </select></div>}
          <div className="flex gap-3 justify-end pt-2">
            <button onClick={() => setModal(false)} className="btn-secondary btn" disabled={saving}>Cancel</button>
            <button onClick={handleSave} className="btn-primary btn" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </Modal>

      <ConfirmModal open={!!delModal} onClose={() => setDelModal(null)} onConfirm={handleDeactivate}
        title="Deactivate Item" message={`Deactivate "${delModal?.name}"? It will no longer appear on new orders.`}
        confirmLabel="Deactivate" danger loading={saving} />
    </div>
  )
}
