import { useEffect, useMemo, useState } from 'react'
import { guestHouseAPI, settingsAPI } from '../../services/api'
import Spinner from '../../components/ui/Spinner'
import Modal from '../../components/ui/Modal'
import Pagination from '../../components/ui/Pagination'
import GuestInvoice, { printGuestInvoice, downloadGuestInvoicePdf} from '../../components/guesthouse/GuestInvoice'
import toast from 'react-hot-toast'

function toLocalInputValue(d) {
  const date = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return date.toISOString().slice(0, 16)
}
/* Guest house standard timing: check-in 11:00 AM, check-out 12:00 PM (next day) */
const CHECK_IN_HOUR = 11
const CHECK_OUT_HOUR = 12
const pad2 = n => String(n).padStart(2, '0')
const dateOnly = v => String(v || '').slice(0, 10)
function combineDateTime(dateStr, hour) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ''))) return ''
  return `${dateStr}T${pad2(hour)}:00`
}
function addDaysTo(dateVal, days) {
  const day = dateOnly(dateVal) || toLocalInputValue(new Date()).slice(0, 10)
  const base = new Date(`${day}T12:00:00`)
  if (Number.isNaN(base.getTime())) return ''
  base.setDate(base.getDate() + days)
  return `${base.getFullYear()}-${pad2(base.getMonth() + 1)}-${pad2(base.getDate())}`
}
/* To date hamesha from date + 1 din, 12:00 PM checkout */
function checkoutFor(fromVal) {
  const fromDate = dateOnly(fromVal) || toLocalInputValue(new Date()).slice(0, 10)
  return combineDateTime(addDaysTo(fromDate, 1), CHECK_OUT_HOUR)
}
function defaultDateRange() {
  const from = combineDateTime(toLocalInputValue(new Date()).slice(0, 10), CHECK_IN_HOUR)
  return { from, to: checkoutFor(from) }
}

function Stat({ label, value, color }) {
  const cls = {
    total: 'bg-blue-50 text-blue-700 border-blue-100',
    available: 'bg-green-50 text-green-700 border-green-100',
    booked: 'bg-amber-50 text-amber-700 border-amber-100',
    active: 'bg-purple-50 text-purple-700 border-purple-100',
    cleaning: 'bg-gray-50 text-gray-700 border-gray-100',
    maintenance: 'bg-red-50 text-red-700 border-red-100',
    checkout: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    income: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    pending: 'bg-rose-50 text-rose-700 border-rose-100',
  }
  return (
    <div className={`card p-4 border ${cls[color] || ''}`}>
      <p className="text-sm font-medium">{label}</p>
      <p className="text-2xl font-display font-bold mt-1">{value}</p>
    </div>
  )
}

const BLANK_GUEST = {
  guest_name: '', phone: '', category_id: '', room_no: '', address: '', id_proof: '',
  from_date: '', to_date: '', expected_checkout_at: '', total_amount: '', advance_amount: '',
  paid_amount: '', payment_mode: 'cash', booking_id: '', adults_count: 1, children_count: 0,
  extra_bed_count: 0, extra_bed_rate: '', id_proof_photo: '', guest_photo: '',
  companions: '', companions_id_details: '',
}

