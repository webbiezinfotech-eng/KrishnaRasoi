import { formatCurrency, formatReceiptDateTime, shortDocNumber, paymentModeLabel } from './format'

const LINE = '--------------------------------'

function padLine(left, right, width = 48) {
  const l = String(left || '')
  const r = String(right || '')
  const space = width - l.length - r.length
  if (space < 1) return `${l.slice(0, width - r.length - 1)} ${r}`
  return l + ' '.repeat(space) + r
}

/** Plain-text receipt for Android POS native bridges (ESC/POS compatible). */
export function formatBillText(bill, settings = {}) {
  const sym = (settings.currency_symbol || '₹') === '₹' ? 'Rs.' : (settings.currency_symbol || 'Rs.')
  const when = formatReceiptDateTime(bill.created_at)
  const billNo = shortDocNumber(bill.bill_number)
  const orderNo = shortDocNumber(bill.order_number)
  const tableOrRoom = bill.table_label || bill.guest_room || '-'
  const tableLabel = bill.order_type === 'dine_in' ? 'Table' : 'Room'
  const footer = settings.bill_footer_text || 'Thank you!'
  const lines = []

  lines.push((settings.business_name || 'Restaurant').toUpperCase())
  if (settings.business_address) lines.push(settings.business_address)
  if (settings.business_phone) lines.push(settings.business_phone)
  lines.push(LINE)
  lines.push('TAX INVOICE')
  lines.push(LINE)
  lines.push(`Bill ${billNo}`)
  lines.push(when)
  lines.push(`Order ${orderNo} | ${tableLabel} ${tableOrRoom} | ${paymentModeLabel(bill.payment_mode)}`)
  if (bill.guest_name) lines.push(bill.guest_name)
  lines.push(LINE)

  for (const item of bill.items || []) {
    const name = `${item.item_name} x${item.quantity}`
    const amt = formatCurrency(item.line_total, sym)
    lines.push(padLine(name, amt))
  }

  lines.push(LINE)
  lines.push(padLine('Subtotal', formatCurrency(bill.subtotal, sym)))
  if (parseFloat(bill.tax_amount) > 0) {
    lines.push(padLine('Tax', formatCurrency(bill.tax_amount, sym)))
  }
  if (parseFloat(bill.discount_amount) > 0) {
    lines.push(padLine('Discount', '-' + formatCurrency(bill.discount_amount, sym)))
  }
  lines.push(LINE)
  lines.push('TOTAL')
  lines.push(formatCurrency(bill.grand_total, sym))
  lines.push(LINE)
  lines.push(`**** ${footer.toUpperCase()} ****`)
  lines.push(`Date & Time : ${when}`)
  lines.push('')
  return lines.join('\n')
}

export function formatKOTText(order) {
  const when = new Date().toLocaleString('en-IN')
  const isDineIn = order.order_type === 'dine_in'
  const place = isDineIn
    ? 'RESTAURANT (DINE IN)'
    : `GUEST HOUSE: ${order.guest_name || 'GUEST HOUSE'}`
  const location = isDineIn
    ? `TABLE: ${order.table_number || order.table_label || '-'}`
    : `ROOM: ${order.guest_room || '-'}`

  const lines = [
    'KITCHEN ORDER',
    LINE,
    `ORDER: ${order.order_number || order.id}`,
    `DATE: ${when}`,
    `PLACE: ${place}`,
    location,
    LINE,
  ]

  for (const item of order.items || []) {
    lines.push(padLine(String(item.item_name || '').toUpperCase(), String(item.quantity)))
  }

  lines.push(LINE)
  lines.push(`TOTAL ITEMS: ${order.items?.length || 0}`)
  lines.push('')
  return lines.join('\n')
}

