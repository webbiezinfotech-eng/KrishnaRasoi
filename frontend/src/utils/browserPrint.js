/**
 * Browser print — iframe/popup; CSS comes from printLayout (A4 or 80mm thermal).
 */
function buildDocument(title, bodyHtml, css = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title || 'Print'}</title>
  <style>${css || ''}</style>
</head>
<body>${bodyHtml || ''}</body>
</html>`
}

function runPrintOnWindow(win, settleMs = 700) {
  return new Promise((resolve, reject) => {
    if (!win) {
      reject(new Error('Print window blocked — popup allow karo.'))
      return
    }
    const trigger = () => {
      try {
        win.focus()
        win.print()
        resolve(true)
      } catch (e) {
        reject(e)
      }
    }
    if (win.document.readyState === 'complete') {
      setTimeout(trigger, settleMs)
    } else {
      win.onload = () => setTimeout(trigger, settleMs)
    }
  })
}

export function browserPrintIframe({ title = 'Print', bodyHtml, css = '' }) {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe')
    iframe.setAttribute('aria-hidden', 'true')
    // Real thermal width — 0×0 iframe collapses layout (squished receipts).
    iframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:80mm;height:1400px;border:0;opacity:0;pointer-events:none'
    document.body.appendChild(iframe)

    const win = iframe.contentWindow
    const doc = iframe.contentDocument || win?.document
    if (!doc || !win) {
      iframe.remove()
      reject(new Error('Iframe print setup failed.'))
      return
    }

    doc.open()
    doc.write(buildDocument(title, bodyHtml, css))
    doc.close()

    runPrintOnWindow(win, 700)
      .then(resolve)
      .catch(reject)
      .finally(() => setTimeout(() => iframe.remove(), 3000))
  })
}

export function browserPrintPopup({ title = 'Print', bodyHtml, css = '' }) {
  const win = window.open('', '_blank', 'width=320,height=720')
  if (!win) {
    return Promise.reject(new Error('Popup blocked — browser mein popup allow karo.'))
  }
  win.document.open()
  win.document.write(buildDocument(title, bodyHtml, css))
  win.document.close()
  return runPrintOnWindow(win)
}

export function browserPrintNative() {
  window.print()
  return Promise.resolve(true)
}
