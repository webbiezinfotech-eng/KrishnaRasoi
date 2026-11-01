export default function StatusBadge({ status }) {
  const map = {
    available:       'badge-green',
    occupied:        'badge-yellow',
    billing_pending: 'badge-red',
    running:         'badge-yellow',
    billed:          'badge-green',
    cancelled:       'badge-red',
    paid:            'badge-green',
    unpaid:          'badge-red',
    dine_in:         'badge-blue',
    guest_house:     'badge-gray',
    draft:           'badge-gray',
    queued:          'badge-amber',
    processing:      'badge-blue',
    completed:       'badge-green',
    failed:          'badge-red',
    sent:            'badge-green',
    pending:         'badge-amber',
    mock:            'badge-amber',
    whatsapp:        'badge-green',
    sms:             'badge-blue',
  }
  const labels = {
    available: 'Available', occupied: 'Occupied', billing_pending: 'Billing Pending',
    running: 'Running', billed: 'Billed', cancelled: 'Cancelled',
    paid: 'Paid', unpaid: 'Due',     dine_in: 'Dine In', guest_house: 'Guest House',
    draft: 'Draft', queued: 'Queued', processing: 'Processing',
    completed: 'Completed', failed: 'Failed',
    sent: 'Sent', pending: 'Pending', mock: 'Mock', whatsapp: 'WhatsApp', sms: 'SMS',
  }
  return <span className={`badge ${map[status] || 'badge-gray'}`}>{labels[status] || status}</span>
}
