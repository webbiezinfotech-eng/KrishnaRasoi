import { useCallback, useEffect, useState } from 'react'

function isStandaloneMode() {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true
  )
}

function isIosSafari() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) && !window.MSStream
}

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [installed, setInstalled] = useState(isStandaloneMode)
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem('pwa_install_dismissed') === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    if (installed) return undefined

    const onInstallReady = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }

    const onInstalled = () => {
      setInstalled(true)
      setDeferredPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', onInstallReady)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onInstallReady)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [installed])

  const install = useCallback(async () => {
    if (!deferredPrompt) return false
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    setDeferredPrompt(null)
    if (outcome === 'accepted') setInstalled(true)
    return outcome === 'accepted'
  }, [deferredPrompt])

  const dismiss = useCallback(() => {
    setDismissed(true)
    try {
      localStorage.setItem('pwa_install_dismissed', '1')
    } catch { /* ignore */ }
  }, [])

  const ios = isIosSafari()
  const canPromptInstall = Boolean(deferredPrompt)
  const showIosHint = ios && !installed && !dismissed
  const showAndroidHint = canPromptInstall && !installed && !dismissed

  return {
    installed,
    dismissed,
    canPromptInstall,
    showBanner: showIosHint || showAndroidHint,
    showIosHint,
    showAndroidHint,
    install,
    dismiss,
  }
}
