import { A4_PRINT_BASE_CSS, wrapA4ReceiptHtml } from './a4PrintCss'
import { BILL_RECEIPT_CSS } from '../components/billing/BillReceipt'

export const PRINTER_A4 = 'a4'

export function getPrinterType() {
  return PRINTER_A4
}

export function setPrinterType() {
  /* single layout — A4 bill design */
}

export function isThermalPrinter() {
  return false
}

export function getBillPrintCss() {
  return `${A4_PRINT_BASE_CSS}
    ${BILL_RECEIPT_CSS}
    body { background: #f5f5f5; font-size: 14px; }
    .wrap { max-width: 320px; width: 100%; margin: 0; padding: 8px 8px 12px 8px; background: #fff; }
    @media print {
      @page { size: 80mm auto; margin: 2mm; }
      html, body {
        width: 76mm !important;
        max-width: 76mm !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #fff !important;
      }
      .wrap, .receipt-root {
        width: 76mm !important;
        max-width: 76mm !important;
        margin: 0 !important;
        padding: 2mm !important;
      }
    }
  `
}

export function getKotPrintCss() {
  return `${A4_PRINT_BASE_CSS}
    body { background: #f5f5f5; font-size: 13px; }
    .wrap { max-width: 320px; width: 100%; margin: 0; padding: 8px 8px 12px 8px; background: #fff; }
    .center { text-align: center; }
    .title { font-size: 14px; font-weight: 700; letter-spacing: 1px; }
    .meta { font-size: 12px; margin: 2px 0; }
    .line { border-top: 1px dashed #000; margin: 4px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin: 4px 0; table-layout: fixed; }
    th, td { padding: 2px 1px; word-wrap: break-word; }
    th { border-bottom: 1px solid #000; text-align: left; }
    td.qty, th.qty { text-align: right; width: 18mm; }
    .bold { font-weight: 700; }
    @media print {
      @page { size: 80mm auto; margin: 2mm; }
      html, body {
        width: 76mm !important;
        max-width: 76mm !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #fff !important;
      }
      .wrap {
        width: 76mm !important;
        max-width: 76mm !important;
        margin: 0 !important;
        padding: 2mm !important;
      }
      table thead { display: table-row-group; }
      table tr { page-break-inside: avoid; }
    }
  `
}

export function wrapBillPrintHtml(innerHtml) {
  return wrapA4ReceiptHtml(innerHtml)
}

export function wrapKotPrintHtml(innerHtml) {
  return `<div class="wrap">${innerHtml || ''}</div>`
}

export function getPrintBarCss() {
  return `
    .print-bar {
      position: fixed; bottom: 0; left: 0; right: 0;
      background: #111; padding: 12px; text-align: center; z-index: 99;
    }
    .print-btn {
      background: #f97316; color: #fff; border: none;
      font-size: 18px; font-weight: 700; padding: 14px 48px;
      border-radius: 8px; cursor: pointer; width: 100%; max-width: 320px;
    }
    .print-btn:disabled { opacity: 0.6; cursor: wait; }
    .back-link { display: inline-block; color: #f97316; font-size: 14px; margin-bottom: 12px; text-decoration: none; }
  `
}
