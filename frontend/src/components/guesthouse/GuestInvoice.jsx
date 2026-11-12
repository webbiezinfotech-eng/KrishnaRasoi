import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export const money = n => `₹${Number(n || 0).toFixed(2)}`

/** Line items + GST maths shared by screen, print and PDF. */
export function buildInvoice(billData, settings) {
  const g = billData?.guest || {}
  const gstPct = Number(settings?.tax_percentage || 0)
  const lines = (billData?.lines || []).filter(l => Number(l.amount) > 0)
  const subTotal = Number(billData?.sub_total || 0)
  const gstAmount = gstPct > 0 ? +(subTotal * gstPct / 100).toFixed(2) : 0
  const grandTotal = +(subTotal + gstAmount).toFixed(2)
  const paid = Number(billData?.paid_amount || 0)
  return {
    guest: g,
    lines,
    subTotal,
    gstPct,
    gstAmount,
    grandTotal,
    paid,
    balance: Number.isFinite(Number(billData?.balance_amount)) ? Number(billData.balance_amount) : +(grandTotal - paid).toFixed(2),
    nights: billData?.nights || 1,
    invoiceNo: `${settings?.invoice_prefix || 'KS'}-${String(g.id || 0).padStart(5, '0')}`,
    issuedOn: new Date().toLocaleString('en-IN'),
  }
}

