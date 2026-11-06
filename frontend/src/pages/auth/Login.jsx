import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, homePathForRole } from '../../context/AuthContext'
import CopyrightFooter from '../../components/layout/CopyrightFooter'
import toast from 'react-hot-toast'

/**
 * Ek hi login screen par do entry points:
 *  - Restaurant Login  → poora software (admin / manager / waiter, jitni permission mili)
 *  - Guest House Login → sirf Kripa Shanti (reception / manager side)
 * Server dono me same /auth/login call karta hai; guest house tab par
 * guest_house permission na hone par entry block ho jati hai.
 */
export default function Login() {
  const [mode, setMode] = useState('restaurant') // restaurant | guesthouse
  const [form, setForm] = useState({ username: '', password: '' })
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async e => {
    e.preventDefault()
    if (!form.username || !form.password) { toast.error('Please fill all fields.'); return }
    setLoading(true)
    try {
      const user = await login(form.username, form.password, isGh ? 'guest_house' : 'restaurant')
      const perms = Array.isArray(user?.permissions) ? user.permissions : []

      if (isGh && user?.role !== 'admin' && !perms.includes('guest_house')) {
        toast.error('Is login me Kripa Shanti (guest house) ka access nahi hai.')
        return
      }

      toast.success(
        isGh ? 'Kripa Shanti khul raha hai…'
          : user?.role === 'waiter' ? 'Ready to take orders.' : 'Welcome back!'
      )
      navigate(homePathForRole(user?.role, perms, isGh ? 'guest_house' : 'restaurant'), { replace: true })
    } catch (err) {
      toast.error(err.response?.data?.message || 'Login failed.')
    } finally { setLoading(false) }
  }

  const isGh = mode === 'guesthouse'

  return (
    <div className={`min-h-screen flex items-center justify-center p-4 ${isGh ? 'bg-gradient-to-br from-emerald-50 via-surface-50 to-teal-50' : 'bg-gradient-to-br from-brand-50 via-surface-50 to-amber-50'}`}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="font-display text-surface-900 text-4xl font-bold mb-2">
            {isGh ? <>Kripa Shanti<br/><span className="text-emerald-600">Guest House</span></> : <>Restaurant<br/><span className="text-brand-600">Manager</span></>}
          </h1>
          <p className="text-surface-500 text-sm">
            {/* {isGh ? 'Guest house staff sign in' : 'Sign in to continue'} */}
          </p>
        </div>

        {/* Login type switch */}
        <div className="grid grid-cols-2 gap-2 mb-4 p-1 bg-white rounded-xl border border-surface-200">
          <button
            type="button"
            onClick={() => setMode('restaurant')}
            className={`py-2 rounded-lg text-sm font-semibold transition-colors ${!isGh ? 'bg-brand-500 text-white' : 'text-surface-600 hover:bg-surface-50'}`}
          >
            Restaurant Login
          </button>
          <button
            type="button"
            onClick={() => setMode('guesthouse')}
            className={`py-2 rounded-lg text-sm font-semibold transition-colors ${isGh ? 'bg-emerald-600 text-white' : 'text-surface-600 hover:bg-surface-50'}`}
          >
            Guest House Login
          </button>
        </div>

        <div className="card p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="form-group">
              <label className="label">Username</label>
              <input className="input" type="text" placeholder={isGh ? 'reception / manager' : 'admin or waiter'} autoFocus
                value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="label">Password</label>
              <input className="input" type="password" placeholder="••••••••"
                value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} />
            </div>
            <button type="submit" className={`btn w-full btn-lg justify-center ${isGh ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'btn-primary'}`} disabled={loading}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
          <p className="text-xs text-surface-400 mt-4 text-center leading-relaxed">
            {isGh
              ? 'Guest House login me sirf Kripa Shanti ka system khulta hai — rooms, walk-in, booking, billing aur reports.'
              : 'Restaurant login me aapke login ki permission ke hisaab se modules khulte hain.'}
          </p>
        </div>
        <CopyrightFooter className="mt-8" />
      </div>
    </div>
  )
}
