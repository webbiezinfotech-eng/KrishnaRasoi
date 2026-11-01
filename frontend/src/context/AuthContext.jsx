import { createContext, useContext, useState, useEffect, useCallback } from "react"
import { authAPI } from "../services/api"

const AuthContext = createContext(null)

const ALL_PERMISSIONS = [
  "tables", "orders", "billing", "menu",
  "reports", "guest_house", "customers", "messaging",
  "settings", "users",
]

export function AuthProvider({ children }) {
  const [admin, setAdmin] = useState(() => {
    try { return JSON.parse(localStorage.getItem("admin_user")) } catch { return null }
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem("auth_token")
    if (token) {
      authAPI.me()
        .then(r => { setAdmin(r.data.data); setLoading(false) })
        .catch(() => { localStorage.clear(); setAdmin(null); setLoading(false) })
    } else {
      setLoading(false)
    }
  }, [])

  const login = async (username, password) => {
    const res = await authAPI.login({ username, password })
    const { token, admin: user } = res.data.data
    localStorage.setItem("auth_token", token)
    localStorage.setItem("admin_user", JSON.stringify(user))
    setAdmin(user)
    return user
  }

  const logout = async () => {
    try { await authAPI.logout() } catch {}
    localStorage.clear()
    setAdmin(null)
  }

  const role = ["admin", "manager", "reception", "waiter"].includes(admin?.role) ? admin.role : admin ? "admin" : null

  // Permissions come from the server (admin ticks them per staff user)
  const permissions = Array.isArray(admin?.permissions)
    ? admin.permissions
    : role === "admin" ? ALL_PERMISSIONS : []

  const can = useCallback((permission) => {
    if (!permission) return true
    if (role === "admin") return true
    return permissions.includes(permission)
  }, [permissions, role])

  const isWaiter = role === "waiter"
  const isAdmin = role === "admin"
  const isManager = role === "manager"
  const isReception = role === "reception"
  const isFrontDesk = role === "admin" || can("guest_house")

  return (
    <AuthContext.Provider value={{
      admin,
      loading,
      login,
      logout,
      isAuthenticated: !!admin,
      role,
      permissions,
      can,
      allPermissions: ALL_PERMISSIONS,
      isWaiter,
      isAdmin,
      isManager,
      isReception,
      isFrontDesk,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)

/** Home path after login, based on the modules the user actually has. */
export function homePathForRole(role, permissions) {
  const perms = Array.isArray(permissions) ? permissions : []
  if (role === "admin") return "/dashboard"
  if (perms.includes("guest_house") && !perms.includes("tables")) return "/guest-house"
  if (perms.includes("tables") || perms.includes("orders")) return "/tables"
  if (perms.includes("guest_house")) return "/guest-house"
  if (perms.includes("reports")) return "/reports"
  return "/guest-house"
}

/** Kept for backwards compatibility with older imports. */
export function isFrontDeskRole(role) {
  return ["admin", "manager", "reception"].includes(role)
}