/** Printable invoice block — hidden on screen except inside the modal preview. */
export default function GuestInvoice({ billData, settings, id = 'gh-invoice' }) {
  if (!billData) return null
  const inv = buildInvoice(billData, settings)
  const house = settings?.guest_house_name || 'Kripa Shanti Atithi Bhavan'

  return (
    <div id={id} className="bg-white text-surface-900 p-6">
      <div className="flex items-start justify-between gap-4 border-b border-surface-200 pb-4">
        <div className="flex items-center gap-3">
          {settings?.logo_data
            ? <img src={settings.logo_data} alt="logo" className="h-16 w-16 object-contain" />
            : <div className="h-16 w-16 rounded bg-surface-100 flex items-center justify-center text-xs text-surface-400">LOGO</div>}
          <div>
            <p className="font-display font-bold text-lg leading-tight">{house}</p>
            {settings?.guest_house_address && <p className="text-xs text-surface-500">{settings.guest_house_address}</p>}
            {settings?.guest_house_phone && <p className="text-xs text-surface-500">Ph: {settings.guest_house_phone}</p>}
            {settings?.gst_number && <p className="text-xs text-surface-500">GSTIN: {settings.gst_number}</p>}
          </div>
        </div>
        <div className="text-right">
          <p className="font-bold tracking-wide">TAX INVOICE</p>
          <p className="text-xs text-surface-500">Invoice: {inv.invoiceNo}</p>
          <p className="text-xs text-surface-500">Date: {inv.issuedOn}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 py-4 text-sm">
        <div>
          <p className="text-xs uppercase text-surface-400 mb-1">Guest</p>
          <p className="font-semibold">{inv.guest.guest_name}</p>
          <p className="text-surface-600">{inv.guest.phone}</p>
          <p className="text-surface-600">{inv.guest.address}</p>
          {inv.guest.id_proof && <p className="text-xs text-surface-500">ID: {inv.guest.id_proof}</p>}
        </div>
        <div className="text-right">
          <p className="text-xs uppercase text-surface-400 mb-1">Stay</p>
          <p>Room <strong>{inv.guest.room_no}</strong> · {inv.nights} night(s)</p>
          <p className="text-surface-600">In: {inv.guest.check_in_at || inv.guest.booking_from || '-'}</p>
          <p className="text-surface-600">Out: {inv.guest.check_out_at || inv.guest.expected_checkout_at || inv.guest.booking_to || '-'}</p>
          <p className="text-surface-600">Mode: {(inv.guest.payment_mode || '-').toUpperCase()}</p>
        </div>
      </div>

      <table className="w-full text-sm border-t border-surface-200">
        <thead>
          <tr className="text-left text-surface-500">
            <th className="py-2">Particulars</th>
            <th className="py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {inv.lines.map((l, i) => (
            <tr key={i} className="border-t border-surface-100">
              <td className="py-1.5">{l.label}</td>
              <td className="py-1.5 text-right">{money(l.amount)}</td>
            </tr>
          ))}
          {inv.lines.length === 0 && (
            <tr><td className="py-2 text-surface-400" colSpan={2}>No charges</td></tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t border-surface-200">
            <td className="py-1.5 text-surface-600">Sub Total</td>
            <td className="py-1.5 text-right">{money(inv.subTotal)}</td>
          </tr>
          <tr>
            <td className="py-1.5 text-surface-600">GST @ {inv.gstPct}%</td>
            <td className="py-1.5 text-right">{money(inv.gstAmount)}</td>
          </tr>
          <tr className="font-bold text-base border-t border-surface-300">
            <td className="py-2">Grand Total</td>
            <td className="py-2 text-right">{money(inv.grandTotal)}</td>
          </tr>
          <tr>
            <td className="py-1 text-surface-600">Paid / Advance</td>
            <td className="py-1 text-right">{money(inv.paid)}</td>
          </tr>
          <tr className="font-bold text-red-600">
            <td className="py-1">Balance Due</td>
            <td className="py-1 text-right">{money(inv.balance)}</td>
          </tr>
        </tfoot>
      </table>

      {(billData?.payments || []).length > 0 && (
        <div className="mt-5">
          <p className="font-semibold text-sm mb-2">Payment History</p>
          <table className="w-full text-xs">
            <thead><tr className="border-b border-surface-200 text-left"><th className="py-1">Date &amp; Time</th><th className="py-1">Mode</th><th className="py-1 text-right">Amount</th></tr></thead>
            <tbody>
              {billData.payments.map((payment, index) => (
                <tr key={index} className="border-b border-surface-100">
                  <td className="py-1">{payment.created_at}</td>
                  <td className="py-1">{String(payment.payment_mode || '').toUpperCase()}</td>
                  <td className="py-1 text-right">{money(payment.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-surface-400 mt-6 border-t border-surface-200 pt-3">
        Thank you for staying with us.
      </p>
    </div>
  )
}

/** Browser print — sirf invoice chhapta hai. */
export function printGuestInvoice() {
  const node = document.getElementById('gh-invoice')
  if (!node) return
  const w = window.open('', '_blank', 'width=820,height=900')
  if (!w) return
  w.document.write(`<html><head><title>Invoice</title>
    <style>
      body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial;margin:24px;color:#111}
      table{width:100%;border-collapse:collapse} th,td{font-size:13px} img{max-height:64px}
      .flex{display:flex} .justify-between{justify-content:space-between} .items-start{align-items:flex-start}
      .items-center{align-items:center} .gap-4{gap:16px} .gap-3{gap:12px} .text-right{text-align:right}
      .grid{display:grid} .grid-cols-2{grid-template-columns:1fr 1fr} .py-4{padding:16px 0}
      .py-2{padding:8px 0} .py-1{padding:4px 0} .py-1\\.5{padding:6px 0} .mt-6{margin-top:24px}
      .pt-3{padding-top:12px} .pb-4{padding-bottom:16px} .border-t{border-top:1px solid #e5e7eb}
      .border-b{border-bottom:1px solid #e5e7eb} .font-bold{font-weight:700} .font-semibold{font-weight:600}
      .text-xs{font-size:11px} .text-lg{font-size:18px} .text-base{font-size:15px}
      .text-surface-500{color:#6b7280} .text-surface-400{color:#9ca3af} .text-surface-600{color:#4b5563}
      .uppercase{text-transform:uppercase} .tracking-wide{letter-spacing:.04em} .leading-tight{line-height:1.2}
      .text-red-600{color:#dc2626} .bg-surface-100{background:#f3f4f6} .rounded{border-radius:6px}
      .w-16{width:64px} .h-16{height:64px} .object-contain{object-fit:contain}
    </style></head><body>${node.innerHTML}</body></html>`)
  w.document.close()
  w.focus()
  setTimeout(() => { w.print(); w.close() }, 350)
}

/** PDF invoice with logo header. */
export function downloadGuestInvoicePdf(billData, settings) {
  if (!billData) return
  const inv = buildInvoice(billData, settings)
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const house = settings?.guest_house_name || 'Kripa Shanti Atithi Bhavan'
  let y = 44

  if (settings?.logo_data) {
    try { doc.addImage(settings.logo_data, 'PNG', 40, y - 22, 54, 54) } catch { /* ignore bad image */ }
  }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15)
  doc.text(house, 108, y)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90)
  if (settings?.guest_house_address) { y += 13; doc.text(settings.guest_house_address, 108, y) }
  if (settings?.guest_house_phone)   { y += 12; doc.text(`Ph: ${settings.guest_house_phone}`, 108, y) }
  if (settings?.gst_number)          { y += 12; doc.text(`GSTIN: ${settings.gst_number}`, 108, y) }

  doc.setTextColor(20); doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
  doc.text('TAX INVOICE', 555, 44, { align: 'right' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  doc.text(`Invoice: ${inv.invoiceNo}`, 555, 58, { align: 'right' })
  doc.text(`Date: ${inv.issuedOn}`, 555, 70, { align: 'right' })

  y = Math.max(y, 96) + 22
  doc.setDrawColor(220); doc.line(40, y - 14, 555, y - 14)
  doc.setFontSize(10)
  doc.text(`Guest: ${inv.guest.guest_name || '-'}`, 40, y)
  doc.text(`Room: ${inv.guest.room_no || '-'}  |  ${inv.nights} night(s)`, 555, y, { align: 'right' })
  y += 14
  doc.setFontSize(9); doc.setTextColor(90)
  doc.text(`Mobile: ${inv.guest.phone || '-'}`, 40, y)
  doc.text(`In: ${inv.guest.check_in_at || inv.guest.booking_from || '-'}   Out: ${inv.guest.check_out_at || inv.guest.expected_checkout_at || '-'}`, 555, y, { align: 'right' })
  if (inv.guest.address) { y += 12; doc.text(`Address: ${String(inv.guest.address).slice(0, 90)}`, 40, y) }

  autoTable(doc, {
    startY: y + 18,
    head: [['Particulars', 'Amount']],
    body: inv.lines.map(l => [l.label, Number(l.amount).toFixed(2)]),
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right' } },
  })

  const afterTable = doc.lastAutoTable?.finalY || y + 60
  autoTable(doc, {
    startY: afterTable,
    body: [
      ['Sub Total', inv.subTotal.toFixed(2)],
      [`GST @ ${inv.gstPct}%`, inv.gstAmount.toFixed(2)],
      ['Grand Total', inv.grandTotal.toFixed(2)],
      ['Paid / Advance', inv.paid.toFixed(2)],
      ['Balance Due', inv.balance.toFixed(2)],
    ],
    theme: 'plain',
    styles: { fontSize: 9.5, cellPadding: 4 },
    columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
  })

  if ((billData?.payments || []).length) {
    const paymentY = doc.lastAutoTable?.finalY ? doc.lastAutoTable.finalY + 12 : afterTable + 100
    autoTable(doc, {
      startY: paymentY,
      head: [['Payment History', 'Mode', 'Date & Time', 'Amount']],
      body: billData.payments.map(p => [ '', String(p.payment_mode || '').toUpperCase(), String(p.created_at || ''), Number(p.amount || 0).toFixed(2)]),
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 4 },
      columnStyles: { 3: { halign: 'right' } },
    })
  }

  doc.setFontSize(8); doc.setTextColor(130)
  doc.text('Thank you for staying with us. Computer generated invoice.', 40, 800)
  doc.save(`Invoice-${inv.invoiceNo}.pdf`)
}
