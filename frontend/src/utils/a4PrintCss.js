/** A4 / large printer — do NOT use for 80mm thermal. */
export const A4_PRINT_BASE_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    background: #fff;
    color: #000;
    font-family: Arial, Helvetica, sans-serif;
  }
  @page {
    size: auto;
    margin: 0 0 8mm 0;
  }
  @media print {
    html, body {
      width: auto !important;
      max-width: none !important;
      height: auto !important;
      min-height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      background: #fff !important;
    }
    .wrap, .receipt-root {
      width: 100% !important;
      max-width: 320px !important;
      height: auto !important;
      min-height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      page-break-after: avoid;
    }
    .br-table thead { display: table-row-group; }
    .br-table tr { page-break-inside: avoid; }
    .no-print, .print-bar { display: none !important; }
    [data-rht-toaster],
    [data-rht-toaster] * {
      display: none !important;
      visibility: hidden !important;
    }
  }
`

export function wrapA4ReceiptHtml(innerHtml) {
  return `<div class="wrap receipt-root">${innerHtml || ''}</div>`
}
