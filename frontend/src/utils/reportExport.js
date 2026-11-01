import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatCurrency, formatDate, orderTypeLabel, paymentModeLabel } from './format'

const REPORT_LABELS = {
  sales: 'Daily Sales',
  'item-wise': 'Item-Wise Sales',
  'table-wise': 'Table-Wise Sales',
  commission: 'Commission Report',
  payment: 'Payment Mode Report',
}

function rawCurrency(amount) {
  return Number(amount || 0).toFixed(2)
}

function buildMeta(ctx) {
  const {
    activeReport, from, to, orderType, selectedGuestHouseId,
    guestHouseProfiles, itemSearch, commissionSearch, reportSearch,
  } = ctx
  const gh = guestHouseProfiles.find(p => String(p.id) === String(selectedGuestHouseId))
  const meta = {
    Report: REPORT_LABELS[activeReport] || activeReport,
    'From Date': from,
    'To Date': to,
    'Generated On': new Date().toLocaleString('en-IN'),
  }
  if (activeReport !== 'table-wise') {
    meta['Order Type'] = orderType ? orderTypeLabel(orderType) : 'All'
    meta['Guest House'] = gh?.name || 'All Guest Houses'
  }
  if (itemSearch?.trim()) meta['Search Item'] = itemSearch.trim()
  if (commissionSearch?.trim()) meta['Search'] = commissionSearch.trim()
  if (reportSearch?.trim()) meta['Search Filter'] = reportSearch.trim()
  return meta
}

function buildSections(ctx) {
  const { activeReport, data, itemRows, genericReportRows, reportSearch } = ctx
  if (!data) return []

  if (activeReport === 'sales') {
    const sections = []
    if (data.summary) {
      sections.push({
        sheetName: 'Summary',
        title: 'Summary',
        columns: [
          { header: 'Metric', value: r => r.metric },
          { header: 'Value', value: r => r.value },
        ],
        rows: [
          { metric: 'Total Sales', value: formatCurrency(data.summary.total_sales) },
          { metric: 'Total Orders', value: data.summary.total_orders },
          { metric: 'Dine-In Sales', value: formatCurrency(data.summary.dine_in_sales) },
          { metric: 'Guest House Sales', value: formatCurrency(data.summary.guest_house_sales) },
          { metric: 'Commission Paid', value: formatCurrency(data.summary.total_commission) },
          { metric: 'Total Discount', value: formatCurrency(data.summary.total_discount) },
          { metric: 'Total Tax', value: formatCurrency(data.summary.total_tax) },
        ],
      })
    }
    sections.push({
      sheetName: 'Daily Sales',
      title: 'Daily Sales',
      columns: [
        { header: 'Date', value: r => formatDate(r.date) },
        { header: 'Orders', value: r => r.total_orders },
        { header: 'Dine-In Sales', value: r => rawCurrency(r.dine_in_sales) },
        { header: 'Guest House Sales', value: r => rawCurrency(r.guest_house_sales) },
        { header: 'Commission Paid', value: r => rawCurrency(r.total_commission) },
        { header: 'Total Sales', value: r => rawCurrency(r.total_sales) },
      ],
      rows: genericReportRows,
    })
    return sections
  }

  if (activeReport === 'item-wise') {
    return [{
      sheetName: 'Item-Wise Sales',
      title: 'Item-Wise Sales',
      columns: [
        { header: 'Item Name', value: r => r.item_name },
        { header: 'Category', value: r => r.item_category },
        { header: 'Qty Sold', value: r => r.total_qty },
        { header: 'Avg Price', value: r => rawCurrency(r.avg_price) },
        { header: 'Revenue', value: r => rawCurrency(r.total_revenue) },
      ],
      rows: itemRows,
    }]
  }

  if (activeReport === 'table-wise') {
    return [{
      sheetName: 'Table-Wise Sales',
      title: 'Table-Wise Sales',
      columns: [
        { header: 'Table', value: r => r.table_label || `Table ${r.table_number}` },
        { header: 'Orders', value: r => r.total_orders },
        { header: 'Total Sales', value: r => rawCurrency(r.total_sales) },
        { header: 'Discount', value: r => rawCurrency(r.total_discount) },
      ],
      rows: genericReportRows,
    }]
  }

  if (activeReport === 'commission') {
    const sections = [{
      sheetName: 'GH Summary',
      title: 'Guest House Wise Commission',
      columns: [
        { header: 'Guest House', value: r => r.guest_house_name || '—' },
        { header: 'Orders', value: r => r.total_orders },
        { header: 'Sales', value: r => rawCurrency(r.total_sales) },
        { header: 'Commission Paid', value: r => rawCurrency(r.total_commission_paid) },
      ],
      rows: data.house_summary || [],
    }]
    sections.push({
      sheetName: 'Commission Detail',
      title: 'Commission Details',
      columns: [
        { header: 'Date', value: r => formatDate(r.date) },
        { header: 'Order #', value: r => r.order_number },
        { header: 'Bill #', value: r => r.bill_number },
        { header: 'Guest House', value: r => r.guest_house_name || '—' },
        { header: 'Guest Name', value: r => r.guest_name },
        { header: 'Room', value: r => r.guest_room || '—' },
        { header: 'Phone', value: r => r.guest_phone || '—' },
        { header: 'Order Total', value: r => rawCurrency(r.grand_total) },
        { header: 'Commission Paid', value: r => rawCurrency(r.commission_amount) },
        { header: 'Payment Mode', value: r => paymentModeLabel(r.payment_mode) },
        { header: 'Paid At', value: r => r.paid_at || '—' },
      ],
      rows: data.rows || [],
    })
    if (data.total_commission != null) {
      sections.unshift({
        sheetName: 'Summary',
        title: 'Summary',
        columns: [
          { header: 'Metric', value: r => r.metric },
          { header: 'Value', value: r => r.value },
        ],
        rows: [{ metric: 'Total Commission Paid', value: formatCurrency(data.total_commission) }],
      })
    }
    return sections
  }

  if (activeReport === 'payment') {
    const q = reportSearch?.trim().toLowerCase()
    const rows = (data.rows || []).filter(r => {
      if (!q) return true
      return Object.values(r || {}).some(v => String(v ?? '').toLowerCase().includes(q))
    })
    return [{
      sheetName: 'Payment Mode',
      title: 'Payment Mode Report',
      columns: [
        { header: 'Payment Mode', value: r => paymentModeLabel(r.payment_mode) },
        { header: 'Transactions', value: r => r.total_transactions },
        { header: 'Total Amount', value: r => rawCurrency(r.total_amount) },
      ],
      rows,
    }]
  }

  return []
}

