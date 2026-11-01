export function applyMessageName(body, name) {
  const text = String(body ?? '')
  if (!text.includes('{{name}}')) return text
  const replacement = String(name || '').trim() || 'Guest'
  return text.split('{{name}}').join(replacement)
}

export function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `c-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
}
