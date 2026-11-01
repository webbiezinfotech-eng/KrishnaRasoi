import { formatCurrency, formatReceiptDateTime, shortDocNumber, paymentModeLabel } from '../../utils/format'

const DEFAULT_FOOTER = 'Thank you for your order!'

/** Shared bill layout — screen preview & print page (commission never shown on bill). */
export default function BillReceipt({ bill, settings, className = '' }) {
  const sym = settings?.currency_symbol || '₹'
  const when = formatReceiptDateTime(bill.created_at)
  const billShort = shortDocNumber(bill.bill_number)
  const orderShort = shortDocNumber(bill.order_number)
  const tableOrRoom = bill.table_label || bill.guest_room || '-'
  const tableLabel = bill.order_type === 'dine_in' ? 'Table' : 'Room'
  const footer = settings?.bill_footer_text || DEFAULT_FOOTER
  const thanksLine = footer.toUpperCase().includes('THANK') || footer.toUpperCase().includes('ORDER')
    ? footer
    : `**** ${footer.toUpperCase()} ****`

  return (
    <div className={className}>
      <div className="br-center">
        <div className="br-biz">{settings?.business_name || 'Restaurant'}</div>
        {settings?.business_address && <div className="br-meta">{settings.business_address}</div>}
        {settings?.business_phone && <div className="br-meta">{settings.business_phone}</div>}
      </div>
      <div className="br-line" />
      <div className="br-center br-title">TAX INVOICE</div>
      <div className="br-line" />
      <div className="br-info">
        Bill {billShort} · Order {orderShort} · {tableLabel} {tableOrRoom}
      </div>
      <div className="br-info">{paymentModeLabel(bill.payment_mode)}</div>
      {bill.guest_name && <div className="br-info">{bill.guest_name}</div>}
      <div className="br-line" />
      <table className="br-table">
        <thead>
          <tr>
            <th>Item</th>
            <th className="br-qty">Qty</th>
            <th className="br-rate">Rate</th>
            <th className="br-amt">Amt</th>
          </tr>
        </thead>
        <tbody>
          {bill.items?.map((item, i) => (
            <tr key={i}>
              <td>{item.item_name}</td>
              <td className="br-qty">{item.quantity}</td>
              <td className="br-rate">{formatCurrency(item.unit_price, sym)}</td>
              <td className="br-amt">{formatCurrency(item.line_total, sym)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="br-line" />
      <div className="br-row"><span>Subtotal</span><span>{formatCurrency(bill.subtotal, sym)}</span></div>
      {parseFloat(bill.tax_amount) > 0 && (
        <div className="br-row"><span>Tax</span><span>{formatCurrency(bill.tax_amount, sym)}</span></div>
      )}
      {parseFloat(bill.discount_amount) > 0 && (
        <div className="br-row"><span>Discount</span><span>-{formatCurrency(bill.discount_amount, sym)}</span></div>
      )}
      <div className="br-total-wrap">
        <div className="br-total-label">TOTAL</div>
        <div className="br-total-amt">{formatCurrency(bill.grand_total, sym)}</div>
      </div>
      <div className="br-line" />
      <div className="br-thanks">{thanksLine}</div>
      <div className="br-foot">Date &amp; Time : {when}</div>
    </div>
  )
}

export const BILL_RECEIPT_CSS = `
  .br-center { text-align: center; }
  .br-biz { font-size: 16px; font-weight: 700; margin-bottom: 2px; }
  .br-meta { font-size: 13px; color: #333; line-height: 1.3; }
  .br-title { font-size: 15px; font-weight: 700; letter-spacing: 1px; }
  .br-line { border-top: 1px dashed #000; margin: 4px 0; }
  .br-info { font-size: 13px; text-align: center; margin: 1px 0; color: #222; }
  .br-table { width: 100%; border-collapse: collapse; font-size: 12px; margin: 2px 0; table-layout: fixed; }
  .br-table th, .br-table td { padding: 2px 1px; vertical-align: top; word-wrap: break-word; }
  .br-table th { border-bottom: 1px solid #000; font-size: 12px; text-align: left; }
  .br-table td:first-child { width: 36%; }
  .br-qty { text-align: center; width: 10%; }
  .br-rate { text-align: right; width: 22%; font-size: 11px; white-space: nowrap; padding-right: 14px; }
  .br-amt { text-align: right; width: 24%; font-size: 11px; white-space: nowrap; padding-left: 10px; }
  .br-row { display: flex; justify-content: space-between; font-size: 13px; margin: 1px 0; }
  .br-total-wrap { text-align: center; margin: 4px 0 2px; }
  .br-total-label { font-size: 13px; color: #555; }
  .br-total-amt { font-size: 21px; font-weight: 700; }
  .br-thanks { text-align: center; font-size: 13px; font-weight: 700; margin: 5px 0 2px; }
  .br-foot { text-align: center; font-size: 12px; color: #555; margin-bottom: 2px; }
`

export const BILL_RECEIPT_SCREEN_CSS = `
  ${BILL_RECEIPT_CSS}
  .bill-receipt-screen {
    font-family: ui-monospace, monospace;
    max-width: 320px;
    margin: 0 auto;
    padding: 16px;
    font-size: 12px;
  }
`
