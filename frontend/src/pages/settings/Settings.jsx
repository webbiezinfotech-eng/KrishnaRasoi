import { useState, useEffect, useRef } from 'react'
import { settingsAPI, usersAPI, authAPI } from '../../services/api'
import Spinner from '../../components/ui/Spinner'
import Modal from '../../components/ui/Modal'
import toast from 'react-hot-toast'

const ROLE_OPTIONS = [
  { value: 'waiter',    label: 'Waiter — tables + KOT' },
  { value: 'reception', label: 'Reception — guest house front desk' },
  { value: 'manager',   label: 'Manager — guest house + reports' },
  { value: 'admin',     label: 'Admin — full access' },
]

const EMPTY_USER = { username: '', full_name: '', password: '', role: 'reception', permissions: ['guest_house'] }

export default function Settings() {
  const [settings, setSettings] = useState([])
  const [values, setValues]     = useState({})
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)

  const [users, setUsers]               = useState([])
  const [permCatalog, setPermCatalog]   = useState([])
  const [roleDefaults, setRoleDefaults] = useState({})
  const [usersLoading, setUsersLoading] = useState(true)
  const [userForm, setUserForm]         = useState(EMPTY_USER)
  const [creatingUser, setCreatingUser] = useState(false)
  const [editingUser, setEditingUser]   = useState(null)
  const [savingUser, setSavingUser]     = useState(false)

  const [logoPreview, setLogoPreview] = useState('')
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => {
    settingsAPI.list().then(r => {
      const s = r.data.data
      setSettings(s)
      const v = {}; s.forEach(x => { v[x.setting_key] = x.setting_value || '' })
      setValues(v)
      setLogoPreview(v.logo_data || '')
      setLoading(false)
    })
    authAPI.permissions()
      .then(r => { setPermCatalog(r.data.data.permissions || []); setRoleDefaults(r.data.data.role_defaults || {}) })
      .catch(() => {})
    loadUsers()
  }, [])

  const loadUsers = () => {
    setUsersLoading(true)
    usersAPI.list()
      .then(r => {
        const d = r.data.data || {}
        setUsers(d.users || [])
        if (d.permissions?.length) setPermCatalog(d.permissions)
      })
      .catch(() => toast.error('Staff users load nahi ho paye.'))
      .finally(() => setUsersLoading(false))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = { ...values }
      delete payload.logo_data
      await settingsAPI.update(payload)
      toast.success('Settings save ho gayi.')
    } catch { toast.error('Save fail ho gaya.') }
    finally { setSaving(false) }
  }

  const togglePerm = (list, key) => list.includes(key) ? list.filter(p => p !== key) : [...list, key]

  const handleCreateUser = async e => {
    e.preventDefault()
    if (!userForm.username || !userForm.full_name || !userForm.password) {
      toast.error('Username, name aur password zaroori hai.')
      return
    }
    setCreatingUser(true)
    try {
      await usersAPI.create(userForm)
      toast.success('Staff user ban gaya — ab us ID/password se login ho sakta hai.')
      setUserForm(EMPTY_USER)
      loadUsers()
    } catch (err) {
      toast.error(err.response?.data?.message || 'User banane me error.')
    } finally { setCreatingUser(false) }
  }

  const saveEditUser = async e => {
    e.preventDefault()
    if (!editingUser) return
    setSavingUser(true)
    try {
      const body = {
        username: editingUser.username,
        full_name: editingUser.full_name,
        role: editingUser.role,
        permissions: editingUser.permissions,
        is_active: editingUser.is_active,
      }
      if (editingUser.new_password) body.password = editingUser.new_password
      await usersAPI.update(editingUser.id, body)
      toast.success('User update ho gaya.')
      setEditingUser(null)
      loadUsers()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Update fail.')
    } finally { setSavingUser(false) }
  }

  const toggleActive = async user => {
    try {
      await usersAPI.update(user.id, { is_active: !user.is_active })
      toast.success(user.is_active ? 'User deactivate ho gaya.' : 'User activate ho gaya.')
      loadUsers()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Update fail.')
    }
  }

  const resetPassword = async user => {
    const password = prompt(`${user.username} ka naya password (min 6 characters):`)
    if (!password) return
    if (password.length < 6) { toast.error('Password kam se kam 6 character.'); return }
    try {
      await usersAPI.update(user.id, { password })
      toast.success('Password change ho gaya.')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Password change fail.')
    }
  }

  const onLogoPick = async e => {
    const file = e.target.files?.[0]
    if (!file) return
    const okType = ['image/png', 'image/jpeg'].includes(file.type)
    if (!okType) { toast.error('Sirf PNG, JPG ya JPEG logo chalega.'); return }
    if (file.size > 4 * 1024 * 1024) { toast.error('Logo 4 MB se chhota rakhein.'); return }
    setUploadingLogo(true)
    try {
      const r = await settingsAPI.uploadLogo(file)
      const data = r.data.data.logo_data
      setLogoPreview(data)
      setValues(p => ({ ...p, logo_data: data }))
      toast.success('Logo set ho gaya — invoice par lagega.')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Logo upload fail.')
    } finally { setUploadingLogo(false); if (fileRef.current) fileRef.current.value = '' }
  }

  const groups = {}
  settings.forEach(s => {
    if (s.setting_key === 'logo_data') return
    if (!groups[s.setting_group]) groups[s.setting_group] = []
    groups[s.setting_group].push(s)
  })

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>

  return (
    <div className="max-w-5xl space-y-5">

      {/* ---------- Staff Users + Permissions ---------- */}
      <div className="card p-6">
        <h2 className="font-display font-bold text-surface-900 text-lg mb-1">Staff Users &amp; Permissions</h2>
        <p className="text-sm text-surface-500 mb-4">
          Sirf admin yahan se staff ID/password banata hai. Neeche checkbox se decide karein ki us staff ko
          kaun-kaun se module milenge — wahi modules uske sidebar me dikhenge aur server bhi wahi allow karega.
        </p>

        <form onSubmit={handleCreateUser} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
          <div className="form-group mb-0">
            <label className="label">Username (login ID)</label>
            <input className="input" value={userForm.username} placeholder="reception2"
              onChange={e => setUserForm(p => ({ ...p, username: e.target.value }))} />
          </div>
          <div className="form-group mb-0">
            <label className="label">Full Name</label>
            <input className="input" value={userForm.full_name} placeholder="Ravi Sharma"
              onChange={e => setUserForm(p => ({ ...p, full_name: e.target.value }))} />
          </div>
          <div className="form-group mb-0">
            <label className="label">Password</label>
            <input className="input" type="text" value={userForm.password} placeholder="min 6 characters"
              onChange={e => setUserForm(p => ({ ...p, password: e.target.value }))} />
          </div>
          <div className="form-group mb-0">
            <label className="label">Role</label>
            <select className="select" value={userForm.role}
              onChange={e => {
                const role = e.target.value
                setUserForm(p => ({ ...p, role, permissions: roleDefaults[role] || p.permissions }))
              }}>
              {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </form>

        <div className="rounded-xl border border-surface-200 p-4 mb-4">
          <p className="text-xs font-semibold text-surface-500 uppercase tracking-wide mb-2">Module access (checkbox)</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {permCatalog.map(p => (
              <label key={p.key} className="flex items-center gap-2 text-sm text-surface-700 cursor-pointer">
                <input type="checkbox" className="h-4 w-4 accent-brand-600"
                  checked={userForm.permissions.includes(p.key)}
                  onChange={() => setUserForm(prev => ({ ...prev, permissions: togglePerm(prev.permissions, p.key) }))} />
                {p.label}
              </label>
            ))}
          </div>
          <div className="mt-3 flex gap-3 flex-wrap">
            <button type="button" className="btn-primary btn btn-sm" disabled={creatingUser} onClick={handleCreateUser}>
              {creatingUser ? 'Creating…' : '+ Add User'}
            </button>
            <button type="button" className="btn-secondary btn btn-sm"
              onClick={() => setUserForm(p => ({ ...p, permissions: roleDefaults[p.role] || [] }))}>
              Reset to role default
            </button>
          </div>
        </div>

        {usersLoading ? (
          <div className="flex justify-center py-6"><Spinner /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-surface-500 border-b border-surface-100">
                  <th className="py-2 pr-3 font-medium">Name</th>
                  <th className="py-2 pr-3 font-medium">Login ID</th>
                  <th className="py-2 pr-3 font-medium">Role</th>
                  <th className="py-2 pr-3 font-medium">Modules</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b border-surface-50 align-top">
                    <td className="py-2.5 pr-3 text-surface-900 font-medium">{u.full_name}</td>
                    <td className="py-2.5 pr-3 font-mono text-surface-600">{u.username}</td>
                    <td className="py-2.5 pr-3 capitalize">{u.role}</td>
                    <td className="py-2.5 pr-3">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {(u.permissions || []).map(p => (
                          <span key={p} className="badge badge-gray text-[10px]">{permCatalog.find(x => x.key === p)?.label || p}</span>
                        ))}
                        {u.role === 'admin' && <span className="badge badge-green text-[10px]">All modules</span>}
                      </div>
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className={`badge ${u.is_active ? 'badge-green' : 'badge-red'}`}>{u.is_active ? 'Active' : 'Off'}</span>
                    </td>
                    <td className="py-2.5">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className="btn-secondary btn btn-sm"
                          onClick={() => setEditingUser({ ...u, new_password: '' })}>Edit</button>
                        <button type="button" className="btn-ghost btn btn-sm" onClick={() => resetPassword(u)}>Password</button>
                        <button type="button" className="btn-ghost btn btn-sm" onClick={() => toggleActive(u)}>
                          {u.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---------- Logo upload ---------- */}
      <div className="card p-6">
        <h2 className="font-display font-bold text-surface-900 text-lg mb-1">Logo (Invoice / Bill)</h2>
        <p className="text-sm text-surface-500 mb-4">
          PNG ya JPG upload karein. Ye logo Kripa Shanti ke bill/invoice par chhapega. (URL nahi — direct file.)
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <div className="w-40 h-24 rounded-lg border border-surface-200 bg-surface-50 flex items-center justify-center overflow-hidden">
            {logoPreview
              ? <img src={logoPreview} alt="Logo" className="max-h-full max-w-full object-contain" />
              : <span className="text-xs text-surface-400">No logo</span>}
          </div>
          <div className="space-y-2">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg" onChange={onLogoPick} className="hidden" id="logo-file" />
            <button type="button" className="btn-primary btn btn-sm" disabled={uploadingLogo}
              onClick={() => fileRef.current?.click()}>
              {uploadingLogo ? 'Uploading…' : 'Upload PNG / JPG'}
            </button>
            {logoPreview && (
              <button type="button" className="btn-ghost btn btn-sm ml-2"
                onClick={async () => {
                  setLogoPreview(''); setValues(p => ({ ...p, logo_data: '' }))
                  try { await settingsAPI.update({ logo_data: '' }); toast.success('Logo hata diya.') } catch { toast.error('Fail.') }
                }}>Remove</button>
            )}
          </div>
        </div>
      </div>

      {/* ---------- Other settings ---------- */}
      {Object.entries(groups).filter(([g]) => g !== 'printer').map(([group, items]) => (
        <div key={group} className="card p-6">
          <h2 className="font-display font-bold text-surface-900 text-lg mb-4 capitalize">{group} Settings</h2>
          <div className="space-y-4">
            {items.map(s => (
              <div key={s.setting_key} className="form-group">
                <label className="label">{s.label}</label>
                {s.input_type === 'textarea'
                  ? <textarea className="input" rows={2} value={values[s.setting_key] || ''} onChange={e => setValues(p => ({ ...p, [s.setting_key]: e.target.value }))} />
                  : <input className="input" type={s.input_type === 'image' ? 'text' : (s.input_type || 'text')}
                      value={values[s.setting_key] || ''}
                      onChange={e => setValues(p => ({ ...p, [s.setting_key]: e.target.value }))} />}
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="flex justify-end">
        <button onClick={handleSave} className="btn-primary btn btn-lg" disabled={saving}>
          {saving ? 'Saving…' : 'Save All Settings'}
        </button>
      </div>

      {/* ---------- Edit user modal ---------- */}
      <Modal open={!!editingUser} onClose={() => setEditingUser(null)} title="Edit Staff User" size="md">
        {editingUser && (
          <form className="space-y-3" onSubmit={saveEditUser}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="form-group"><label className="label">Login ID</label>
                <input className="input" value={editingUser.username}
                  onChange={e => setEditingUser(p => ({ ...p, username: e.target.value }))} /></div>
              <div className="form-group"><label className="label">Full Name</label>
                <input className="input" value={editingUser.full_name}
                  onChange={e => setEditingUser(p => ({ ...p, full_name: e.target.value }))} /></div>
              <div className="form-group"><label className="label">Role</label>
                <select className="select" value={editingUser.role}
                  onChange={e => {
                    const role = e.target.value
                    setEditingUser(p => ({ ...p, role, permissions: roleDefaults[role] || p.permissions }))
                  }}>
                  {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select></div>
              <div className="form-group"><label className="label">New Password (optional)</label>
                <input className="input" value={editingUser.new_password || ''} placeholder="blank = unchanged"
                  onChange={e => setEditingUser(p => ({ ...p, new_password: e.target.value }))} /></div>
            </div>
            <div className="rounded-xl border border-surface-200 p-3">
              <p className="text-xs font-semibold text-surface-500 uppercase mb-2">Module access</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {permCatalog.map(p => (
                  <label key={p.key} className="flex items-center gap-2 text-sm text-surface-700 cursor-pointer">
                    <input type="checkbox" className="h-4 w-4 accent-brand-600"
                      checked={(editingUser.permissions || []).includes(p.key)}
                      onChange={() => setEditingUser(prev => ({ ...prev, permissions: togglePerm(prev.permissions || [], p.key) }))} />
                    {p.label}
                  </label>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={!!editingUser.is_active}
                onChange={e => setEditingUser(p => ({ ...p, is_active: e.target.checked }))} />
              Active (login allowed)
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary btn" onClick={() => setEditingUser(null)}>Cancel</button>
              <button className="btn-primary btn" disabled={savingUser}>{savingUser ? 'Saving…' : 'Save Changes'}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
