import toast from 'react-hot-toast'
import { usePwaInstall } from '../../hooks/usePwaInstall'

export default function InstallPwaBanner() {
  const {
    showBanner,
    showIosHint,
    showAndroidHint,
    install,
    dismiss,
  } = usePwaInstall()

  if (!showBanner) return null

  const handleInstall = async () => {
    const ok = await install()
    if (ok) toast.success('App home screen par add ho gayi!')
    else toast.error('Install cancel ho gaya.')
  }

  return (
    <div className="no-print fixed bottom-0 inset-x-0 z-50 p-3 sm:p-4 pointer-events-none">
      <div className="pointer-events-auto max-w-lg mx-auto bg-surface-900 text-white rounded-xl shadow-xl border border-surface-700 px-4 py-3 flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-brand-500 flex-shrink-0 flex items-center justify-center text-lg">
          📱
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">App ki tarah use karo</p>
          {showAndroidHint && (
            <p className="text-surface-300 text-xs mt-0.5">
              Install karo — phone ya desktop par home screen se khulega.
            </p>
          )}
          {showIosHint && (
            <p className="text-surface-300 text-xs mt-0.5">
              Safari mein <strong>Share</strong> dabao → <strong>Add to Home Screen</strong>
            </p>
          )}
          <div className="flex flex-wrap gap-2 mt-2">
            {showAndroidHint && (
              <button
                type="button"
                onClick={handleInstall}
                className="bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg"
              >
                Install App
              </button>
            )}
            <button
              type="button"
              onClick={dismiss}
              className="text-surface-400 hover:text-white text-xs px-2 py-1.5"
            >
              Baad mein
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="text-surface-400 hover:text-white text-sm leading-none"
          aria-label="Close"
        >
          ×
        </button>
      </div>
    </div>
  )
}
