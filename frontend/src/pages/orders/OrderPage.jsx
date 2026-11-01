import { useState, useEffect, useCallback } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import { orderAPI, menuAPI, billingAPI, guestHouseAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { formatCurrency, paymentModeLabel } from '../../utils/format'
import StatusBadge from '../../components/ui/StatusBadge'
import Spinner from '../../components/ui/Spinner'
import ConfirmModal from '../../components/ui/ConfirmModal'
import Modal from '../../components/ui/Modal'
import SearchableSelect from '../../components/ui/SearchableSelect'
import toast from 'react-hot-toast'
import { billPrintPath, kotPrintPath } from '../../utils/thermalPrint'

export default function OrderPage() {
  const { type, id } = useParams()
  const location     = useLocation()
  const navigate     = useNavigate()
  const { isWaiter } = useAuth()
  const isNew        = !id && !!type
  const isGuestHouse = !isWaiter && (type === 'guest-house' || false)

  const [order, setOrder]           = useState(null)
  const [menuItems, setMenuItems]   = useState([])
  const [categories, setCategories] = useState([])
  const [selectedCat, setSelectedCat] = useState('all')
  const [search, setSearch]         = useState('')
  const [loading, setLoading]       = useState(true)
  const [billModal, setBillModal]   = useState(false)
  const [cancelModal, setCancelModal] = useState(false)
  const [payMode, setPayMode]       = useState('cash')
  const [billPaymentStatus, setBillPaymentStatus] = useState('paid')
  const [discount, setDiscount]     = useState('0')
  const [commissionInput, setCommissionInput] = useState('0')
  const [guestForm, setGuestForm]   = useState({
    guest_name: '',
    guest_room: '',
    guest_phone: '',
    guest_address: '',
    guest_id_proof: '',
  })
  const [guestCreated, setGuestCreated] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [profiles, setProfiles] = useState([])
  const [profileModal, setProfileModal] = useState(false)
  const [profileForm, setProfileForm] = useState({ name: '', address: '' })
  const [selectedProfileId, setSelectedProfileId] = useState('')
  const [payModal, setPayModal] = useState(false)
  const [settleMode, setSettleMode] = useState('cash')
  const [qtyDrafts, setQtyDrafts] = useState({})

  const loadOrder = useCallback(async orderId => {
    const r = await orderAPI.show(orderId)
    setOrder(r.data.data)
  }, [])

  useEffect(() => {
    menuAPI.list({ active_only: 1 }).then(r => {
      const items = r.data.data
      setMenuItems(items)
      const cats = [...new Set(items.map(i => i.category_name))]
      setCategories(cats)
    })

    if (id) {
      loadOrder(parseInt(id)).finally(() => setLoading(false))
    } else if (type === 'dine-in') {
      // Auto-create dine-in order from table selection
      const { tableId, tableLabel } = location.state || {}
      if (!tableId) { navigate('/tables'); return }
      orderAPI.createDineIn({ table_id: tableId }).then(r => {
        setOrder(r.data.data)
        setLoading(false)
      }).catch(e => { toast.error(e.response?.data?.message || 'Failed.'); navigate('/tables') })
    } else {
      setLoading(false) // guest house: show form first
    }
  }, [id, type])

  useEffect(() => {
    if (!order || !isWaiter) return
    if (order.order_type !== 'dine_in') {
      toast.error('Waiters can only open table orders.')
      navigate('/tables', { replace: true })
    }
  }, [order?.id, order?.order_type, isWaiter, navigate])

  const loadProfiles = async (extra = {}) => {
    const r = await guestHouseAPI.profiles({ _: Date.now(), ...extra })
    const rows = r.data.data || []
    setProfiles(prev => {
      // Keep currently selected / just-saved item even if not in this page of results
      const map = new Map(rows.map(p => [String(p.id), p]))
      prev.forEach(p => {
        const id = String(p.id)
        if (!map.has(id)) map.set(id, p)
      })
      return [...map.values()].sort((a, b) =>
        String(a.name || '').localeCompare(String(b.name || '')),
      )
    })
    return rows
  }

  const searchProfiles = async q => {
    const r = await guestHouseAPI.profiles({ q, _: Date.now() })
    return r.data.data || []
  }

  useEffect(() => {
    if (!isGuestHouse || order) return
    loadProfiles().catch(() => {})
  }, [isGuestHouse, order])

  // Same tab / page wapas aane par list fresh rakho
  useEffect(() => {
    if (!isGuestHouse || order) return
    const refresh = () => { loadProfiles().catch(() => {}) }
    const onVis = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [isGuestHouse, order])

  useEffect(() => {
    if (order?.order_type !== 'guest_house') return
    const currentCommission = parseFloat(order?.commission_amount || 0)
    setCommissionInput(String(Number.isFinite(currentCommission) ? currentCommission : 0))
  }, [order?.id, order?.order_type, order?.commission_amount])

  useEffect(() => {
    if (!order) return
    if (order.order_type === 'guest_house') {
      setPayMode('credit')
      setBillPaymentStatus('unpaid')
      return
    }
    setPayMode('cash')
    setBillPaymentStatus('paid')
  }, [order?.id, order?.order_type])

  const saveProfile = async () => {
    const name = profileForm.name.trim()
    const address = profileForm.address.trim()
    if (!name) {
      toast.error('Guest house name is required.')
      return
    }
    if (!address || address.length < 2) {
      toast.error('Address kam se kam 2 characters hona chahiye.')
      return
    }
    try {
      const r = await guestHouseAPI.createProfile({ name, address })
      const saved = r.data.data
      if (!saved?.id) {
        toast.error('Saved, but profile data missing. Refresh karke dekho.')
        return
      }

      // Turant dropdown mein dikhao (refresh wait mat karo)
      setProfiles(prev => {
        const id = String(saved.id)
        const next = prev.some(p => String(p.id) === id)
          ? prev.map(p => (String(p.id) === id ? { ...p, ...saved } : p))
          : [...prev, saved]
        return [...next].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
      })

      const displayAddress = [saved.name, saved.address].filter(Boolean).join(' - ')
      setGuestForm(p => ({
        ...p,
        guest_name: saved.name || '',
        guest_address: displayAddress || saved.address || '',
      }))
      setSelectedProfileId(String(saved.id))
      setProfileModal(false)
      setProfileForm({ name: '', address: '' })
      toast.success('Guest house saved.')

      // Background mein server list sync
      loadProfiles().catch(() => {})
    } catch (e) {
      const errs = e.response?.data?.errors
      const first =
        (errs && Object.values(errs).flat()?.[0]) ||
        e.response?.data?.message ||
        'Failed to save guest house.'
      toast.error(first)
    }
  }

  const createGuestOrder = async () => {
    if (!selectedProfileId) { toast.error('Please select a Guest House from dropdown.'); return }
    if (!guestForm.guest_name.trim()) { toast.error('Guest house name is required.'); return }
    if (!guestForm.guest_room.trim()) { toast.error('Room number is required.'); return }
    if (!guestForm.guest_address.trim()) { toast.error('Address is required.'); return }
    setActionLoading(true)
    try {
      const payload = {
        ...guestForm,
        guest_phone: guestForm.guest_phone.trim() || null,
      }
      const r = await orderAPI.createGuestHouse(payload)
      setOrder(r.data.data)
      setGuestCreated(true)
    } catch(e) { toast.error(e.response?.data?.message || 'Failed.') }
    finally { setActionLoading(false) }
  }

  const addItem = async item => {
    if (!order) return
    setActionLoading(true)
    try {
      const r = await orderAPI.addItem(order.id, { menu_item_id: item.id, quantity: 1 })
      setOrder(r.data.data)
    } catch(e) { toast.error(e.response?.data?.message || 'Failed.') }
    finally { setActionLoading(false) }
  }

  const changeQty = async (orderItem, delta) => {
    const newQty = orderItem.quantity + delta
    await setQuantity(orderItem, newQty)
  }

  const setQuantity = async (orderItem, qty) => {
    const newQty = parseInt(String(qty), 10)
    if (!Number.isFinite(newQty) || newQty < 1) {
      removeItem(orderItem)
      return
    }
    if (newQty === orderItem.quantity) return
    setActionLoading(true)
    try {
      const r = await orderAPI.updateItem(order.id, orderItem.id, { quantity: newQty })
      setOrder(r.data.data)
      setQtyDrafts(p => {
        const next = { ...p }
        delete next[orderItem.id]
        return next
      })
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to update quantity.')
    } finally {
      setActionLoading(false)
    }
  }

  const commitQtyInput = async (orderItem, rawValue) => {
    const trimmed = String(rawValue ?? '').trim()
    if (trimmed === '' || trimmed === String(orderItem.quantity)) return
    await setQuantity(orderItem, trimmed)
  }

  const removeItem = async orderItem => {
    setActionLoading(true)
    try {
      const r = await orderAPI.removeItem(order.id, orderItem.id)
      setOrder(r.data.data)
    } catch(e) { toast.error('Failed.') }
    finally { setActionLoading(false) }
  }

  // const handleGenerateBill = async () => {
  //   setActionLoading(true)
  //   try {
  //     const r = await billingAPI.generateBill(order.id, {
  //       payment_mode: payMode,
  //       payment_status: billPaymentStatus,
  //       discount_amount: parseFloat(discount) || 0,
  //     })
  //     toast.success('Bill generated!')
  //     navigate(`/bills/${r.data.data.bill_number}`)
  //   } catch(e) { toast.error(e.response?.data?.message || 'Failed.') }
  //   finally { setActionLoading(false); setBillModal(false) }
  // }

  const handleGenerateBill = async () => {
    setActionLoading(true)

    try {
      const r = await billingAPI.generateBill(order.id, {
        payment_mode: payMode,
        payment_status: billPaymentStatus,
        discount_amount: parseFloat(discount) || 0,
      })

      const billNum = r.data.data.bill_number

      // No toast before print — toast text was landing on the thermal receipt.
      try { toast.dismiss() } catch { /* ignore */ }

      if (order?.order_type === 'guest_house') {
        await loadOrder(order.id)
        navigate(`/orders/${order.id}`)
      } else {
        // Only open print page once; it auto-prints the correct settled layout.
        navigate(billPrintPath(billNum, true))
      }

    } catch(e) {
      toast.error(e.response?.data?.message || 'Failed.')
    } finally {
      setActionLoading(false)
      setBillModal(false)
    }
  }

  const handleMarkPaid = async () => {
    if (!order?.bill?.bill_number) return
    setActionLoading(true)
    try {
      await billingAPI.updatePaymentStatus(order.bill.bill_number, {
        payment_status: 'paid',
        payment_mode: settleMode,
      })
      toast.success('Bill marked as paid.')
      setPayModal(false)
      await loadOrder(order.id)
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to update payment.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleQtPrint = async () => {
    if (!order?.items?.length) {
      toast.error('Add items before printing KOT.')
      return
    }
    // One print path only — KOT page settles then auto-prints correct layout.
    navigate(kotPrintPath(order.id, true))
  }

  const handleCancel = async () => {
    setActionLoading(true)
    try {
      await orderAPI.cancel(order.id)
      toast.success('Order cancelled.')
      navigate(order.order_type === 'dine_in' ? '/tables' : '/orders')
    } catch(e) { toast.error(e.response?.data?.message || 'Failed.') }
    finally { setActionLoading(false); setCancelModal(false) }
  }

  const filteredItems = menuItems.filter(i =>
    (selectedCat === 'all' || i.category_name === selectedCat) &&
    (!search || i.name.toLowerCase().includes(search.toLowerCase()))
  )

  const updateCommission = async () => {
    if (!order || order.order_type !== 'guest_house' || order.status !== 'running') return
    const parsed = parseFloat(commissionInput)
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error('Enter a valid commission amount.')
      setCommissionInput(String(parseFloat(order?.commission_amount || 0) || 0))
      return
    }
    const rounded = Math.round(parsed * 100) / 100
    const current = Math.round((parseFloat(order?.commission_amount || 0) || 0) * 100) / 100
    if (rounded === current) return

    setActionLoading(true)
    try {
      const r = await orderAPI.updateCommission(order.id, { commission_amount: rounded })
      setOrder(r.data.data)
      toast.success('Commission updated.')
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to update commission.')
      setCommissionInput(String(parseFloat(order?.commission_amount || 0) || 0))
    } finally {
      setActionLoading(false)
    }
  }

  const orderItemMap = {}
  order?.items?.forEach(oi => { orderItemMap[oi.menu_item_id] = oi })

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>

  // Guest house: show form before order is created
  if (isGuestHouse && !order && !guestCreated) {
    return (
      <div className="max-w-2xl mx-auto mt-4 sm:mt-10">
        <div className="page-header">
          <h1 className="page-title">New Guest House Order</h1>
          <button onClick={() => setProfileModal(true)} className="btn-secondary btn btn-sm">+ Add Guest House</button>
        </div>
        <div className="card p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="form-group md:col-span-2">
            <label className="label">Guest House *</label>
            <SearchableSelect
              options={profiles}
              value={selectedProfileId}
              placeholder="Search guest house name / address…"
              emptyText="Koi guest house nahi mila"
              selectedFallbackLabel={guestForm.guest_name}
              getOptionLabel={p => [p.name, p.address].filter(Boolean).join(' — ')}
              getOptionValue={p => String(p.id)}
              onSearch={searchProfiles}
              onChange={(id, selected) => {
                setSelectedProfileId(id)
                const displayAddress = [selected?.name, selected?.address].filter(Boolean).join(' - ')
                setGuestForm(p => ({
                  ...p,
                  guest_name: selected?.name || '',
                  guest_address: displayAddress || '',
                }))
                // Ensure selected stays in local list
                if (selected?.id) {
                  setProfiles(prev => {
                    const sid = String(selected.id)
                    if (prev.some(p => String(p.id) === sid)) return prev
                    return [...prev, selected].sort((a, b) =>
                      String(a.name || '').localeCompare(String(b.name || '')),
                    )
                  })
                }
              }}
            />
            <p className="text-xs text-surface-500 mt-1">Type karke search karo, phir list se select karo.</p>
          </div>
          <div className="form-group">
            <label className="label">Guest House Name *</label>
            <input
              className="input"
              placeholder="Select guest house above"
              value={guestForm.guest_name}
              readOnly
            />
          </div>
          <div className="form-group">
            <label className="label">Room Number *</label>
            <input className="input" placeholder="Room 101" value={guestForm.guest_room} onChange={e => setGuestForm(p => ({...p, guest_room: e.target.value}))} />
          </div>
          <div className="form-group">
            <label className="label">Phone Number (Optional)</label>
            <input className="input" placeholder="+91 99999 99999" value={guestForm.guest_phone} onChange={e => setGuestForm(p => ({...p, guest_phone: e.target.value}))} />
          </div>
          <div className="form-group">
            <label className="label">ID Proof (Optional)</label>
            <input className="input" placeholder="Aadhaar / Passport / DL" value={guestForm.guest_id_proof} onChange={e => setGuestForm(p => ({...p, guest_id_proof: e.target.value}))} />
          </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => navigate('/orders')} className="btn-secondary btn">Cancel</button>
            <button onClick={createGuestOrder} className="btn-primary btn flex-1 justify-center" disabled={actionLoading}>
              {actionLoading ? 'Creating…' : 'Create Order & Add Items'}
            </button>
          </div>
        </div>
        <Modal open={profileModal} onClose={() => setProfileModal(false)} title="Add Guest House" size="sm">
          <div className="space-y-4">
            <div className="form-group">
              <label className="label">Guest House Name *</label>
              <input className="input" value={profileForm.name} onChange={e => setProfileForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="label">Address *</label>
              <textarea
                className="textarea"
                rows={3}
                placeholder="Area / city (min 2 characters)"
                value={profileForm.address}
                onChange={e => setProfileForm(p => ({ ...p, address: e.target.value }))}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button className="btn-secondary btn" onClick={() => setProfileModal(false)}>Cancel</button>
              <button className="btn-primary btn" onClick={saveProfile}>Save</button>
            </div>
          </div>
        </Modal>
      </div>
    )
  }

  const commission = order?.order_type === 'guest_house'
    ? (order?.status === 'running'
      ? (Number.isFinite(parseFloat(commissionInput)) ? parseFloat(commissionInput) : parseFloat(order?.commission_amount || 0))
      : parseFloat(order?.commission_amount || 0))
    : 0
  const discountVal = parseFloat(discount) || 0
  const subtotalVal = parseFloat(order?.subtotal || 0) || 0
  const taxVal = parseFloat(order?.tax_amount || 0) || 0

  const effectiveItemQty = oi => {
    const draft = qtyDrafts[oi.id]
    if (draft === undefined || draft === '') return oi.quantity
    const n = parseInt(String(draft), 10)
    if (!Number.isFinite(n) || n < 1) return oi.quantity
    return n
  }

  const previewSubtotalVal = (order?.items || []).reduce(
    (sum, oi) => sum + effectiveItemQty(oi) * parseFloat(oi.unit_price || 0),
    0
  )
  const taxRate = subtotalVal > 0 ? taxVal / subtotalVal : 0
  const previewTaxVal = Math.round(previewSubtotalVal * taxRate * 100) / 100
  const previewGrandTotalVal = Math.max(0, previewSubtotalVal + previewTaxVal - discountVal)
  const displaySubtotal = previewSubtotalVal
  const displayTax = previewTaxVal
  const displayGrandTotal = previewGrandTotalVal.toFixed(2)

  return (
    <div className="flex flex-col xl:flex-row gap-4 min-h-[calc(100vh-8rem)]">
      {/* Left: Menu */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <button onClick={() => navigate(isWaiter ? '/tables' : -1)} className="btn-ghost btn btn-sm">← Back</button>
          <div className="flex-1">
            <h1 className="page-title text-xl">{order ? `Order #${order.order_number}` : 'New Order'}</h1>
            <p className="text-xs text-surface-400">
              {order?.order_type === 'dine_in' ? `🍽 ${order.table_label}` : `🏨 ${order?.guest_name} ${order?.guest_room ? '· Room ' + order.guest_room : ''}`}
              <span className="ml-2"><StatusBadge status={order?.order_type} /></span>
            </p>
          </div>
          {order?.status === 'running' && !isWaiter && (
            <button onClick={() => setCancelModal(true)} className="btn-secondary btn btn-sm text-red-500">Cancel Order</button>
          )}
        </div>

        {/* Search + Category filter */}
        <div className="flex gap-2 mb-3">
          <input className="input flex-1" placeholder="Search menu items..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-2 mb-4 flex-wrap">
          <button onClick={() => setSelectedCat('all')} className={`btn btn-sm ${selectedCat === 'all' ? 'btn-primary' : 'btn-secondary'}`}>All</button>
          {categories.map(c => (
            <button key={c} onClick={() => setSelectedCat(c)} className={`btn btn-sm ${selectedCat === c ? 'btn-primary' : 'btn-secondary'}`}>{c}</button>
          ))}
        </div>

        {/* Menu grid */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-3 content-start">
          {filteredItems.map(item => {
            const inOrder = orderItemMap[item.id]
            const price   = order?.order_type === 'guest_house' ? item.guest_house_price : item.restaurant_price
            return (
              <div key={item.id} className={`card p-3 cursor-pointer hover:shadow-card-md transition-all border-2 ${inOrder ? 'border-brand-300 bg-brand-50' : 'border-transparent'}`} onClick={() => order?.status === 'running' && addItem(item)}>
                <div className="flex items-start justify-between mb-1">
                  <p className="text-sm font-medium text-surface-800 leading-tight">{item.name}</p>
                  {inOrder && <span className="badge badge-green ml-1 flex-shrink-0">{inOrder.quantity}</span>}
                </div>
                <p className="text-xs text-surface-400 mb-2">{item.category_name}</p>
                <p className="text-brand-600 font-bold text-sm">{formatCurrency(price)}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Right: Order summary */}
      <div className="w-full xl:w-80 xl:flex-shrink-0 xl:self-start xl:sticky xl:top-24 xl:h-[calc(100vh-9rem)] flex flex-col card overflow-hidden">
        <div className="px-4 py-3 border-b border-surface-100">
          <h2 className="font-display font-bold text-surface-900">Order Summary</h2>
          {order?.status !== 'running' && <StatusBadge status={order?.status} />}
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {!order?.items?.length
            ? <p className="text-sm text-surface-400 text-center py-8">No items added yet.</p>
            : order.items.map(oi => (
              <div key={oi.id} className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-surface-800 truncate">{oi.item_name}</p>
                  <p className="text-xs text-surface-400">{formatCurrency(oi.unit_price)} each</p>
                </div>
                {order.status === 'running' ? (
                  <div className="flex items-center gap-1">
                    <button onClick={() => changeQty(oi, -1)} className="w-7 h-7 rounded bg-surface-100 hover:bg-surface-200 text-sm flex items-center justify-center shrink-0" disabled={actionLoading}>−</button>
                    <input
                      type="number"
                      min="1"
                      max="999"
                      inputMode="numeric"
                      className="input w-12 text-center text-sm font-bold py-0.5 px-1"
                      value={qtyDrafts[oi.id] ?? oi.quantity}
                      onChange={e => setQtyDrafts(p => ({ ...p, [oi.id]: e.target.value }))}
                      onBlur={e => {
                        commitQtyInput(oi, e.target.value)
                        setQtyDrafts(p => {
                          const next = { ...p }
                          delete next[oi.id]
                          return next
                        })
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') e.currentTarget.blur()
                      }}
                      disabled={actionLoading}
                      aria-label={`Quantity for ${oi.item_name}`}
                    />
                    <button onClick={() => changeQty(oi, +1)} className="w-7 h-7 rounded bg-surface-100 hover:bg-surface-200 text-sm flex items-center justify-center shrink-0" disabled={actionLoading}>+</button>
                  </div>
                ) : <span className="text-sm text-surface-600">×{oi.quantity}</span>}
                <span className="text-sm font-medium w-16 text-right">
                  {formatCurrency(effectiveItemQty(oi) * parseFloat(oi.unit_price || 0))}
                </span>
              </div>
            ))
          }
        </div>

        {/* Totals */}
        <div className="border-t border-surface-100 px-4 py-3 space-y-1">
          <div className="flex justify-between text-sm text-surface-500"><span>Subtotal</span><span>{formatCurrency(displaySubtotal)}</span></div>
          {displayTax > 0 && <div className="flex justify-between text-sm text-surface-500"><span>Tax</span><span>{formatCurrency(displayTax)}</span></div>}
          {order?.order_type === 'guest_house' && (
            order?.status === 'running' ? (
              <div className="flex items-center justify-between text-sm text-amber-600 pt-1">
                <span>Commission</span>
                <input
                  className="input w-24 text-right text-sm py-1"
                  type="number"
                  min="0"
                  step="0.01"
                  value={commissionInput}
                  onChange={e => setCommissionInput(e.target.value)}
                  onBlur={updateCommission}
                  onKeyDown={e => {
                    if (e.key === 'Enter') e.currentTarget.blur()
                  }}
                />
              </div>
            ) : (
              <div className="flex justify-between text-sm text-amber-600">
                <span>Commission</span>
                <span>{formatCurrency(commission)}</span>
              </div>
            )
          )}
          {order?.status === 'running' && !isWaiter && (
            <div className="flex items-center justify-between text-sm text-surface-500 pt-1">
              <span>Discount</span>
              <input className="input w-24 text-right text-sm py-1" type="number" min="0" value={discount} onChange={e => setDiscount(e.target.value)} />
            </div>
          )}
          <div className="flex justify-between font-bold text-surface-900 text-base pt-2 border-t border-surface-100">
            <span>Grand Total</span>
            <span className="text-brand-600">{formatCurrency(displayGrandTotal)}</span>
          </div>
        </div>

        {/* Bill / KOT actions */}
        {order?.status === 'running' && order?.items?.length > 0 && (
          <div className="px-4 py-3 border-t border-surface-100">
            {isWaiter ? (
              <button onClick={handleQtPrint} className="btn-primary btn w-full justify-center btn-lg" disabled={actionLoading}>
                {actionLoading ? 'Printing…' : 'KOT Print'}
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button onClick={handleQtPrint} className="btn-secondary btn justify-center btn-lg">
                  KOT Print
                </button>
                <button onClick={() => setBillModal(true)} className="btn-primary btn justify-center btn-lg">
                  {order?.bill ? 'Update Bill' : 'Generate Bill'}
                </button>
              </div>
            )}
          </div>
        )}

        {!isWaiter && order?.order_type === 'guest_house' && order?.bill && (
          <div className="px-4 py-3 border-t border-surface-100 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-surface-700">Bill #{order.bill.bill_number}</span>
              <StatusBadge status={order.bill.payment_status} />
            </div>
            <p className="text-xs text-surface-500">
              {order.bill.payment_status === 'paid'
                ? `Paid via ${paymentModeLabel(order.bill.payment_mode)}`
                : `Due amount: ${formatCurrency(order.bill.grand_total)} — payment aane par mark paid karo.`}
            </p>
            {order.bill.payment_status !== 'paid' && (
              <button onClick={() => { setSettleMode('cash'); setPayModal(true) }} className="btn-primary btn w-full justify-center">
                Mark as Paid
              </button>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => navigate(`/bills/${order.bill.bill_number}`)} className="btn-secondary btn btn-sm justify-center">
                View Bill
              </button>
              <button onClick={() => navigate(billPrintPath(order.bill.bill_number))} className="btn-secondary btn btn-sm justify-center">
                Print Bill
              </button>
            </div>
          </div>
        )}
        {!isWaiter && order?.status === 'billed' && (
          <div className="px-4 py-3 border-t border-surface-100 space-y-2">
            <button onClick={() => navigate(`/bills`)} className="btn-secondary btn w-full justify-center">View Bills</button>
          </div>
        )}
      </div>

      {/* Bill Modal */}
      {!isWaiter && billModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setBillModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-card-lg w-full max-w-sm p-6">
            <h3 className="font-display text-xl font-bold mb-4">Generate Bill</h3>
            <div className="space-y-4">
              <div>
                <label className="label">Payment Mode</label>
                {order?.order_type === 'guest_house' ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => {
                          setPayMode('credit')
                          setBillPaymentStatus('unpaid')
                        }}
                        className={`flex-1 btn btn-sm justify-center min-w-[90px] ${payMode === 'credit' ? 'btn-primary' : 'btn-secondary'}`}
                      >
                        Credit (Due)
                      </button>
                      <button
                        onClick={() => {
                          setPayMode('cash')
                          setBillPaymentStatus('paid')
                        }}
                        className={`flex-1 btn btn-sm justify-center min-w-[90px] ${payMode === 'cash' ? 'btn-primary' : 'btn-secondary'}`}
                      >
                        Cash
                      </button>
                      <button
                        onClick={() => {
                          setPayMode('upi')
                          setBillPaymentStatus('paid')
                        }}
                        className={`flex-1 btn btn-sm justify-center min-w-[90px] ${payMode === 'upi' ? 'btn-primary' : 'btn-secondary'}`}
                      >
                        Online (UPI)
                      </button>
                    </div>
                    <p className="text-xs text-surface-500">
                      Credit = due/unpaid bill. Cash ya UPI = paid. Baad mein Manage page se bhi mark paid kar sakte ho.
                    </p>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    {['cash','upi','card'].map(m => (
                      <button
                        key={m}
                        onClick={() => {
                          setPayMode(m)
                          setBillPaymentStatus('paid')
                        }}
                        className={`flex-1 btn btn-sm justify-center capitalize ${payMode === m ? 'btn-primary' : 'btn-secondary'}`}
                      >
                        {m === 'upi' ? 'ONLINE' : m.toUpperCase()}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="bg-surface-50 rounded-lg p-3 space-y-1 text-sm">
                <div className="flex justify-between text-surface-500"><span>Subtotal</span><span>{formatCurrency(order?.subtotal)}</span></div>
                {commission > 0 && <div className="flex justify-between text-amber-600"><span>Commission</span><span>{formatCurrency(commission)}</span></div>}
                {discountVal > 0 && <div className="flex justify-between text-green-600"><span>Discount</span><span>-{formatCurrency(discountVal)}</span></div>}
                <div className="flex justify-between font-bold text-surface-900 pt-1 border-t border-surface-200"><span>Grand Total</span><span className="text-brand-600">{formatCurrency(displayGrandTotal)}</span></div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setBillModal(false)} className="btn-secondary btn flex-1 justify-center" disabled={actionLoading}>Cancel</button>
                <button onClick={handleGenerateBill} className="btn-primary btn flex-1 justify-center" disabled={actionLoading}>
                  {actionLoading ? 'Processing…' : 'Confirm & Print'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {!isWaiter && payModal && order?.bill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setPayModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-card-lg w-full max-w-sm p-6">
            <h3 className="font-display text-xl font-bold mb-2">Mark as Paid</h3>
            <p className="text-sm text-surface-500 mb-4">
              Bill {order.bill.bill_number} · {formatCurrency(order.bill.grand_total)}
            </p>
            <div className="space-y-4">
              <div>
                <label className="label">Payment Mode</label>
                <div className="flex gap-2">
                  {[
                    { id: 'cash', label: 'Cash' },
                    { id: 'upi', label: 'Online (UPI)' },
                    { id: 'card', label: 'Card' },
                  ].map(m => (
                    <button
                      key={m.id}
                      onClick={() => setSettleMode(m.id)}
                      className={`flex-1 btn btn-sm justify-center ${settleMode === m.id ? 'btn-primary' : 'btn-secondary'}`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setPayModal(false)} className="btn-secondary btn flex-1 justify-center">Cancel</button>
                <button onClick={handleMarkPaid} className="btn-primary btn flex-1 justify-center" disabled={actionLoading}>
                  {actionLoading ? 'Saving…' : 'Confirm Paid'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {!isWaiter && (
        <ConfirmModal
          open={cancelModal} onClose={() => setCancelModal(false)} onConfirm={handleCancel}
          title="Cancel Order" message={`Cancel order ${order?.order_number}? This cannot be undone.`}
          confirmLabel="Yes, Cancel" danger loading={actionLoading}
        />
      )}
    </div>
  )
}
