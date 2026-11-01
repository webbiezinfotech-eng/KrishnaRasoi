/**
 * Print — Android direct → browser → server LAN.
 */
import { printAPI } from '../services/api'
import { browserPrintIframe, browserPrintPopup, browserPrintNative } from './browserPrint'
import { directPrint, isAndroidDevice } from './androidPosPrint'

async function checkLanPrinter() {
  const r = await printAPI.health()
  return r.data?.data || { ok: false, message: 'Printer status unknown.' }
}

async function serverPrintBill(billNumber) {
  await printAPI.bill({ bill_number: billNumber })
}

async function serverPrintKOT(orderId) {
  await printAPI.kot({ order_id: orderId })
}

function browserMethods(getPrintHtml) {
  const html = typeof getPrintHtml === 'function' ? getPrintHtml() : null
  const title = html?.title || 'Print'
  const bodyHtml = html?.bodyHtml || html?.body || ''
  const css = html?.css || ''
  return { title, bodyHtml, css, hasHtml: Boolean(bodyHtml) }
}

/**
 * @param {object} opts
 * @param {'bill'|'kot'} opts.type
 * @param {object} [opts.bill]
 * @param {object} [opts.order]
 * @param {object} [opts.settings]
 * @param {() => { title?: string, bodyHtml: string, css?: string }} [opts.getPrintHtml]
 */
export async function printWithFallbacks({
  type,
  bill,
  order,
  settings,
  getPrintHtml,
}) {
  const attempts = []

  if (isAndroidDevice()) {
    try {
      const r = await directPrint({ type, bill, order, settings: settings || bill?.settings || {} })
      if (r.ok) return { ok: true, method: r.method || 'android-direct' }
      attempts.push({ method: 'android-direct', error: r.message })
    } catch (e) {
      attempts.push({ method: 'android-direct', error: e.message })
    }
  }

  const { title, bodyHtml, css, hasHtml } = browserMethods(getPrintHtml)

  if (hasHtml) {
    try {
      await browserPrintIframe({ title, bodyHtml, css })
      return { ok: true, method: 'browser-iframe', needsUserConfirm: true }
    } catch (e) {
      attempts.push({ method: 'browser-iframe', error: e.message })
    }
  }

  try {
    const health = await checkLanPrinter()
    if (health?.ok || health?.reachable) {
      if (type === 'bill' && bill?.bill_number) {
        await serverPrintBill(bill.bill_number)
        return { ok: true, method: 'server-lan-bill' }
      }
      if (type === 'kot' && order?.id) {
        await serverPrintKOT(order.id)
        return { ok: true, method: 'server-lan-kot' }
      }
    } else {
      attempts.push({ method: 'server-lan', error: health?.message || 'Server printer unreachable' })
    }
  } catch (e) {
    attempts.push({ method: 'server-lan', error: e.response?.data?.message || e.message })
  }

  try {
    await browserPrintNative()
    return { ok: true, method: 'browser-native', needsUserConfirm: true }
  } catch (e) {
    attempts.push({ method: 'browser-native', error: e.message })
  }

  if (hasHtml) {
    try {
      await browserPrintPopup({ title, bodyHtml, css })
      return { ok: true, method: 'browser-popup', needsUserConfirm: true }
    } catch (e) {
      attempts.push({ method: 'browser-popup', error: e.message })
    }
  }

  const hint = attempts.length
    ? `Print failed: ${attempts.map(a => a.method).join(', ')}`
    : 'No print method available'

  return { ok: false, attempts, message: hint }
}