/** Cleanter JSON blocks — https://cleanter.cleancode.id */
export function formatBillCleanter(bill, settings = {}) {
  const sym = (settings.currency_symbol || '₹') === '₹' ? 'Rs.' : (settings.currency_symbol || 'Rs.')
  const when = formatReceiptDateTime(bill.created_at)
  const billNo = shortDocNumber(bill.bill_number)
  const orderNo = shortDocNumber(bill.order_number)
  const tableOrRoom = bill.table_label || bill.guest_room || '-'
  const tableLabel = bill.order_type === 'dine_in' ? 'Table' : 'Room'
  const footer = settings.bill_footer_text || 'Thank you!'

  const blocks = [
    { type: 'text', text: settings.business_name || 'Restaurant', align: 'center', bold: true },
  ]
  if (settings.business_address) blocks.push({ type: 'text', text: settings.business_address, align: 'center' })
  if (settings.business_phone) blocks.push({ type: 'text', text: settings.business_phone, align: 'center' })
  blocks.push(
    { type: 'divider' },
    { type: 'text', text: 'TAX INVOICE', align: 'center', bold: true },
    { type: 'divider' },
    { type: 'text', text: `Bill ${billNo}`, align: 'center', bold: true },
    { type: 'text', text: when, align: 'center' },
    { type: 'text', text: `Order ${orderNo} | ${tableLabel} ${tableOrRoom}`, align: 'center' },
    { type: 'text', text: paymentModeLabel(bill.payment_mode), align: 'center' },
    { type: 'divider' },
  )

  for (const item of bill.items || []) {
    blocks.push({
      type: 'row',
      left: `${item.item_name} x${item.quantity}`,
      right: formatCurrency(item.line_total, sym),
    })
  }

  blocks.push(
    { type: 'divider' },
    { type: 'row', left: 'Subtotal', right: formatCurrency(bill.subtotal, sym) },
  )
  if (parseFloat(bill.tax_amount) > 0) {
    blocks.push({ type: 'row', left: 'Tax', right: formatCurrency(bill.tax_amount, sym) })
  }
  if (parseFloat(bill.discount_amount) > 0) {
    blocks.push({ type: 'row', left: 'Discount', right: '-' + formatCurrency(bill.discount_amount, sym) })
  }
  blocks.push(
    { type: 'divider' },
    { type: 'text', text: 'TOTAL', align: 'center', bold: true },
    { type: 'text', text: formatCurrency(bill.grand_total, sym), align: 'center', bold: true },
    { type: 'divider' },
    { type: 'text', text: `**** ${footer.toUpperCase()} ****`, align: 'center' },
    { type: 'text', text: `Date & Time : ${when}`, align: 'center' },
    { type: 'feed', lines: 2 },
    { type: 'cut' },
  )

  return { paper: '80mm', blocks }
}

export function formatKOTCleanter(order) {
  const when = new Date().toLocaleString('en-IN')
  const isDineIn = order.order_type === 'dine_in'
  const place = isDineIn
    ? 'RESTAURANT (DINE IN)'
    : `GUEST HOUSE: ${order.guest_name || 'GUEST HOUSE'}`
  const location = isDineIn
    ? `TABLE: ${order.table_number || order.table_label || '-'}`
    : `ROOM: ${order.guest_room || '-'}`

  const blocks = [
    { type: 'text', text: 'KITCHEN ORDER', align: 'center', bold: true },
    { type: 'divider' },
    { type: 'text', text: `ORDER: ${order.order_number || order.id}`, align: 'center', bold: true },
    { type: 'text', text: `DATE: ${when}` },
    { type: 'text', text: `PLACE: ${place}` },
    { type: 'text', text: location },
    { type: 'divider' },
  ]

  for (const item of order.items || []) {
    blocks.push({
      type: 'row',
      left: String(item.item_name || '').toUpperCase(),
      right: String(item.quantity),
    })
  }

  blocks.push(
    { type: 'divider' },
    { type: 'text', text: `TOTAL ITEMS: ${order.items?.length || 0}`, align: 'center', bold: true },
    { type: 'feed', lines: 2 },
    { type: 'cut' },
  )

  return { paper: '80mm', blocks }
}
