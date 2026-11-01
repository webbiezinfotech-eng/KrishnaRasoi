import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { registerSW } from 'virtual:pwa-register'
import { syncAppVersion } from './utils/pwaForceUpdate'
import App from './App'
import './index.css'

const UPDATE_CHECK_MS = 30 * 1000

async function boot() {
  // 1) Server pe naya build hai? → cache wipe + reload (installed PWA ke liye)
  const reloading = await syncAppVersion()
  if (reloading) return

  // 2) Service worker auto-update + periodic check
  registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return

      const check = () => {
        registration.update().catch(() => {})
        syncAppVersion()
      }

      setInterval(check, UPDATE_CHECK_MS)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
      window.addEventListener('focus', check)
      window.addEventListener('online', check)
    },
  })

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      <Toaster
        position="top-right"
        containerClassName="no-print"
        toastOptions={{
          duration: 3500,
          className: 'no-print',
          style: { fontFamily: 'DM Sans, sans-serif', fontSize: '14px', borderRadius: '10px' },
          success: { iconTheme: { primary: '#16a34a', secondary: '#fff' } },
          error:   { iconTheme: { primary: '#dc2626', secondary: '#fff' } },
        }}
      />
      </BrowserRouter>
    </React.StrictMode>
  )
}

boot()
