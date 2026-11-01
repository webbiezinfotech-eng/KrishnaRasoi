import {
  formatBillText,
  formatKOTText,
  formatBillCleanter,
  formatKOTCleanter,
} from './receiptText'

const CLEANTER_URL = 'http://127.0.0.1:9100'

/** True on Android tablets / POS devices. */
export function isAndroidDevice() {
  if (typeof navigator === 'undefined') return false
  return /Android/i.test(navigator.userAgent)
}

/** Detect which print bridge is available on this device. */
export function detectPrintBridge() {
  if (typeof window === 'undefined') return null

  // Cleanter HTTP bridge (recommended for HM POS / SGT-116)
  // Checked async via checkCleanter()

  // Common Android POS native JS interfaces
  if (window.AndroidPrinter?.print) return { id: 'AndroidPrinter', name: 'Android Printer SDK' }
  if (window.Android?.print) return { id: 'Android', name: 'Android WebView Bridge' }
  if (window.lee?.funAndroid) return { id: 'Sunmi', name: 'Sunmi Printer' }
  if (window.sunmiInnerPrinter) return { id: 'SunmiInner', name: 'Sunmi Inner Printer' }
  if (window.ReceiptChannel?.postMessage) return { id: 'ReceiptChannel', name: 'ESC/POS Web Direct' }
  if (window.woyou?.print) return { id: 'Woyou', name: 'Woyou/Sunmi AIDL' }
  if (window.HMPrinter?.print) return { id: 'HMPrinter', name: 'HM Technosys Printer' }
  if (window.PosPrinter?.print) return { id: 'PosPrinter', name: 'POS Printer Bridge' }
  if (window.JsBridge?.print) return { id: 'JsBridge', name: 'JS Bridge' }
  if (window.InnerPrinter?.print) return { id: 'InnerPrinter', name: 'Inner Printer' }
  if (window.POSPrinter?.print) return { id: 'POSPrinter', name: 'POS Printer' }
  if (window.IminPrint?.print) return { id: 'IminPrint', name: 'Imin Printer' }
  if (window.NexgoPrinter?.print) return { id: 'NexgoPrinter', name: 'Nexgo Printer' }
  if (window.printBill) return { id: 'printBill', name: 'printBill Bridge' }

  return null
}

/** Check if Cleanter bridge app is running on this device. */
export async function checkCleanter() {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 2000)
    const res = await fetch(`${CLEANTER_URL}/health`, { signal: ctrl.signal })
    clearTimeout(timer)
    if (!res.ok) return { ok: false }
    const data = await res.json().catch(() => ({}))
    return { ok: true, name: 'Cleanter', url: CLEANTER_URL, ...data }
  } catch {
    return { ok: false }
  }
}

/** Full diagnostics for Print Test page. */
export async function runPrintDiagnostics() {
  const android = isAndroidDevice()
  const bridge = detectPrintBridge()
  const cleanter = android ? await checkCleanter() : { ok: false }

  let recommended = 'browser'
  if (cleanter.ok) recommended = 'cleanter'
  else if (bridge) recommended = bridge.id

  return {
    android,
    bridge,
    cleanter,
    recommended,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
  }
}

function printViaNativeBridge(text) {
  const w = window

  if (w.AndroidPrinter?.print) {
    w.AndroidPrinter.print(text)
    return { ok: true, method: 'AndroidPrinter' }
  }
  if (w.Android?.print) {
    w.Android.print(text)
    return { ok: true, method: 'Android' }
  }
  if (w.lee?.funAndroid) {
    w.lee.funAndroid(text)
    return { ok: true, method: 'Sunmi' }
  }
  if (w.HMPrinter?.print) {
    w.HMPrinter.print(text)
    return { ok: true, method: 'HMPrinter' }
  }
  if (w.PosPrinter?.print) {
    w.PosPrinter.print(text)
    return { ok: true, method: 'PosPrinter' }
  }
  if (w.JsBridge?.print) {
    w.JsBridge.print(text)
    return { ok: true, method: 'JsBridge' }
  }
  if (w.woyou?.print) {
    w.woyou.print(text)
    return { ok: true, method: 'Woyou' }
  }
  if (w.InnerPrinter?.print) {
    w.InnerPrinter.print(text)
    return { ok: true, method: 'InnerPrinter' }
  }
  if (w.POSPrinter?.print) {
    w.POSPrinter.print(text)
    return { ok: true, method: 'POSPrinter' }
  }
  if (w.IminPrint?.print) {
    w.IminPrint.print(text)
    return { ok: true, method: 'IminPrint' }
  }
  if (w.NexgoPrinter?.print) {
    w.NexgoPrinter.print(text)
    return { ok: true, method: 'NexgoPrinter' }
  }
  if (typeof w.printBill === 'function') {
    w.printBill(text)
    return { ok: true, method: 'printBill' }
  }

  return null
}

