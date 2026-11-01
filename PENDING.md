# PENDING / COMPLETED WORK DOCUMENT
## Restaurant + Guest House System — Update (dated 2026-10-24)

Is document me poora record hai: kya complete hua, kya pending hai, aur har cheez kis file me hai.
**Original flow bilkul waisa hi rakha gaya hai — koi existing feature delete/rename/refactor nahi hua.**

---

## ✅ COMPLETED (poora kaam jo ho gaya)

### 1. Login / Roles (alag-alag password aur permissions)
- **4 roles ab supported hain:** `admin`, `manager`, `reception`, `waiter` — sabke alag login, alag permission.
- **Default logins (password change kar lena settings me):**
  - Admin: `admin` / `Admin@1234` (full access)
  - Manager: `manager` / `Manager@1234` (guest house + orders + tables)
  - Reception: `reception` / `Reception@1234` (guest house front desk + tables)
  - Waiter: `waiter` / `Waiter@1234` (tables + KOT only)
- **Files:** `backend/core/Auth.php` (naye role checks: `requireFrontDesk`, `requireManagement`, `requireAdmin`), `backend/controllers/AuthController.php`, `backend/controllers/UsersController.php`, `frontend/src/context/AuthContext.jsx`, `frontend/src/components/layout/AppLayout.jsx` (role-wise sidebar), `frontend/src/App.jsx` (`FrontDeskRoute` guard), `frontend/src/pages/settings/Settings.jsx` (4-role dropdown), `database/migrations/add_roles_and_guest_house_v2.sql`

### 2. Dashboard
- Guest house dashboard me ab **10 boxes**: Total Rooms, Available, Occupied/Booked, Cleaning, Maintenance, Today Check-ins, Today Check-outs, Active Guests, **Today Income**, **Pending Payments**.
- Main dashboard me **4 naye boxes**: Guest House Today Income, Guest House Pending (kitne stays me balance hai), Today Check-ins, Today Check-outs.
- **Files:** `backend/controllers/GuestHouseController.php` (`dashboard()`), `frontend/src/pages/guesthouse/GuestHouse.jsx`, `frontend/src/pages/dashboard/Dashboard.jsx`

### 3. Room Management
- Rooms me ab **Rent (per night)** field hai (add room + room card pe display).
- **Status ab 4 hain:** `available / booked / cleaning / maintenance` — khali room ke card se seedha status change kar sakte hain (dropdown).
- **Files:** `GuestHouseController.php` (`updateRoom()` naya endpoint `PUT /guest-house/rooms/{id}`), `GuestHouse.jsx`, migration SQL

### 4. Booking
- Pehle se tha: advance booking, walk-in, edit, advance payment — **untouched**. Sirf naye fields add hue (extra bed, photos — niche).

### 5. Guest Registration
- Ab **ID Proof Photo** aur **Guest Photo** upload ho sakta hai (camera/file se, base64 me store — ~2MB tak).
- Fields pehle se the: naam, mobile, address, ID proof number, adults/children, companions.
- **Files:** `GuestHouseController.php` (`createGuest`/`updateGuest` + `photoData()`), `GuestHouse.jsx` (file inputs + preview)

### 6. Check-in / Check-out
- **Extra Bed** fields: count + rate (₹/night) — check-in, edit dono me.
- **Final Bill (Folio)** naya: `GET /guest-house/guests/{id}/final-bill` — room rent, extra bed, food, laundry, other, paid, balance — print button ke saath.
- **Files:** `GuestHouseController.php` (`finalBill()`), `GuestHouse.jsx` (Final Bill button + modal)

### 7. Billing
- **Extra Charges** naya: kisi bhi checked-in/reserved guest pe **Food / Laundry / Other** charge add karo — balance auto-update.
- Endpoints: `POST /guest-house/guests/{id}/charges`, `GET .../charges`
- Restaurant billing pehle se GST (tax %) + print + PDF support karta tha — untouched. GST %, GST number ab Settings me visible (niche).
- **Files:** `GuestHouseController.php` (`addCharge()`), migration table `guest_house_charges`, `GuestHouse.jsx`