export default function GuestHouse() {
  const initialRange = defaultDateRange()

  const [loading, setLoading] = useState(true)
  const [dashboard, setDashboard] = useState(null)
  const [categories, setCategories] = useState([])
  const [bookings, setBookings] = useState([])
  const [settings, setSettings] = useState({})
  const [submitting, setSubmitting] = useState(false)

  // modals
  const [showGuestModal, setShowGuestModal] = useState(false)
  const [showRoomModal, setShowRoomModal] = useState(false)
  const [showRoomEdit, setShowRoomEdit] = useState(false)
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [showBookingModal, setShowBookingModal] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showBillModal, setShowBillModal] = useState(false)
  const [showChargeModal, setShowChargeModal] = useState(false)
  const [showLateOut, setShowLateOut] = useState(false)

  const [selectedGuest, setSelectedGuest] = useState(null)
  const [bookingsList, setBookingsList] = useState([])
  const [availableRooms, setAvailableRooms] = useState([])
  const [bookingAvailableRooms, setBookingAvailableRooms] = useState([])
  const [editAvailableRooms, setEditAvailableRooms] = useState([])
  const [recentGuestPage, setRecentGuestPage] = useState(1)
  const [bookingPage, setBookingPage] = useState(1)
  const [recentGuestSearch, setRecentGuestSearch] = useState('')
  const [bookingSearch, setBookingSearch] = useState('')
  const perPage = 8

  const [form, setForm] = useState({ ...BLANK_GUEST, from_date: initialRange.from, to_date: initialRange.to, expected_checkout_at: initialRange.to })
  const [bookingForm, setBookingForm] = useState({ ...BLANK_GUEST, from_date: initialRange.from, to_date: initialRange.to })
  const [editForm, setEditForm] = useState(null)
  const [paymentForm, setPaymentForm] = useState({ amount: '', payment_mode: 'cash' })
  const [roomForm, setRoomForm] = useState({ room_no: '', floor_no: '', category_id: '', room_type: '', rent: '' })
  const [roomEditForm, setRoomEditForm] = useState(null)
  const [categoryForm, setCategoryForm] = useState({ name: '' })
  const [billData, setBillData] = useState(null)
  const [chargeForm, setChargeForm] = useState({ charge_type: 'food', amount: '', description: '' })
  const [lateOutForm, setLateOutForm] = useState({ amount: '', note: 'Late check-out' })

  const load = async () => {
    try {
      const [d, c, b, s] = await Promise.all([
        guestHouseAPI.dashboard(),
        guestHouseAPI.roomCategories(),
        guestHouseAPI.bookings(),
        settingsAPI.public().catch(() => ({ data: { data: {} } })),
      ])
      setDashboard(d.data.data)
      setCategories(c.data.data || [])
      setBookings(b.data.data || [])
      setSettings(s.data?.data || {})
    } catch (e) {
      toast.error(e.response?.data?.message || 'Guest house load nahi hua.')
      setDashboard(null)
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const loadAvailable = async () => {
    // Pehle category, phir usi category ke rooms + free/occupied tag.
    if (!form.category_id) { setAvailableRooms([]); return }
    try {
      const r = await guestHouseAPI.availableRooms({
        category_id: form.category_id,
        from_date: form.from_date || '',
        to_date: form.to_date || '',
      })
      setAvailableRooms(r.data.data || [])
    } catch (e) {
      setAvailableRooms([])
      // Silent fail mat karo — warna dropdown "Is category me koi room nahi" dikha kar
      // galat message deta tha jabki asli problem API call fail hona thi (purana backend,
      // expired session, server error waghera). Ab asli error dikhao.
      toast.error(e.response?.data?.message || 'Rooms load nahi hue. Page refresh karke dobara try karein.')
    }
  }
  useEffect(() => { if (showGuestModal) loadAvailable() /* eslint-disable-next-line */ }, [form.category_id, form.from_date, form.to_date, showGuestModal])

  const loadBookingAvailable = async () => {
    if (!bookingForm.category_id || !bookingForm.from_date || !bookingForm.to_date) return
    try {
      const r = await guestHouseAPI.availableRooms({ category_id: bookingForm.category_id, from_date: bookingForm.from_date, to_date: bookingForm.to_date })
      setBookingAvailableRooms(r.data.data || [])
    } catch { setBookingAvailableRooms([]) }
  }
  useEffect(() => { if (showBookingModal) loadBookingAvailable() /* eslint-disable-next-line */ }, [bookingForm.category_id, bookingForm.from_date, bookingForm.to_date, showBookingModal])

  const loadEditAvailable = async (catId, from, to) => {
    if (!catId || !from || !to) return
    try {
      const r = await guestHouseAPI.availableRooms({ category_id: catId, from_date: from, to_date: to })
      setEditAvailableRooms((r.data.data || []).map(x => x.room_no || x))
    } catch { setEditAvailableRooms([]) }
  }

  const fileToDataUrl = (file, cb) => {
    if (file.size > 2 * 1024 * 1024) { toast.error('Photo 2 MB se chhoti rakhein.'); return }
    const r = new FileReader()
    r.onload = () => cb(String(r.result))
    r.readAsDataURL(file)
  }

  /* ---------------- bookings / guests ---------------- */

  const openWalkIn = () => {
    const r = defaultDateRange()
    setForm({ ...BLANK_GUEST, from_date: r.from, to_date: r.to, expected_checkout_at: r.to })
    setShowGuestModal(true)
  }

  const openConvertBooking = b => {
    const r = defaultDateRange()
    setForm({
      ...BLANK_GUEST,
      guest_name: b.guest_name || '', phone: b.phone || '', address: b.address || '',
      id_proof: b.id_proof || '', category_id: String(b.category_id || ''), room_no: b.room_no || '',
      from_date: r.from, to_date: r.to, expected_checkout_at: r.to,
      total_amount: b.total_amount ?? '', advance_amount: b.advance_amount ?? '',
      paid_amount: b.advance_amount ?? '', payment_mode: b.payment_mode || 'cash',
      booking_id: b.id,
    })
    setShowGuestModal(true)
  }

  const onCheckIn = async e => {
    e.preventDefault()
    if (!form.room_no) {
      toast.error('Room number select karna zaroori hai.')
      return
    }
    setSubmitting(true)
    try {
      await guestHouseAPI.createGuest({ ...form, paid_amount: form.paid_amount || form.advance_amount })
      toast.success('Guest check-in ho gaya.')
      setForm(BLANK_GUEST)
      setShowGuestModal(false)
      load()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Check-in fail.')
    } finally { setSubmitting(false) }
  }

  const onCreateBooking = async e => {
    e.preventDefault()
    if (!bookingForm.guest_name || !bookingForm.phone || !bookingForm.category_id || !bookingForm.room_no || !bookingForm.address) {
      toast.error('Booking ke liye saari required fields bharein.')
      return
    }
    setSubmitting(true)
    try {
      await guestHouseAPI.createBooking(bookingForm)
      toast.success('Advance booking create ho gayi.')
      const r = defaultDateRange()
      setBookingForm({ ...BLANK_GUEST, from_date: r.from, to_date: r.to })
      setShowBookingModal(false)
      load()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Booking fail.')
    } finally { setSubmitting(false) }
  }

  const openEdit = row => {
    const from = (row.booking_from || row.check_in_at || '').slice(0, 16)
    const to = (row.booking_to || row.expected_checkout_at || '').slice(0, 16)
    setEditForm({
      id: row.id, guest_name: row.guest_name || '', phone: row.phone || '',
      category_id: String(row.category_id || ''), room_no: row.room_no || '',
      address: row.address || '', id_proof: row.id_proof || '',
      from_date: from, to_date: to,
      expected_checkout_at: (row.expected_checkout_at || row.booking_to || '').slice(0, 16),
      total_amount: row.total_amount ?? '', advance_amount: row.advance_amount ?? '',
      paid_amount: row.paid_amount ?? '', payment_mode: row.payment_mode || 'cash',
      adults_count: row.adults_count ?? 1, children_count: row.children_count ?? 0,
      extra_bed_count: row.extra_bed_count ?? 0, extra_bed_rate: row.extra_bed_rate ?? '',
      companions: row.companions || '', companions_id_details: row.companions_id_details || '',
      status: row.status || 'checked_in',
    })
    loadEditAvailable(row.category_id, from, to)
    setShowEditModal(true)
  }

  const onEditGuest = async e => {
    e.preventDefault()
    if (!editForm?.id) return
    setSubmitting(true)
    try {
      await guestHouseAPI.updateGuest(editForm.id, editForm)
      toast.success('Record update ho gaya.')
      setShowEditModal(false); setEditForm(null); load()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Update fail.')
    } finally { setSubmitting(false) }
  }

  const onCancelBooking = async b => {
    if (!window.confirm(`Booking cancel karein? ${b.guest_name} · Room ${b.room_no}`)) return
    try {
      await guestHouseAPI.cancelBooking(b.id)
      toast.success('Booking cancel ho gayi.')
      load()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Cancel fail.')
    }
  }

  const onAddPayment = async e => {
    e.preventDefault()
    if (!selectedGuest?.id) return
    if (!paymentForm.amount || Number(paymentForm.amount) <= 0) { toast.error('Valid amount daalein.'); return }
    setSubmitting(true)
    try {
      await guestHouseAPI.addPayment(selectedGuest.id, paymentForm)
      toast.success('Payment add ho gaya.')
      setShowPaymentModal(false); setSelectedGuest(null)
      setPaymentForm({ amount: '', payment_mode: 'cash' })
      load()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Payment fail.')
    } finally { setSubmitting(false) }
  }

  const onCheckout = async guestId => {
    if (!window.confirm('Checkout karein aur room free karein?')) return
    try {
      await guestHouseAPI.checkout(guestId)
      toast.success('Guest checkout ho gaya.')
      load()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Checkout fail.')
    }
  }

  const openFinalBill = async g => {
    try {
      const r = await guestHouseAPI.finalBill(g.id)
      setBillData(r.data.data)
      setSelectedGuest(g)
      setShowBillModal(true)
    } catch { toast.error('Final bill load nahi hua.') }
  }

  const onAddCharge = async e => {
    e.preventDefault()
    if (!selectedGuest?.id || !chargeForm.amount || Number(chargeForm.amount) <= 0) {
      toast.error('Valid amount daalein.'); return
    }
    setSubmitting(true)
    try {
      await guestHouseAPI.addCharge(selectedGuest.id, { ...chargeForm, amount: Number(chargeForm.amount) })
      toast.success('Charge add ho gaya.')
      setShowChargeModal(false)
      setChargeForm({ charge_type: 'food', amount: '', description: '' })
      load()
      if (showBillModal) openFinalBill(selectedGuest)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Charge fail.')
    } finally { setSubmitting(false) }
  }

  const onLateOut = async e => {
    e.preventDefault()
    if (!selectedGuest?.id || !lateOutForm.amount || Number(lateOutForm.amount) <= 0) {
      toast.error('Late check-out amount daalein.'); return
    }
    setSubmitting(true)
    try {
      await guestHouseAPI.addCharge(selectedGuest.id, {
        charge_type: 'other',
        description: lateOutForm.note || 'Late check-out',
        amount: Number(lateOutForm.amount),
      })
      toast.success('Late check-out charge add ho gaya.')
      setShowLateOut(false)
      setLateOutForm({ amount: '', note: 'Late check-out' })
      await openFinalBill(selectedGuest)
      load()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Charge fail.')
    } finally { setSubmitting(false) }
  }

  /* ---------------- rooms ---------------- */

  const changeRoomStatus = async (room, status) => {
    try {
      await guestHouseAPI.updateRoom(room.id, { status })
      toast.success(`Room ${room.room_no} → ${status}`)
      load()
    } catch (e) { toast.error(e.response?.data?.message || 'Room update fail.') }
  }

  const openRoomEdit = room => {
    setRoomEditForm({
      id: room.id, room_no: room.room_no || '', floor_no: room.floor_no || '',
      category_id: String(room.category_id || ''), room_type: room.room_type || '',
      rent: room.rent ?? '', status: room.status || 'available',
    })
    setShowRoomEdit(true)
  }

  const onSaveRoomEdit = async e => {
    e.preventDefault()
    if (!roomEditForm?.id) return
    setSubmitting(true)
    try {
      await guestHouseAPI.updateRoom(roomEditForm.id, {
        room_no: roomEditForm.room_no,
        floor_no: roomEditForm.floor_no,
        category_id: Number(roomEditForm.category_id) || undefined,
        rent: Number(roomEditForm.rent || 0),
        status: roomEditForm.status,
      })
      toast.success('Room update ho gaya.')
      setShowRoomEdit(false); setRoomEditForm(null); load()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Room update fail.')
    } finally { setSubmitting(false) }
  }

  const onDeleteRoom = async room => {
    if (!window.confirm(`Room ${room.room_no} delete karein?`)) return
    try {
      try {
        await guestHouseAPI.deleteRoom(room.id)
      } catch (err) {
        const st = err.response?.status
        if (st === 404 || st === 405 || st === 501) {
          await guestHouseAPI.deleteRoomFallback(room.id)
        } else {
          throw err
        }
      }
      toast.success('Room delete ho gaya.')
      load()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete fail.')
    }
  }

  const onCreateRoom = async e => {
    e.preventDefault()
    if (!roomForm.room_no || !roomForm.floor_no || !roomForm.category_id) {
      toast.error('Room no, floor aur category zaroori hai.'); return
    }
    try {
      await guestHouseAPI.createRoom({
        room_no: roomForm.room_no, floor_no: roomForm.floor_no,
        category_id: Number(roomForm.category_id),
        rent: Number(roomForm.rent || 0),
      })
      toast.success('Room add ho gaya.')
      setRoomForm({ room_no: '', floor_no: '', category_id: '', room_type: '', rent: '' })
      setShowRoomModal(false); load()
    } catch (err) { toast.error(err.response?.data?.message || 'Room add fail.') }
  }

  const onCreateCategory = async e => {
    e.preventDefault()
    if (!categoryForm.name.trim()) { toast.error('Category name daalein.'); return }
    try {
      await guestHouseAPI.createRoomCategory({ name: categoryForm.name.trim() })
      toast.success('Category ban gayi.')
      setCategoryForm({ name: '' }); setShowCategoryModal(false); load()
    } catch (err) { toast.error(err.response?.data?.message || 'Category fail.') }
  }

  /* ---------------- tables ---------------- */

  const recentGuests = dashboard?.recent_guests || []
  const pagedRecentGuests = useMemo(() => {
    const q = recentGuestSearch.trim().toLowerCase()
    const list = q
      ? recentGuests.filter(g => [g.guest_name, g.phone, g.room_no].some(v => String(v || '').toLowerCase().includes(q)))
      : recentGuests
    return list.slice((recentGuestPage - 1) * perPage, recentGuestPage * perPage)
  }, [recentGuests, recentGuestSearch, recentGuestPage])
  const recentGuestPages = Math.max(1, Math.ceil((recentGuestSearch ? recentGuests.filter(g => [g.guest_name, g.phone, g.room_no].some(v => String(v || '').toLowerCase().includes(recentGuestSearch.toLowerCase()))).length : recentGuests.length) / perPage))

  const pagedBookings = useMemo(() => {
    const q = bookingSearch.trim().toLowerCase()
    const list = q
      ? bookings.filter(b => [b.guest_name, b.phone, b.room_no].some(v => String(v || '').toLowerCase().includes(q)))
      : bookings
    return list.slice((bookingPage - 1) * perPage, bookingPage * perPage)
  }, [bookings, bookingSearch, bookingPage])
  const bookingPages = Math.max(1, Math.ceil((bookingSearch ? bookings.filter(b => [b.guest_name, b.phone, b.room_no].some(v => String(v || '').toLowerCase().includes(bookingSearch.toLowerCase()))).length : bookings.length) / perPage))

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>
  if (!dashboard) return (
    <div className="text-center py-20">
      <p className="text-surface-500 mb-3">Could not load guest house.</p>
      <button className="btn-primary btn" onClick={load}>Try again</button>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Kripa shanti atithi bhavan</h1>
          <p className="page-sub">Rooms, booking, check-in/out, billing — sab ek jagah.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary btn" onClick={load}>↻ Refresh</button>
          <button className="btn-primary btn" onClick={openWalkIn}>+ Walk-in Guest</button>
          <button className="btn-secondary btn" onClick={() => {
            const r = defaultDateRange()
            setBookingForm(p => ({ ...p, from_date: r.from, to_date: r.to }))
            setShowBookingModal(true)
          }}>+ Advance Booking</button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Stat label="Total Rooms" value={dashboard.summary.total_rooms} color="total" />
        <Stat label="Available Rooms" value={dashboard.summary.available_rooms} color="available" />
        <Stat label="Occupied / Booked" value={dashboard.summary.booked_rooms} color="booked" />
        <Stat label="Cleaning" value={dashboard.summary.cleaning_rooms ?? 0} color="cleaning" />
        <Stat label="Maintenance" value={dashboard.summary.maintenance_rooms ?? 0} color="maintenance" />
        <Stat label="Today Check-ins" value={dashboard.summary.today_check_ins ?? 0} color="active" />
        <Stat label="Today Check-outs" value={dashboard.summary.today_check_outs ?? 0} color="checkout" />
        <Stat label="Active Guests" value={dashboard.summary.active_guests} color="checkout" />
        <Stat label="Today Income" value={`₹${Number(dashboard.summary.today_income || 0).toFixed(0)}`} color="income" />
        <Stat label="Pending Payments" value={`₹${Number(dashboard.summary.pending_payments || 0).toFixed(0)}`} color="pending" />
      </div>

      {/* Rooms */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-surface-200">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-xl font-bold text-surface-900">Room Status</h2>
            <div className="flex flex-wrap gap-2">
              <button className="btn-secondary btn btn-sm" onClick={() => setShowCategoryModal(true)}>+ Add Category</button>
              <button className="btn-primary btn btn-sm" onClick={() => setShowRoomModal(true)}>+ Add Room</button>
            </div>
          </div>
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {dashboard.rooms.map(room => (
            <div key={room.id} className={`rounded-lg border p-3 ${room.status === 'available' ? 'bg-green-50 border-green-200' : room.status === 'booked' ? 'bg-amber-50 border-amber-200' : room.status === 'cleaning' ? 'bg-gray-50 border-gray-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-center justify-between mb-1">
                <p className="font-semibold text-surface-900">Room {room.room_no}</p>
                <span className={`badge ${room.status === 'available' ? 'badge-green' : room.status === 'booked' ? 'badge-amber' : 'badge-gray'}`}>{room.status}</span>
              </div>
              <p className="text-xs text-surface-500">
                {room.category_name || 'Uncategorised'}
                {room.floor_no ? ` · Floor ${room.floor_no}` : ''}
                {Number(room.rent) > 0 ? ` · ₹${Number(room.rent).toFixed(0)}/night` : ''}
              </p>

              {!room.guest_id && (
                <select className="select mt-2 text-xs" value={room.status}
                  onChange={e => changeRoomStatus(room, e.target.value)}>
                  <option value="available">Available</option>
                  <option value="cleaning">Cleaning</option>
                  <option value="maintenance">Maintenance</option>
                  {room.status === 'booked' && <option value="booked">Booked</option>}
                </select>
              )}

              {room.guest_id && (
                <div className="mt-3 space-y-1">
                  <p className="text-sm text-surface-800">{room.guest_name}</p>
                  <p className="text-xs text-surface-500">{room.phone}</p>
                  <p className="text-xs text-surface-500">Balance: ₹{Number(room.balance_amount || 0).toFixed(2)}</p>
                  <p className="text-xs text-surface-500">Out: {room.expected_checkout_at || '-'}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {Number(room.balance_amount || 0) > 0 && (
                      <button
                        className="btn-primary btn btn-sm"
                        onClick={() => {
                          setSelectedGuest({
                            id: room.guest_id,
                            guest_name: room.guest_name,
                            room_no: room.room_no,
                            balance_amount: room.balance_amount,
                          })
                          setPaymentForm({
                            amount: Number(room.balance_amount || 0).toFixed(2),
                            payment_mode: 'cash',
                          })
                          setShowPaymentModal(true)
                        }}
                      >
                        Add Payment
                      </button>
                    )}
                    <button className="btn-secondary btn btn-sm" onClick={() => onCheckout(room.guest_id)}>Checkout</button>
                    <button className="btn-ghost btn btn-sm" onClick={() => openFinalBill({ id: room.guest_id, guest_name: room.guest_name, room_no: room.room_no })}>Bill</button>
                  </div>
                </div>
              )}

              <div className="flex gap-1 mt-2 pt-2 border-t border-black/5">
                <button className="btn-ghost btn btn-sm" onClick={() => openRoomEdit(room)}>Edit</button>
                <button className="btn-ghost btn btn-sm text-red-600" onClick={() => onDeleteRoom(room)}>Delete</button>
              </div>
            </div>
          ))}
          {dashboard.rooms.length === 0 && (
            <p className="col-span-full text-center text-surface-500 py-6">Koi room nahi — “+ Add Room” se shuru karein.</p>
          )}
        </div>
      </div>

      {/* Bookings */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-surface-200 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xl font-bold text-surface-900">Advance Bookings</h2>
          <input className="input w-60" placeholder="Search booking..." value={bookingSearch}
            onChange={e => { setBookingSearch(e.target.value); setBookingPage(1) }} />
        </div>
        <div className="overflow-x-auto">
          <table className="table-auto">
            <thead>
              <tr>
                <th className="th">Guest</th><th className="th">Room</th><th className="th">From</th><th className="th">To</th>
                <th className="th">Advance</th><th className="th">Balance</th><th className="th">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedBookings.map(b => (
                <tr key={b.id}>
                  <td className="td">{b.guest_name}<div className="text-xs text-surface-400">{b.phone}</div></td>
                  <td className="td">{b.room_no}</td>
                  <td className="td">{b.booking_from || '-'}</td>
                  <td className="td">{b.booking_to || '-'}</td>
                  <td className="td">₹{Number(b.advance_amount || 0).toFixed(2)}</td>
                  <td className="td">₹{Number(b.balance_amount || 0).toFixed(2)}</td>
                  <td className="td">
                    <div className="flex flex-wrap gap-1">
                      <button className="btn-primary btn btn-sm" onClick={() => openConvertBooking(b)}>Check-in</button>
                      <button className="btn-secondary btn btn-sm" onClick={() => { setSelectedGuest(b); setPaymentForm({ amount: '', payment_mode: b.payment_mode || 'cash' }); setShowPaymentModal(true) }}>Advance Payment</button>
                      <button className="btn-ghost btn btn-sm" onClick={() => openEdit(b)}>Edit</button>
                      <button className="btn-ghost btn btn-sm text-red-600" onClick={() => onCancelBooking(b)}>Cancel</button>
                    </div>
                  </td>
                </tr>
              ))}
              {bookings.length === 0 && <tr><td colSpan={7} className="td text-center text-surface-500">Koi advance booking nahi.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <Pagination page={bookingPage} pages={bookingPages} onPage={setBookingPage} />

      {/* Recent guests */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-surface-200 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xl font-bold text-surface-900">Guest Records</h2>
          <input className="input w-60" placeholder="Search guest/phone/room..." value={recentGuestSearch}
            onChange={e => { setRecentGuestSearch(e.target.value); setRecentGuestPage(1) }} />
        </div>
        <div className="overflow-x-auto">
          <table className="table-auto">
            <thead>
              <tr>
                <th className="th">Guest</th><th className="th">Phone</th><th className="th">Room</th><th className="th">Stay</th>
                <th className="th">Persons</th><th className="th">Paid</th><th className="th">Balance</th><th className="th">Status</th><th className="th">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedRecentGuests.map(g => (
                <tr key={g.id}>
                  <td className="td">{g.guest_name}</td>
                  <td className="td">{g.phone}</td>
                  <td className="td">{g.room_no}</td>
                  <td className="td text-xs">{(g.booking_from || g.check_in_at || '-')}<br />{(g.booking_to || g.check_out_at || g.expected_checkout_at || '-')}</td>
                  <td className="td">{Number(g.adults_count || 1) + Number(g.children_count || 0)}</td>
                  <td className="td">₹{Number(g.paid_amount || 0).toFixed(2)}</td>
                  <td className="td">₹{Number(g.balance_amount || 0).toFixed(2)}</td>
                  <td className="td"><span className={`badge ${g.status === 'checked_in' ? 'badge-blue' : 'badge-gray'}`}>{g.status}</span></td>
                  <td className="td">
                    <div className="flex flex-wrap gap-1">
                      {g.status === 'checked_in' && (
                        <button className="btn-secondary btn btn-sm" onClick={() => { setSelectedGuest(g); setShowPaymentModal(true) }}>Payment</button>
                      )}
                      {['checked_in', 'reserved'].includes(g.status) && (
                        <button className="btn-secondary btn btn-sm" onClick={() => { setSelectedGuest(g); setShowChargeModal(true) }}>+ Charge</button>
                      )}
                      <button className="btn-secondary btn btn-sm" onClick={() => openFinalBill(g)}>Final Bill</button>
                      <button className="btn-ghost btn btn-sm" onClick={() => openEdit(g)}>Edit</button>
                    </div>
                  </td>
                </tr>
              ))}
              {recentGuests.length === 0 && <tr><td colSpan={9} className="td text-center text-surface-500">Abhi koi guest record nahi.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <Pagination page={recentGuestPage} pages={recentGuestPages} onPage={setRecentGuestPage} />

      {/* ---------------- Walk-in / Check-in modal ---------------- */}
      <Modal open={showGuestModal} onClose={() => setShowGuestModal(false)} title={form.booking_id ? 'Convert Booking → Check-in' : 'Walk-in Guest Check-in'} size="md">
        <form className="space-y-3" onSubmit={onCheckIn}>
          {/* <div className="rounded-lg bg-surface-50 border border-surface-200 px-3 py-2 text-xs text-surface-600">
            Saare fields optional hain. Jo available ho wahi bharein, baaki baad me <strong>Edit</strong> se kabhi bhi add ya change kar sakte hain.
            <br />Standard timing: check-in <strong>11:00 AM</strong>, check-out <strong>12:00 PM</strong> (agla din). Apne hisaab se badal sakte hain.
          </div> */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="form-group"><label className="label">Guest Name</label>
              <input className="input" value={form.guest_name} onChange={e => setForm(p => ({ ...p, guest_name: e.target.value }))} placeholder="Customer Name" /></div>
            <div className="form-group"><label className="label">Mobile Number</label>
              <input className="input" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="+91 XXXXXXXXXX" /></div>
            <div className="form-group md:col-span-2"><label className="label">Address</label>
              <textarea rows={2} className="textarea" value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} placeholder="Address" /></div>
            <div className="form-group"><label className="label">ID Proof</label>
              <input className="input" value={form.id_proof} onChange={e => setForm(p => ({ ...p, id_proof: e.target.value }))} placeholder="Aadhaar / PAN / Passport / Driving License" /></div>
            <div className="form-group"><label className="label">Room Category</label>
              <select className="select" value={form.category_id} onChange={e => setForm(p => ({ ...p, category_id: e.target.value, room_no: '' }))}>
                <option value="">Select category</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
            <div className="form-group">
              <label className="label">Room Number <span className="text-surface-400 font-normal">(check-in ke liye zaroori)</span></label>
              <select className="select" value={form.room_no} disabled={!form.category_id}
                onChange={e => setForm(p => ({ ...p, room_no: e.target.value }))}>
                <option value="">
                  {!form.category_id
                    ? 'Pehle room category select karein'
                    : availableRooms.length === 0
                      ? 'Is category me koi room nahi'
                      : 'Select room'}
                </option>
                {availableRooms.map(r => {
                  const free = r.is_available === undefined ? true : Number(r.is_available) === 1
                  return (
                    <option key={r.id || r.room_no} value={r.room_no} disabled={!free}>
                      {r.room_no} — {free ? 'Available' : 'Occupied'}
                      {Number(r.rent) > 0 ? ` · ₹${Number(r.rent).toFixed(0)}/night` : ''}
                    </option>
                  )
                })}
              </select>
              {form.category_id && availableRooms.length > 0 && (
                <p className="text-xs text-surface-400 mt-1">
                  {availableRooms.filter(r => r.is_available === undefined || Number(r.is_available) === 1).length} free
                  · {availableRooms.filter(r => Number(r.is_available) === 0).length} occupied
                </p>
              )}
              {form.category_id && availableRooms.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">Is category me abhi koi room nahi hai. Pehle room add karein.</p>
              )}
            </div>
            <div className="form-group"><label className="label">From Date &amp; Time</label>
              <input type="datetime-local" className="input" value={form.from_date}
                onChange={e => setForm(p => {
                  const from = e.target.value
                  const checkOut = checkoutFor(from)
                  return { ...p, from_date: from, to_date: checkOut, expected_checkout_at: checkOut }
                })} />
              <p className="text-xs text-surface-400 mt-1"></p></div>
            <div className="form-group"><label className="label">To Date &amp; Time</label>
              <input type="datetime-local" className="input" value={form.to_date}
                onChange={e => setForm(p => ({ ...p, to_date: e.target.value, expected_checkout_at: e.target.value }))} /></div>
            <div className="form-group"><label className="label">Expected Checkout</label>
              <input type="datetime-local" className="input" value={form.expected_checkout_at} onChange={e => setForm(p => ({ ...p, expected_checkout_at: e.target.value }))} /></div>
            <div className="form-group"><label className="label">Adults</label>
              <input type="number" min="1" className="input" value={form.adults_count} onChange={e => setForm(p => ({ ...p, adults_count: e.target.value }))} /></div>
            <div className="form-group"><label className="label">Children</label>
              <input type="number" min="0" className="input" value={form.children_count} onChange={e => setForm(p => ({ ...p, children_count: e.target.value }))} /></div>
            <div className="form-group"><label className="label">Extra Bed (count)</label>
              <input type="number" min="0" className="input" value={form.extra_bed_count} onChange={e => setForm(p => ({ ...p, extra_bed_count: e.target.value }))} /></div>
            <div className="form-group"><label className="label">Extra Bed Rate (₹/night)</label>
              <input type="number" step="0.01" className="input" value={form.extra_bed_rate} onChange={e => setForm(p => ({ ...p, extra_bed_rate: e.target.value }))} /></div>
            <div className="form-group"><label className="label">Total Amount (Room Rent)</label>
              <input type="number" step="0.01" className="input" value={form.total_amount} onChange={e => setForm(p => ({ ...p, total_amount: e.target.value }))} /></div>
            <div className="form-group"><label className="label">Advance / Paid</label>
              <input type="number" step="0.01" className="input" value={form.advance_amount} onChange={e => setForm(p => ({ ...p, advance_amount: e.target.value, paid_amount: e.target.value }))} /></div>
            <div className="form-group"><label className="label">Payment Mode</label>
              <select className="select" value={form.payment_mode} onChange={e => setForm(p => ({ ...p, payment_mode: e.target.value }))}>
                <option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option>
                <option value="credit">Credit</option><option value="bank">Bank</option>
              </select></div>
            <div className="form-group"><label className="label">ID Proof Photo</label>
              <input type="file" accept="image/png,image/jpeg" className="input"
                onChange={e => { const f = e.target.files?.[0]; if (f) fileToDataUrl(f, d => setForm(p => ({ ...p, id_proof_photo: d }))) }} />
              {form.id_proof_photo && <img src={form.id_proof_photo} alt="id" className="mt-2 h-16 rounded border" />}</div>
            <div className="form-group"><label className="label">Guest Photo</label>
              <input type="file" accept="image/png,image/jpeg" className="input"
                onChange={e => { const f = e.target.files?.[0]; if (f) fileToDataUrl(f, d => setForm(p => ({ ...p, guest_photo: d }))) }} />
              {form.guest_photo && <img src={form.guest_photo} alt="guest" className="mt-2 h-16 rounded border" />}</div>
            <div className="form-group md:col-span-2"><label className="label">Companion Names (optional)</label>
              <textarea rows={2} className="textarea" value={form.companions} onChange={e => setForm(p => ({ ...p, companions: e.target.value }))} /></div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary btn" onClick={() => setShowGuestModal(false)}>Cancel</button>
            <button className="btn-primary btn" disabled={submitting}>{submitting ? 'Saving…' : 'Check-in'}</button>
          </div>
        </form>
      </Modal>

      {/* ---------------- Advance booking modal ---------------- */}
      <Modal open={showBookingModal} onClose={() => setShowBookingModal(false)} title="Advance Room Booking" size="md">
        <form className="space-y-3" onSubmit={onCreateBooking}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="form-group"><label className="label">Guest Name *</label>
              <input className="input" value={bookingForm.guest_name} onChange={e => setBookingForm(p => ({ ...p, guest_name: e.target.value }))} /></div>
            <div className="form-group"><label className="label">Mobile Number *</label>
              <input className="input" value={bookingForm.phone} onChange={e => setBookingForm(p => ({ ...p, phone: e.target.value }))} /></div>
            <div className="form-group md:col-span-2"><label className="label">Address *</label>
              <textarea rows={2} className="textarea" value={bookingForm.address} onChange={e => setBookingForm(p => ({ ...p, address: e.target.value }))} /></div>
            <div className="form-group"><label className="label">ID Proof Number</label>
              <input className="input" value={bookingForm.id_proof} onChange={e => setBookingForm(p => ({ ...p, id_proof: e.target.value }))} /></div>
            <div className="form-group"><label className="label">Room Category *</label>
              <select className="select" value={bookingForm.category_id} onChange={e => setBookingForm(p => ({ ...p, category_id: e.target.value, room_no: '' }))}>
                <option value="">Select category</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
            <div className="form-group"><label className="label">From Date &amp; Time *</label>
              <input type="datetime-local" className="input" value={bookingForm.from_date} onChange={e => setBookingForm(p => ({ ...p, from_date: e.target.value }))} /></div>
            <div className="form-group"><label className="label">To Date &amp; Time *</label>
              <input type="datetime-local" className="input" value={bookingForm.to_date} onChange={e => setBookingForm(p => ({ ...p, to_date: e.target.value }))} /></div>
            <div className="form-group"><label className="label">Room Number *</label>
              <select className="select" value={bookingForm.room_no} onChange={e => setBookingForm(p => ({ ...p, room_no: e.target.value }))}>
                <option value="">Select room</option>
                {bookingAvailableRooms.map(r => <option key={r.id || r.room_no} value={r.room_no}>{r.room_no}{r.rent ? ` · ₹${Number(r.rent).toFixed(0)}` : ''}</option>)}
              </select></div>
            <div className="form-group"><label className="label">Adults</label>
              <input type="number" min="1" className="input" value={bookingForm.adults_count} onChange={e => setBookingForm(p => ({ ...p, adults_count: e.target.value }))} /></div>
            <div className="form-group"><label className="label">Children</label>
              <input type="number" min="0" className="input" value={bookingForm.children_count} onChange={e => setBookingForm(p => ({ ...p, children_count: e.target.value }))} /></div>
            <div className="form-group"><label className="label">Total Amount</label>
              <input type="number" step="0.01" className="input" value={bookingForm.total_amount} onChange={e => setBookingForm(p => ({ ...p, total_amount: e.target.value }))} /></div>
            <div className="form-group"><label className="label">Advance Amount</label>
              <input type="number" step="0.01" className="input" value={bookingForm.advance_amount} onChange={e => setBookingForm(p => ({ ...p, advance_amount: e.target.value }))} /></div>
            <div className="form-group"><label className="label">Payment Mode</label>
              <select className="select" value={bookingForm.payment_mode} onChange={e => setBookingForm(p => ({ ...p, payment_mode: e.target.value }))}>
                <option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option>
                <option value="credit">Credit</option><option value="bank">Bank</option>
              </select></div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary btn" onClick={() => setShowBookingModal(false)}>Cancel</button>
            <button className="btn-primary btn" disabled={submitting}>{submitting ? 'Saving…' : 'Create Booking'}</button>
          </div>
        </form>
      </Modal>

      {/* ---------------- Payment ---------------- */}
      <Modal open={showPaymentModal} onClose={() => setShowPaymentModal(false)} title="Advance / Guest Payment" size="sm">
        <form className="space-y-3" onSubmit={onAddPayment}>
          <div className="text-sm text-surface-600">
            {selectedGuest ? `${selectedGuest.guest_name} · Room ${selectedGuest.room_no}` : ''}
          </div>
          {selectedGuest && Number(selectedGuest.balance_amount || 0) > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
              Pending balance: <strong>₹{Number(selectedGuest.balance_amount).toFixed(2)}</strong>
              <div className="text-xs mt-1">Full pending amount is pre-filled. You can change it for a partial payment.</div>
            </div>
          )}
          <div className="form-group"><label className="label">Amount *</label>
            <input type="number" step="0.01" className="input" value={paymentForm.amount} onChange={e => setPaymentForm(p => ({ ...p, amount: e.target.value }))} /></div>
          <div className="form-group"><label className="label">Payment Mode</label>
            <select className="select" value={paymentForm.payment_mode} onChange={e => setPaymentForm(p => ({ ...p, payment_mode: e.target.value }))}>
              <option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option>
              <option value="credit">Credit</option><option value="bank">Bank</option>
            </select></div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary btn" onClick={() => setShowPaymentModal(false)}>Cancel</button>
            <button className="btn-primary btn" disabled={submitting}>{submitting ? 'Saving…' : 'Save Payment'}</button>
          </div>
        </form>
      </Modal>

      {/* ---------------- Edit guest / booking ---------------- */}
      <Modal open={showEditModal} onClose={() => setShowEditModal(false)} title="Edit Guest / Booking" size="md">
        {editForm && (
          <form className="space-y-3" onSubmit={onEditGuest}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="form-group"><label className="label">Guest Name</label><input className="input" value={editForm.guest_name} onChange={e => setEditForm(p => ({ ...p, guest_name: e.target.value }))} /></div>
              <div className="form-group"><label className="label">Phone</label><input className="input" value={editForm.phone} onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))} /></div>
              <div className="form-group"><label className="label">Category</label>
                <select className="select" value={editForm.category_id} onChange={e => setEditForm(p => ({ ...p, category_id: e.target.value }))}>
                  <option value="">Select category</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select></div>
              <div className="form-group"><label className="label">Room</label>
                <select className="select" value={editForm.room_no} onChange={e => setEditForm(p => ({ ...p, room_no: e.target.value }))}>
                  <option value="">Select room</option>
                  {!editAvailableRooms.includes(editForm.room_no) && editForm.room_no && <option value={editForm.room_no}>{editForm.room_no}</option>}
                  {editAvailableRooms.map(r => <option key={r} value={r}>{r}</option>)}
                </select></div>
              <div className="form-group"><label className="label">From Date &amp; Time</label><input type="datetime-local" className="input" value={editForm.from_date} onChange={e => setEditForm(p => ({ ...p, from_date: e.target.value }))} /></div>
              <div className="form-group"><label className="label">To Date &amp; Time</label><input type="datetime-local" className="input" value={editForm.to_date} onChange={e => setEditForm(p => ({ ...p, to_date: e.target.value, expected_checkout_at: e.target.value }))} /></div>
              <div className="form-group"><label className="label">Expected Checkout</label><input type="datetime-local" className="input" value={editForm.expected_checkout_at} onChange={e => setEditForm(p => ({ ...p, expected_checkout_at: e.target.value }))} /></div>
              <div className="form-group"><label className="label">Status</label>
                <select className="select" value={editForm.status} onChange={e => setEditForm(p => ({ ...p, status: e.target.value }))}>
                  <option value="reserved">Reserved</option><option value="checked_in">Checked In</option>
                  <option value="checked_out">Checked Out</option><option value="cancelled">Cancelled</option>
                </select></div>
              <div className="form-group"><label className="label">Total</label><input type="number" step="0.01" className="input" value={editForm.total_amount} onChange={e => setEditForm(p => ({ ...p, total_amount: e.target.value }))} /></div>
              <div className="form-group"><label className="label">Advance</label><input type="number" step="0.01" className="input" value={editForm.advance_amount} onChange={e => setEditForm(p => ({ ...p, advance_amount: e.target.value }))} /></div>
              <div className="form-group"><label className="label">Paid</label><input type="number" step="0.01" className="input" value={editForm.paid_amount} onChange={e => setEditForm(p => ({ ...p, paid_amount: e.target.value }))} /></div>
              <div className="form-group"><label className="label">Payment Mode</label>
                <select className="select" value={editForm.payment_mode} onChange={e => setEditForm(p => ({ ...p, payment_mode: e.target.value }))}>
                  <option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option>
                  <option value="credit">Credit</option><option value="bank">Bank</option>
                </select></div>
              <div className="form-group"><label className="label">Adults</label><input type="number" min="1" className="input" value={editForm.adults_count} onChange={e => setEditForm(p => ({ ...p, adults_count: e.target.value }))} /></div>
              <div className="form-group"><label className="label">Children</label><input type="number" min="0" className="input" value={editForm.children_count} onChange={e => setEditForm(p => ({ ...p, children_count: e.target.value }))} /></div>
              <div className="form-group"><label className="label">Extra Bed (count)</label><input type="number" min="0" className="input" value={editForm.extra_bed_count ?? 0} onChange={e => setEditForm(p => ({ ...p, extra_bed_count: e.target.value }))} /></div>
              <div className="form-group"><label className="label">Extra Bed Rate (₹/night)</label><input type="number" step="0.01" className="input" value={editForm.extra_bed_rate ?? ''} onChange={e => setEditForm(p => ({ ...p, extra_bed_rate: e.target.value }))} /></div>
              <div className="form-group md:col-span-2"><label className="label">Companion Names</label><textarea rows={2} className="textarea" value={editForm.companions} onChange={e => setEditForm(p => ({ ...p, companions: e.target.value }))} /></div>
              <div className="form-group md:col-span-2"><label className="label">Companion ID Details</label><textarea rows={2} className="textarea" value={editForm.companions_id_details} onChange={e => setEditForm(p => ({ ...p, companions_id_details: e.target.value }))} /></div>
              <div className="form-group md:col-span-2"><label className="label">Address</label><textarea rows={2} className="textarea" value={editForm.address} onChange={e => setEditForm(p => ({ ...p, address: e.target.value }))} /></div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary btn" onClick={() => setShowEditModal(false)}>Cancel</button>
              <button className="btn-primary btn" disabled={submitting}>{submitting ? 'Saving…' : 'Save Changes'}</button>
            </div>
          </form>
        )}
      </Modal>

      {/* ---------------- Final bill / invoice ---------------- */}
      <Modal open={showBillModal} onClose={() => setShowBillModal(false)} title="Final Bill / Invoice" size="lg">
        {billData && (
          <div className="space-y-3">
            <div className="rounded-xl border border-surface-200 bg-surface-50 p-2">
              <GuestInvoice billData={billData} settings={settings} />
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className="btn-secondary btn" onClick={() => setShowChargeModal(true)}>+ Extra Charge</button>
              <button type="button" className="btn-secondary btn" onClick={() => setShowLateOut(true)}>Late Check-out</button>
              <button type="button" className="btn-secondary btn" onClick={() => openFinalBill(selectedGuest)}>↻ Refresh</button>
              <button type="button" className="btn-secondary btn" onClick={printGuestInvoice}>🖨 Print Invoice</button>
              <button type="button" className="btn-primary btn" onClick={() => downloadGuestInvoicePdf(billData, settings)}>⬇ PDF Invoice</button>
            </div>
          </div>
        )}
      </Modal>

      {/* ---------------- Extra charge ---------------- */}
      <Modal open={showChargeModal} onClose={() => setShowChargeModal(false)} title="Add Extra Charge" size="sm">
        {selectedGuest && (
          <form className="space-y-3" onSubmit={onAddCharge}>
            <div className="text-sm text-surface-600">{selectedGuest.guest_name} · Room {selectedGuest.room_no}</div>
            <div className="form-group"><label className="label">Charge Type *</label>
              <select className="select" value={chargeForm.charge_type} onChange={e => setChargeForm(p => ({ ...p, charge_type: e.target.value }))}>
                <option value="food">Food Bill</option>
                <option value="laundry">Laundry</option>
                <option value="other">Other Charges</option>
              </select></div>
            <div className="form-group"><label className="label">Amount *</label>
              <input type="number" step="0.01" className="input" value={chargeForm.amount} onChange={e => setChargeForm(p => ({ ...p, amount: e.target.value }))} /></div>
            <div className="form-group"><label className="label">Description</label>
              <input className="input" value={chargeForm.description} onChange={e => setChargeForm(p => ({ ...p, description: e.target.value }))} placeholder="Optional" /></div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary btn" onClick={() => setShowChargeModal(false)}>Cancel</button>
              <button className="btn-primary btn" disabled={submitting}>{submitting ? 'Saving…' : 'Save Charge'}</button>
            </div>
          </form>
        )}
      </Modal>

      {/* ---------------- Late check-out ---------------- */}
      <Modal open={showLateOut} onClose={() => setShowLateOut(false)} title="Late Check-out Charge" size="sm">
        <form className="space-y-3" onSubmit={onLateOut}>
          <div className="text-sm text-surface-600">{selectedGuest?.guest_name} · Room {selectedGuest?.room_no}</div>
          <div className="form-group"><label className="label">Late Check-out Amount (₹) *</label>
            <input type="number" step="0.01" className="input" value={lateOutForm.amount} onChange={e => setLateOutForm(p => ({ ...p, amount: e.target.value }))} /></div>
          <div className="form-group"><label className="label">Note</label>
            <input className="input" value={lateOutForm.note} onChange={e => setLateOutForm(p => ({ ...p, note: e.target.value }))} /></div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary btn" onClick={() => setShowLateOut(false)}>Cancel</button>
            <button className="btn-primary btn" disabled={submitting}>{submitting ? 'Saving…' : 'Add & Refresh Bill'}</button>
          </div>
        </form>
      </Modal>

      {/* ---------------- Add room ---------------- */}
      <Modal open={showRoomModal} onClose={() => setShowRoomModal(false)} title="Add Room" size="sm">
        <form className="space-y-3" onSubmit={onCreateRoom}>
          <div className="form-group"><label className="label">Room No *</label>
            <input className="input" value={roomForm.room_no} onChange={e => setRoomForm(p => ({ ...p, room_no: e.target.value }))} /></div>
          <div className="form-group"><label className="label">Floor *</label>
            <input className="input" value={roomForm.floor_no} onChange={e => setRoomForm(p => ({ ...p, floor_no: e.target.value }))} /></div>
          <div className="form-group"><label className="label">Category *</label>
            <div className="flex gap-2">
              <select className="select" value={roomForm.category_id} onChange={e => setRoomForm(p => ({ ...p, category_id: e.target.value }))}>
                <option value="">Select category</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button type="button" className="btn-secondary btn btn-sm" onClick={() => { setShowRoomModal(false); setShowCategoryModal(true) }}>+ New</button>
            </div></div>
          <div className="form-group"><label className="label">Rent per Night (₹)</label>
            <input type="number" step="0.01" className="input" value={roomForm.rent} onChange={e => setRoomForm(p => ({ ...p, rent: e.target.value }))} /></div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary btn" onClick={() => setShowRoomModal(false)}>Cancel</button>
            <button className="btn-primary btn">Add Room</button>
          </div>
        </form>
      </Modal>

      {/* ---------------- Edit room ---------------- */}
      <Modal open={showRoomEdit} onClose={() => setShowRoomEdit(false)} title="Edit Room" size="sm">
        {roomEditForm && (
          <form className="space-y-3" onSubmit={onSaveRoomEdit}>
            <div className="form-group"><label className="label">Room No *</label>
              <input className="input" value={roomEditForm.room_no} onChange={e => setRoomEditForm(p => ({ ...p, room_no: e.target.value }))} /></div>
            <div className="form-group"><label className="label">Floor</label>
              <input className="input" value={roomEditForm.floor_no} onChange={e => setRoomEditForm(p => ({ ...p, floor_no: e.target.value }))} /></div>
            <div className="form-group"><label className="label">Category</label>
              <select className="select" value={roomEditForm.category_id} onChange={e => setRoomEditForm(p => ({ ...p, category_id: e.target.value }))}>
                <option value="">Select category</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
            <div className="form-group"><label className="label">Rent per Night (₹)</label>
              <input type="number" step="0.01" className="input" value={roomEditForm.rent} onChange={e => setRoomEditForm(p => ({ ...p, rent: e.target.value }))} /></div>
            <div className="form-group"><label className="label">Status</label>
              <select className="select" value={roomEditForm.status} onChange={e => setRoomEditForm(p => ({ ...p, status: e.target.value }))}>
                <option value="available">Available</option><option value="booked">Booked</option>
                <option value="cleaning">Cleaning</option><option value="maintenance">Maintenance</option>
              </select></div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary btn" onClick={() => setShowRoomEdit(false)}>Cancel</button>
              <button className="btn-primary btn" disabled={submitting}>{submitting ? 'Saving…' : 'Save Room'}</button>
            </div>
          </form>
        )}
      </Modal>

      {/* ---------------- Add category ---------------- */}
      <Modal open={showCategoryModal} onClose={() => setShowCategoryModal(false)} title="Add Room Category" size="sm">
        <form className="space-y-3" onSubmit={onCreateCategory}>
          <div className="form-group"><label className="label">Category Name *</label>
            <input className="input" value={categoryForm.name} onChange={e => setCategoryForm({ name: e.target.value })} placeholder="Standard / Deluxe / Suite" /></div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary btn" onClick={() => setShowCategoryModal(false)}>Cancel</button>
            <button className="btn-primary btn">Add Category</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
