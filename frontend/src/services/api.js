import axios from "axios"

// Local dev → Vite proxy: /api (aur /backend bhi) → http://localhost:8000 (PHP server)
// Deployed server (Apache/XAMPP htdocs) → /backend folder directly serve hota hai
const isLocal = typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname)
const API_BASE_URL = isLocal ? "/api" : "/backend"

const api = axios.create({ baseURL: API_BASE_URL, headers: { "Content-Type": "application/json" }, timeout: 15000 })

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem("auth_token")
  if (token) cfg.headers.Authorization = "Bearer " + token
  return cfg
})
api.interceptors.response.use(res => res, err => {
  const status = err.response?.status
  const path = err.config?.url || ""
  const isAuthFailureOk = path.includes("/auth/login") || path.includes("/auth/change-password")
  if (status === 401 && !isAuthFailureOk) {
    localStorage.removeItem("auth_token")
    localStorage.removeItem("admin_user")
    window.location.href = "/login"
  }
  return Promise.reject(err)
})

export const authAPI = {
  login: d => api.post("/auth/login", d),
  logout: () => api.post("/auth/logout"),
  me: () => api.get("/auth/me"),
  changePassword: d => api.post("/auth/change-password", d),
  permissions: () => api.get("/auth/permissions"),
}
export const dashboardAPI = { get: () => api.get("/dashboard") }
export const tableAPI     = { list: () => api.get("/tables"), show: id => api.get(`/tables/${id}`), update: (id,d) => api.put(`/tables/${id}`,d), reset: id => api.post(`/tables/${id}/reset`) }
export const categoryAPI  = { list: p => api.get("/categories",{params:p}), create: d => api.post("/categories",d), update: (id,d) => api.put(`/categories/${id}`,d), delete: id => api.delete(`/categories/${id}`) }
export const menuAPI      = { list: p => api.get("/menu-items",{params:p}), create: d => api.post("/menu-items",d), update: (id,d) => api.put(`/menu-items/${id}`,d), delete: id => api.delete(`/menu-items/${id}`) }
export const orderAPI     = { list: p => api.get("/orders",{params:p}), show: id => api.get(`/orders/${id}`), createDineIn: d => api.post("/orders/dine-in",d), createGuestHouse: d => api.post("/orders/guest-house",d), addItem: (id,d) => api.post(`/orders/${id}/items`,d), updateItem: (id,iid,d) => api.put(`/orders/${id}/items/${iid}`,d), removeItem: (id,iid) => api.delete(`/orders/${id}/items/${iid}`), updateCommission: (id,d) => api.put(`/orders/${id}/commission`, d), cancel: id => api.post(`/orders/${id}/cancel`) }
export const billingAPI   = { generateBill: (id,d) => api.post(`/orders/${id}/bill`,d), list: p => api.get("/bills",{params:p}), show: num => api.get(`/bills/${num}`), markPaid: (num,d) => api.post(`/bills/${num}/mark-paid`, d), updatePaymentStatus: (num,d) => api.post(`/bills/${num}/payment-status`, d) }
export const reportAPI    = { sales: p => api.get("/reports/sales",{params:p}), itemWise: p => api.get("/reports/item-wise",{params:p}), tableWise: p => api.get("/reports/table-wise",{params:p}), commission: p => api.get("/reports/commission",{params:p}), paymentMode: p => api.get("/reports/payment-mode",{params:p}) }
export const settingsAPI  = {
  list: () => api.get("/settings"),
  public: () => api.get("/settings/public"),
  update: d => api.put("/settings", d),
  uploadLogo: (file) => {
    const fd = new FormData()
    fd.append("logo", file)
    return api.post("/settings/logo", fd, { headers: { "Content-Type": "multipart/form-data" }, timeout: 60000 })
  },
}
export const usersAPI     = {
  list: () => api.get("/users"),
  create: d => api.post("/users", d),
  update: (id, d) => api.put(`/users/${id}`, d),
}
export const printAPI     = {
  health: () => api.get("/print/health"),
  bill: d => api.post("/print/bill", d),
  kot: d => api.post("/print/kot", d),
  test: d => api.post("/print/test", d),
}
export const customerAPI = {
  list: p => api.get("/customers", { params: p }),
  ids: p => api.get("/customers", { params: { ...p, ids_only: 1 } }),
  byDate: p => api.get("/customers/by-date", { params: p }),
  create: d => api.post("/customers", d),
  update: (id, d) => api.put(`/customers/${id}`, d),
  delete: id => api.delete(`/customers/${id}`),
}
export const messagingAPI = {
  config: () => api.get("/messaging/config"),
  preview: d => api.post("/messaging/preview", d),
  listCampaigns: p => api.get("/messaging/campaigns", { params: p }),
  createCampaign: d => api.post("/messaging/campaigns", d, { timeout: 60000 }),
  showCampaign: id => api.get(`/messaging/campaigns/${id}`),
  previewCampaign: id => api.post(`/messaging/campaigns/${id}/preview`),
  sendCampaign: id => api.post(`/messaging/campaigns/${id}/send`, {}, { timeout: 120000 }),
  recipients: (id, p) => api.get(`/messaging/campaigns/${id}/recipients`, { params: p }),
  testWhatsApp: d => api.post("/messaging/whatsapp/test", d || {}, { timeout: 30000 }),
  whatsappHealth: () => api.get("/messaging/whatsapp/health", { timeout: 25000 }),
  templates: () => api.get("/messaging/whatsapp/templates"),
  logs: p => api.get("/messaging/logs", { params: p }),
  localTemplates: () => api.get("/messaging/templates/local"),
  createLocalTemplate: d => api.post("/messaging/templates/local", d),
  updateLocalTemplate: (id, d) => api.put(`/messaging/templates/local/${id}`, d),
  deleteLocalTemplate: id => api.delete(`/messaging/templates/local/${id}`),
  budget: () => api.get("/messaging/budget"),
}
export const guestHouseAPI = {
  updateRoom: (id, d) => api.put(`/guest-house/rooms/${id}`, d),
  deleteRoom: id => api.delete(`/guest-house/rooms/${id}`),
  addCharge: (id, d) => api.post(`/guest-house/guests/${id}/charges`, d),
  charges: id => api.get(`/guest-house/guests/${id}/charges`),
  finalBill: id => api.get(`/guest-house/guests/${id}/final-bill`),
  cancelBooking: id => api.post(`/guest-house/guests/${id}/cancel`),
  report: p => api.get("/guest-house/reports", { params: p }),
  occupancy: p => api.get("/reports/occupancy", { params: p }),
  pendingPayments: () => api.get("/reports/pending-payments"),
  dashboard: () => api.get("/guest-house/dashboard"),
  rooms: () => api.get("/guest-house/rooms"),
  createRoom: d => api.post("/guest-house/rooms", d),
  roomCategories: () => api.get("/guest-house/room-categories"),
  createRoomCategory: d => api.post("/guest-house/room-categories", d),
  profiles: p => api.get("/guest-house/profiles", { params: p }),
  createProfile: d => api.post("/guest-house/profiles", d),
  createGuest: d => api.post("/guest-house/guests", d),
  updateGuest: (id, d) => api.put(`/guest-house/guests/${id}`, d),
  availableRooms: p => api.get("/guest-house/available-rooms", { params: p }),
  bookings: () => api.get("/guest-house/bookings"),
  createBooking: d => api.post("/guest-house/bookings", d),
  addPayment: (id, d) => api.post(`/guest-house/guests/${id}/payment`, d),
  checkout: id => api.post(`/guest-house/guests/${id}/checkout`),
}
export const backupAPI = {
  stats: () => api.get("/backup/stats"),
  exportUrl: () => `${API_BASE_URL}/backup/export`,
  import: (file) => {
    const fd = new FormData()
    fd.append("backup", file)
    return api.post("/backup/import", fd, { headers: { "Content-Type": "multipart/form-data" }, timeout: 180000 })
  },
}
export default api
