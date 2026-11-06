/**
 * Runtime app base — build relative (./) hai, isliye app kisi bhi folder me chal jati hai.
 *  - Domain root  → "/"
 *  - /dist/ ya /app/ me upload → "/dist/", "/app/"
 * Router basename aur version.json URL dono isi se bante hain.
 */
function computeBase() {
  let base = import.meta.env.BASE_URL || '/'
  if (base === './' || base === '.') {
    try {
      // prod me ye module /assets/ ke andar hota hai → ek level upar = app root
      base = new URL('../', import.meta.url).pathname
    } catch {
      base = '/'
    }
  }
  if (!base.startsWith('/')) base = '/' + base
  if (!base.endsWith('/')) base += '/'
  return base
}

export const APP_BASE = computeBase()
export const APP_BASE_NAME = APP_BASE === '/' ? '/' : APP_BASE.replace(/\/$/, '')
export const appUrl = path => `${APP_BASE}${String(path || '').replace(/^\//, '')}`
