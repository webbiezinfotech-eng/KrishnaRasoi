/**
 * Print the current dedicated print page once (correct layout).
 * Uses ONLY window.print() on this page — no iframe / no early bridge print.
 * Dismisses toast popups first so they never land on the receipt.
 */
import toast from 'react-hot-toast'

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function waitForPaint() {
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    try { await document.fonts.ready } catch { /* ignore */ }
  }
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
}

/**
 * @param {object} opts
 * @param {number} [opts.delayMs] settle time before browser print (default 800)
 */
export async function printReadyPage({ delayMs = 800 } = {}) {
  try { toast.dismiss() } catch { /* ignore */ }
  await waitForPaint()
  await wait(delayMs)
  try { toast.dismiss() } catch { /* ignore */ }

  window.focus()
  window.print()
  return { ok: true, method: 'browser-page', needsUserConfirm: true }
}
