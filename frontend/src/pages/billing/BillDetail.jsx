import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { billingAPI } from '../../services/api'
import BillReceipt, { BILL_RECEIPT_SCREEN_CSS } from '../../components/billing/BillReceipt'
import Spinner from '../../components/ui/Spinner'
import StatusBadge from '../../components/ui/StatusBadge'
import toast from 'react-hot-toast'
import { billPrintPath, kotPrintPath } from '../../utils/thermalPrint'
import { openWhatsApp, buildBillMessage } from '../../utils/whatsappLink'

export default function BillDetail() {
  const { billNumber } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [settleMode, setSettleMode] = useState('cash')
  const [settling, setSettling] = useState(false)

  useEffect(() => {
    billingAPI.show(billNumber).then(r => { setData(r.data.data); setLoading(false) }).catch(() => setLoading(false))
  }, [billNumber])

  const handlePrint = () => {
    if (!data?.bill_number) return
    navigate(billPrintPath(data.bill_number, true))
  }

  const handleKOTPrint = () => {
    if (!data?.order_id) return
    navigate(kotPrintPath(data.order_id, true))
  }

  const markAsPaid = async () => {
    setSettling(true)
    try {
      const r = await billingAPI.markPaid(billNumber, { payment_mode: settleMode })
      setData(r.data.data)
      toast.success('Bill marked as paid.')
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to update payment.')
    } finally {
      setSettling(false)
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>
  if (!data) return <div className="text-center py-20 text-surface-400">Bill not found.</div>

  const bill = data
  const settings = data?.settings || {}
  const isGuestHouse = bill.order_type === 'guest_house'

  const sendOnWhatsApp = () => {
    const phone = bill?.guest_phone || bill?.customer_phone
    if (!phone) {
      const typed = window.prompt('Customer ka WhatsApp number daalein (10 digit):')
      if (!typed) return
      openWhatsApp(typed, buildBillMessage(bill, settings))
      return
    }
    openWhatsApp(phone, buildBillMessage(bill, settings))
  }

  return (
    <div>
      <style>{BILL_RECEIPT_SCREEN_CSS}</style>
      <div className="page-header no-print">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/bills')} className="btn-ghost btn">← Bills</button>
          <h1 className="page-title">Bill #{bill.bill_number}</h1>
          <StatusBadge status={bill.payment_status} />
        </div>
        <div className="flex flex-wrap gap-2">
          {bill.payment_status !== 'paid' && (
            <div className="flex items-center gap-2">
              <select className="input" value={settleMode} onChange={e => setSettleMode(e.target.value)}>
                <option value="cash">Cash</option>
                <option value="upi">Online (UPI)</option>
              </select>
              <button onClick={markAsPaid} className="btn-primary btn" disabled={settling}>
                {settling ? 'Updating…' : 'Mark Paid'}
              </button>
            </div>
          )}
          <button onClick={handleKOTPrint} className="btn-secondary btn">🖨 KOT Print</button>
          <button onClick={handlePrint} className="btn-primary btn">🖨 Print Bill</button>
          <button onClick={sendOnWhatsApp} className="btn-secondary btn">💬 WhatsApp Bill</button>
          <button onClick={() => navigate(`/orders/${bill.order_id}`)} className="btn-secondary btn">
            {isGuestHouse ? 'Add Items / Order' : 'View Order'}
          </button>
        </div>
      </div>

      <div className="max-w-md mx-auto">
        <div className="card shadow-card-lg overflow-hidden rounded-2xl">
          <BillReceipt bill={bill} settings={settings} className="bill-receipt-screen" />
        </div>
      </div>
    </div>
  )
}
