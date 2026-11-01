export default function EmptyState({ icon = '📭', title, message, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-5xl mb-4">{icon}</div>
      <h3 className="font-display text-lg font-bold text-surface-800 mb-1">{title}</h3>
      {message && <p className="text-sm text-surface-400 mb-4 max-w-xs">{message}</p>}
      {action}
    </div>
  )
}