function safeSheetName(name, used = new Set()) {
  let base = String(name || 'Sheet').replace(/[\\/?*[\]:]/g, '').slice(0, 31) || 'Sheet'
  let final = base
  let i = 1
  while (used.has(final)) {
    final = `${base.slice(0, 28)}_${i++}`
  }
  used.add(final)
  return final
}

function buildFilename(ctx, ext) {
  const label = (REPORT_LABELS[ctx.activeReport] || 'Report').replace(/\s+/g, '-')
  return `${label}_${ctx.from}_to_${ctx.to}.${ext}`
}

export function buildReportExport(ctx) {
  const meta = buildMeta(ctx)
  const sections = buildSections(ctx)
  const totalRows = sections.reduce((n, s) => n + (s.rows?.length || 0), 0)
  return { meta, sections, totalRows, filenameBase: buildFilename(ctx, '') }
}

export function exportReportExcel(ctx) {
  const { meta, sections, totalRows } = buildReportExport(ctx)
  if (totalRows === 0 && sections.every(s => !s.rows?.length)) {
    throw new Error('Export ke liye koi data nahi hai.')
  }

  const wb = XLSX.utils.book_new()
  const usedNames = new Set()

  const metaAoA = [['Field', 'Value'], ...Object.entries(meta)]
  const metaWs = XLSX.utils.aoa_to_sheet(metaAoA)
  XLSX.utils.book_append_sheet(wb, metaWs, safeSheetName('Report Info', usedNames))

  sections.forEach(sec => {
    const headers = sec.columns.map(c => c.header)
    const body = (sec.rows || []).map(row => sec.columns.map(c => {
      const v = c.value(row)
      return v ?? ''
    }))
    const ws = XLSX.utils.aoa_to_sheet([headers, ...body])
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(sec.sheetName || sec.title, usedNames))
  })

  XLSX.writeFile(wb, buildFilename(ctx, 'xlsx'))
}

export function exportReportPdf(ctx) {
  const { meta, sections, totalRows } = buildReportExport(ctx)
  if (totalRows === 0 && sections.every(s => !s.rows?.length)) {
    throw new Error('Export ke liye koi data nahi hai.')
  }

  const wide = sections.some(s => s.columns.length > 6)
  const doc = new jsPDF({ orientation: wide ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()

  doc.setFontSize(16)
  doc.setFont(undefined, 'bold')
  doc.text(meta.Report || 'Report', 14, 16)

  doc.setFontSize(9)
  doc.setFont(undefined, 'normal')
  let metaY = 24
  Object.entries(meta).forEach(([k, v]) => {
    if (k === 'Report') return
    doc.text(`${k}: ${v}`, 14, metaY)
    metaY += 5
  })

  let startY = metaY + 4

  sections.forEach(sec => {
    if (startY > doc.internal.pageSize.getHeight() - 30) {
      doc.addPage()
      startY = 16
    }

    if (sec.title) {
      doc.setFontSize(11)
      doc.setFont(undefined, 'bold')
      doc.text(sec.title, 14, startY)
      startY += 6
      doc.setFont(undefined, 'normal')
    }

    const head = [sec.columns.map(c => c.header)]
    const body = (sec.rows || []).map(row =>
      sec.columns.map(c => {
        const v = c.value(row)
        return v == null ? '' : String(v)
      })
    )

    autoTable(doc, {
      startY,
      head,
      body,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [249, 115, 22], textColor: 255 },
      margin: { left: 14, right: 14 },
      tableWidth: pageW - 28,
    })

    startY = doc.lastAutoTable.finalY + 10
  })

  doc.save(buildFilename(ctx, 'pdf'))
}