### 8. Reports
- **2 naye reports:**
  - **Occupancy Report** — day-wise occupied rooms + occupancy % (GET `/reports/occupancy`)
  - **Pending Payments Report** — guest house balances + restaurant unpaid bills + total (GET `/reports/pending-payments`)
- Daily/Monthly/Yearly sales, item-wise, table-wise, commission, payment mode — pehle se the, untouched.
- **Files:** `backend/controllers/ReportController.php` (`occupancy()`, `pendingPayments()`), `frontend/src/pages/reports/Reports.jsx`, `frontend/src/services/api.js`

### 9. WhatsApp Messaging (Customers module) — poora naya system
- **Customer select karo → message type karo → send** (pehle se tha, improved):
  - **Template picker naya** — 6 ready-made templates (Booking Confirmation, Welcome, Payment Reminder, Festival Greeting, Offer, Check-out Thank You). Client inme se choose karke seedha send kar sakta hai — **baat baat type nahi karna padta**. Templates create/edit/delete bhi kar sakte hain (DB me store: `message_templates`).
  - **{{name}} placeholder** auto-replace hota hai har customer ka naam.
- **Poori history:** Campaigns page pe har message ka record — kitne bheje (sent), kitne pending (queued), kitne failed. `message_logs` table me per-customer log bhi.
- **WhatsApp spend tracking:**
  - **Monthly budget** Settings me set karo (`WhatsApp Monthly Budget ₹`).
  - **Cost per message** bhi configurable (`WhatsApp Cost per Message ₹`).
  - **Dashboard pe budget box** (upar green/red box): kitna budget dala, kitna spend hua, kitna bacha, % used, is month kitne messages gaye — **Customers page pe bhi wahi strip dikhti hai**.
  - Last 6 months ka spend history API me included (`GET /messaging/budget`).
- **API integration:**
  - **Zaptilo** (pehle se configured) — untouched, kaam karta rahega.
  - **Official WhatsApp Business Cloud API (Meta) naya:** `.env` me `WHATSAPP_PROVIDER=meta_cloud` + `META_WHATSAPP_TOKEN` + `META_WHATSAPP_PHONE_NUMBER_ID` (+ optional `META_WHATSAPP_WABA_ID`) daalo — official API se messages jayenge. **File:** `backend/services/messaging/MetaWhatsAppCloudService.php` (nayi).
  - Koi key nahi hai to **mock mode** me sab kuch queue hota hai, kuch break nahi hota.
- **Files:** `backend/services/messaging/MessageTemplateService.php` (naya), `MessagingController.php` (template + budget endpoints), `MessageQueueService.php` (cost tracking), `WhatsAppService.php` (Meta routing), `frontend/src/pages/customers/Customers.jsx`, `Campaigns.jsx`, `api.js`

### 10. Settings
- Naye settings add hue (Settings page pe auto-appear): **Guest House Name, Logo (URL), GST Number, GST %, Invoice Format (a4/thermal), Extra Bed Charge, WhatsApp Monthly Budget, WhatsApp Cost per Message**.
- Room tariff = room-level `rent` (har room ka alag) + extra bed charge.
- **Files:** `database/migrations/add_roles_and_guest_house_v2.sql` (settings rows), Settings page (settings table se auto-render)

### 11. Database Migration (EK file me sab)
- **`database/migrations/add_roles_and_guest_house_v2.sql`** — apne existing database pe bas ye EK file run karo. Safe to re-run. Isse banenge/badlenge: 4 roles + reception/manager accounts, room rent + cleaning/maintenance status, guest photos, extra bed, `guest_house_charges` + `guest_house_payments` tables, `message_templates` table, naye settings, WhatsApp cost columns.

---

## 🔧 Fix applied in this package (2026-10-24)
- Fixed `backend/controllers/MessagingController.php`: the class was closed before `listTemplates()`, `createTemplate()`, `updateTemplate()`, `deleteTemplate()`, and `budget()`, causing a PHP parse error (`unexpected token "public", expecting end of file`). The class now closes after all methods.
- Verified: all PHP files under `backend/` pass `php -l`.
- Frontend production build is **not verified** here because `npm ci` did not finish within the available time; run `cd frontend && npm ci && npm run build` locally.