async function printViaCleanter(payload) {
  const res = await fetch(`${CLEANTER_URL}/print`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.text().catch(() => 'Print failed')
    throw new Error(err || `Cleanter error ${res.status}`)
  }
  return { ok: true, method: 'cleanter' }
}

/** POS Printer Driver (Fidelier) — works in Edge/Opera on Android, not Chrome. */
function printViaFidelier(text) {
  const encoded = text
    .replace(/\$/g, '')
    .split('\n')
    .map(line => (line.trim() ? line : ''))
    .join('$intro$')
  const url = `com.fidelier.printfromweb://$intro$${encoded}$intro$$cut$$intro$`
  window.location.href = url
  return { ok: true, method: 'fidelier', message: 'Sent to POS Printer Driver app.' }
}

/** POSBridge deep link — gzip+base64 ESC/POS data. */
function printViaPOSBridge(text) {
  // Simple plain-text fallback — POSBridge expects compressed ESC/POS
  const encoded = btoa(unescape(encodeURIComponent(text)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  window.location.href = `pos-bridge://print?print-data=${encoded}`
  return { ok: true, method: 'pos-bridge', message: 'Sent to POSBridge app.' }
}

/**
 * Send receipt to Android POS built-in printer.
 * Tries Cleanter → native bridge → deep link apps → returns failure for browser fallback.
 */
export async function directPrint({ type = 'bill', bill, order, settings = {} }) {
  const text = type === 'kot'
    ? formatKOTText(order)
    : formatBillText(bill, settings || bill?.settings || {})

  const cleanterPayload = type === 'kot'
    ? formatKOTCleanter(order)
    : formatBillCleanter(bill, settings || bill?.settings || {})

  // 1. Cleanter (best for HM POS SGT-116 with BT2.0 printer)
  const cleanter = await checkCleanter()
  if (cleanter.ok) {
    try {
      await printViaCleanter(cleanterPayload)
      return { ok: true, method: 'cleanter', message: 'Printed via Cleanter ✓' }
    } catch (e) {
      console.warn('Cleanter print failed:', e)
    }
  }

  // 2. Native JS bridge (vendor WebView / pre-installed app)
  const native = printViaNativeBridge(text)
  if (native?.ok) {
    return { ...native, message: `Printed via ${native.method} ✓` }
  }

  // 3. ReceiptChannel ESC/POS Web Direct wrapper
  if (window.ReceiptChannel?.postMessage) {
    try {
      const bytes = Array.from(new TextEncoder().encode(text))
      window.ReceiptChannel.postMessage(JSON.stringify({
        type: 'ENCODED_POST_DATA',
        bytes,
        length: bytes.length,
        timestamp: Date.now(),
      }))
      return { ok: true, method: 'ReceiptChannel', message: 'Sent to printer bridge ✓' }
    } catch (e) {
      console.warn('ReceiptChannel failed:', e)
    }
  }

  return {
    ok: false,
    method: 'none',
    message: isAndroidDevice()
      ? 'Built-in bridge nahi mila — PRINT button dabao, browser se printer select karo.'
      : 'Direct print sirf Android POS par kaam karta hai.',
    text,
    cleanterPayload,
  }
}

/** Test print — sends a sample receipt. */
export async function testDirectPrint(type = 'bill') {
  const sampleBill = {
    bill_number: 'TEST-001',
    order_number: 'ORD-001',
    order_type: 'dine_in',
    table_label: 'Table 1',
    payment_mode: 'cash',
    paid_at: new Date().toISOString(),
    subtotal: 350,
    tax_amount: 0,
    discount_amount: 0,
    grand_total: 350,
    items: [
      { item_name: 'Print Test OK', quantity: 1, unit_price: 350, line_total: 350 },
      { item_name: 'Masala Dosa', quantity: 2, unit_price: 80, line_total: 160 },
    ],
  }
  const sampleOrder = {
    id: 0,
    order_number: 'TEST-001',
    order_type: 'dine_in',
    table_number: '1',
    table_label: 'Table 1',
    items: [
      { item_name: 'PRINT TEST OK', quantity: 1 },
      { item_name: 'Masala Dosa', quantity: 2 },
    ],
  }
  const sampleSettings = {
    business_name: 'Print Test',
    business_address: 'HM POS SGT-116',
    currency_symbol: 'Rs.',
    bill_footer_text: 'Thank you!',
  }

  return directPrint({
    type,
    bill: sampleBill,
    order: sampleOrder,
    settings: sampleSettings,
  })
}

export { printViaFidelier, printViaPOSBridge }
