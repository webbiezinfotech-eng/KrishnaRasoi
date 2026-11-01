const SITE_URL = 'https://webbiezinfotech.in'
const YEAR = new Date().getFullYear()

export default function CopyrightFooter({ className = '' }) {
  return (
    <footer className={`no-print text-center text-xs text-surface-400 ${className}`}>
      <p>
        © {YEAR}{' '}
        <a
          href={SITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-surface-600 hover:text-brand-600 underline-offset-2 hover:underline"
        >
          Webbiez Infotech
        </a>
        . All rights reserved.
      </p>
      <p className="mt-0.5">
        <a
          href={SITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-surface-500 hover:text-brand-600 underline-offset-2 hover:underline"
        >
          webbiezinfotech.in
        </a>
      </p>
    </footer>
  )
}