## ⏳ PENDING / NOTES (kya reh gaya)

1. **Migration run karna zaroori hai:** `add_roles_and_guest_house_v2.sql` apne server ke database pe run karna (phpMyAdmin → Import). Iske bina naye features ka backend 500 de sakta hai. Note: MySQL 8 pe `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` chalega; agar purani MySQL (5.7) hai to error aaye to batao, simple version bana dunga.
2. **WhatsApp live karne ke liye** `.env` me daalo:
   - Zaptilo ke liye: `MESSAGING_MODE=live`, `WHATSAPP_PROVIDER=zaptilo`, `ZAPTILO_API_TOKEN=...` (pehle jaisa hi)
   - Official Meta API ke liye: `WHATSAPP_PROVIDER=meta_cloud`, `META_WHATSAPP_TOKEN=...`, `META_WHATSAPP_PHONE_NUMBER_ID=...`, `META_WHATSAPP_WABA_ID=...`
   - **Important (Meta rule):** Business-initiated messages ke liye Meta pe APPROVED template hona chahiye (free-text sirf 24-hour reply window me jata hai). Zaptilo use kar rahi ho to waisa hi pehle jaisa chalega.
3. **Logo image upload** abhi URL-based hai (Settings → "Logo (image URL)"). Direct file-upload UI agle round me add ho sakta hai — chahiye to batao.
4. **Guest photos DB me store hote hain** (base64). Bahut zyada photos ho to server disk pe move karna better hai — abhi ke liye simple rakha hai.
5. **WhatsApp spend exact provider figure** Zaptilo/Meta dashboard se sync nahi hota — wo estimate hai (sent × cost-per-message). Provider response me cost aaye to auto-use hota hai (`cost_amount` column).
6. **Frontend build test:** saare changed JSX files esbuild se parse-check kiye (PASS). Poora `npm run build` aapke server pe ek baar chala lena (`cd frontend && npm install && npm run build`).

---

## 📁 Changed / New Files
| File | Change |
|---|---|
| `database/migrations/add_roles_and_guest_house_v2.sql` | **NEW** — single migration for everything |
| `backend/core/Auth.php` | 4 roles + requireFrontDesk/requireManagement |
| `backend/controllers/GuestHouseController.php` | dashboard boxes, rent, room status, photos, extra bed, charges, final bill, payments ledger |
| `backend/controllers/MessagingController.php` | local templates CRUD + budget endpoint |
| `backend/controllers/ReportController.php` | occupancy + pendingPayments reports |
| `backend/controllers/UsersController.php`, `AuthController.php` | 4 roles |
| `backend/index.php` | new routes |
| `backend/services/messaging/MetaWhatsAppCloudService.php` | **NEW** — official WhatsApp Cloud API |
| `backend/services/messaging/MessageTemplateService.php` | **NEW** — reusable message templates |
| `backend/services/messaging/WhatsAppService.php` | Meta provider routing |
| `backend/services/messaging/MessageQueueService.php` | per-message cost tracking |
| `backend/services/messaging/MessagingService.php` | config exposes active provider |
| `.env.example` | Meta Cloud API keys documented |
| `frontend/src/services/api.js` | naye API bindings |
| `frontend/src/context/AuthContext.jsx`, `App.jsx`, `components/layout/AppLayout.jsx` | role guards + sidebars |
| `frontend/src/pages/guesthouse/GuestHouse.jsx` | 10 stat boxes, rent, status change, photos, extra bed, charges, final bill modal |
| `frontend/src/pages/dashboard/Dashboard.jsx` | GH money boxes + WhatsApp budget box |
| `frontend/src/pages/customers/Customers.jsx` | template picker + budget strip |
| `frontend/src/pages/reports/Reports.jsx` | Occupancy + Pending Payments tabs |
| `frontend/src/pages/settings/Settings.jsx` | 4-role dropdown |
