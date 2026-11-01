/**
 * Restaurant side WhatsApp — bill / KOT customer ko bhejne ke liye.
 * Abhi "click to chat" (wa.me) use hota hai: koi API key, koi cost nahi.
 * Upgrade path: WhatsApp Cloud API / provider — .env me META_WHATSAPP_* bhar dein
 * aur backend/services/messaging/ use karein.
 */

export const DEFAULT_COUNTRY_CODE = '91'

export function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.length === 10) return DEFAULT_COUNTRY_CODE + digits
  if (digits.length === 11 && digits.startsWith('0')) return DEFAULT_COUNTRY_CODE + digits.slice(1)
  return digits
}

export function waLink(phone, text = '') {
  const n = normalizePhone(phone)
  const base = n ? `https://wa.me/${n}` : 'https://wa.me/'
  return text ? `${base}?text=${encodeURIComponent(text)}` : base
}

export function openWhatsApp(phone, text) {
  const url = waLink(phone, text)
  window.open(url, '_blank', 'noopener,noreferrer')
  return url
}

const money = n => `₹${Number(n || 0).toFixed(2)}`

/** Restaurant bill ka WhatsApp text. */
export function buildBillMessage(bill, settings = {}) {
  if (!bill) return ''
  const biz = settings?.business_name || 'Restaurant'
  const items = bill.items || bill.order_items || []
  const lines = [
    `*${biz}*`,
    `Bill: ${bill.bill_number || '-'}`,
    bill.table_label ? `Table: ${bill.table_label}` : null,
    bill.guest_name ? `Guest: ${bill.guest_name}` : null,
    '',
  ].filter(v => v !== null)

  items.forEach(it => {
    const name = it.item_name || it.name || 'Item'
    const qty = it.quantity ?? it.qty ?? 1
    const amt = it.total_price ?? it.amount ?? (Number(it.unit_price || 0) * Number(qty))
    lines.push(`${qty} × ${name} — ${money(amt)}`)
  })

  if (items.length) lines.push('')
  if (bill.subtotal != null) lines.push(`Subtotal: ${money(bill.subtotal)}`)
  if (Number(bill.tax_amount) > 0) lines.push(`GST: ${money(bill.tax_amount)}`)
  if (bill.discount_amount != null && Number(bill.discount_amount) > 0) lines.push(`Discount: -${money(bill.discount_amount)}`)
  lines.push(`*Total: ${money(bill.total_amount ?? bill.grand_total)}*`)
  if (bill.payment_mode) lines.push(`Payment: ${String(bill.payment_mode).toUpperCase()}`)

  if (settings?.business_phone) lines.push('', `📞 ${settings.business_phone}`)
  lines.push('', 'Thank you! 🙏')
  return lines.join('\n')
}

/** Kripa Shanti guest ke liye booking / bill message. */
export function buildGuestMessage({ house = 'Kripa Shanti Atithi Bhavan', guest = {}, kind = 'bill', amount = null }) {
  if (kind === 'booking') {
    return [
      `*${house}*`,
      `Namaste ${guest.guest_name || ''} 🙏`,
      '',
      'Aapki booking confirm ho gayi hai:',
      `Room: ${guest.room_no || '-'}`,
      `Check-in: ${guest.booking_from || guest.check_in_at || '-'}`,
      `Check-out: ${guest.booking_to || guest.expected_checkout_at || '-'}`,
      guest.advance_amount ? `Advance: ${money(guest.advance_amount)}` : null,
      '',
      'Dhanyavaad!',
    ].filter(v => v !== null).join('\n')
  }
  return [
    `*${house}*`,
    `Namaste ${guest.guest_name || ''} 🙏`,
    '',
    `Room ${guest.room_no || '-'} ka bill:`,
    amount != null ? `Total: ${money(amount)}` : null,
    guest.balance_amount != null ? `Balance: ${money(guest.balance_amount)}` : null,
    '',
    'Dhanyavaad — phir aaiye! 🙏',
  ].filter(v => v !== null).join('\n')
}
