/**
 * Force installed PWAs onto the latest deploy.
 * Uses /version.json (never precached) so updates work even when
 * the old service worker is still serving a cached shell.
 */
import { appUrl } from './basePath'

const STORAGE_KEY = 'app_build_id'

async function clearAllCaches() {
  if (!('caches' in window)) return
  const keys = await caches.keys()
  await Promise.all(keys.map(k => caches.delete(k)))
}

async function unregisterServiceWorkers() {
  if (!('serviceWorker' in navigator)) return
  const regs = await navigator.serviceWorker.getRegistrations()
  await Promise.all(regs.map(r => r.unregister()))
}

export async function hardRefreshToLatest() {
  try {
    await clearAllCaches()
    await unregisterServiceWorkers()
  } catch {
    /* ignore */
  }
  const url = new URL(window.location.href)
  url.searchParams.set('_refresh', String(Date.now()))
  window.location.replace(url.pathname + url.search + url.hash)
}

/**
 * Compare server build id with last seen id.
 * @returns {Promise<boolean>} true if a reload was triggered
 */
export async function syncAppVersion() {
  try {
    const res = await fetch(`${appUrl('version.json')}?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    })
    if (!res.ok) return false
    const data = await res.json()
    const remoteId = String(data?.buildId || data?.version || '')
    if (!remoteId) return false

    const localId = localStorage.getItem(STORAGE_KEY)
    if (localId === remoteId) return false

    // New deploy detected — wipe SW/cache then reload once.
    localStorage.setItem(STORAGE_KEY, remoteId)
    await clearAllCaches()
    await unregisterServiceWorkers()
    window.location.reload()
    return true
  } catch {
    return false
  }
}
