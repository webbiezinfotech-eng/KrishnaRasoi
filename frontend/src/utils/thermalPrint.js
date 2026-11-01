/** Print helpers — browser print + LAN network print via backend API. */
import { printAPI } from '../services/api'
import {
  isAndroidDevice,
  directPrint,
  testDirectPrint,
  runPrintDiagnostics,
  checkCleanter,
  detectPrintBridge,
} from './androidPosPrint'

export { printWithFallbacks } from './printFallback'
export { printReadyPage } from './printReadyPage'
export {
  getPrinterType,
  setPrinterType,
  isThermalPrinter,
  PRINTER_A4,
} from './printLayout'
export { browserPrintIframe, browserPrintPopup, browserPrintNative } from './browserPrint'

export {
  isAndroidDevice,
  directPrint,
  testDirectPrint,
  runPrintDiagnostics,
  checkCleanter,
  detectPrintBridge,
}

export function shouldAutoPrint() {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('auto') === '1'
}

export function billPrintPath(billNumber, auto = true) {
  const q = auto ? '?auto=1' : ''
  return `/print/bill/${encodeURIComponent(billNumber)}${q}`
}

export function kotPrintPath(orderId, auto = false) {
  const q = auto ? '?auto=1' : ''
  return `/print/kot/${orderId}${q}`
}

export function trySilentDirectPrint(payload) {
  if (!isAndroidDevice()) return Promise.resolve(null)
  return directPrint(payload).catch(() => null)
}

export async function serverPrintBill(billNumber) {
  const r = await printAPI.bill({ bill_number: billNumber })
  return { ok: true, method: 'lan', message: r.data?.message || 'LAN printer se print ho gaya.' }
}

export async function serverPrintKOT(orderId) {
  const r = await printAPI.kot({ order_id: orderId })
  return { ok: true, method: 'lan', message: r.data?.message || 'KOT LAN printer se print ho gaya.' }
}

export async function checkLanPrinter() {
  const r = await printAPI.health()
  return r.data?.data || { ok: false, message: 'Printer status unknown.' }
}

export async function testLanPrint(type = 'bill') {
  const r = await printAPI.test({ type })
  return { ok: true, message: r.data?.message || 'Test print sent to LAN printer.' }
}

export function triggerBrowserPrint(delayMs = 600) {
  setTimeout(() => {
    try { window.print() } catch { /* ignore */ }
  }, delayMs)
}

export const THERMAL_WIDTH_MM = 72
