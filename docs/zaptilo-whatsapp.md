# Zaptilo WhatsApp setup

The Admin UI never talks to Zaptilo. React calls our PHP API; PHP calls `https://web.zaptilo.ai`.

## 1. Where to add `ZAPTILO_API_TOKEN`

Create `.env` in the project root (copy from `.env.example`):

```
ZAPTILO_API_TOKEN=
```

Put the real token only on the server. Do not commit `.env`. Do not put the token in React or Settings UI.

## 2. Where to add `ZAPTILO_TEST_PHONE`

Same `.env` file:

```
ZAPTILO_TEST_PHONE=9198XXXXXXXX
```

Use country code + 10-digit Indian number (example: `919876543210`).

## 3. TEST MODE

`WHATSAPP_TEST_MODE` does **not** block sending to selected contacts.

The **Send test WhatsApp** button uses `ZAPTILO_TEST_PHONE` only.

## 4. Live sending

```
MESSAGING_MODE=live
WHATSAPP_PROVIDER=zaptilo
WHATSAPP_TEST_MODE=false
```

Selected contacts are sent one-by-one via Zaptilo custom text (`/api/send`). Zaptilo templates are optional — not required for the message box in this app.

## 5. How to test one message

1. Set `ZAPTILO_API_TOKEN` and optionally `ZAPTILO_TEST_PHONE`.
2. Login as admin → **Customers**.
3. Click **Send test WhatsApp**, or select a contact and send from the composer.

## 6. How to fetch templates

`GET /backend/messaging/whatsapp/templates`

Uses Zaptilo `GET /api/templates`. Requires token. This app does not invent template names. Custom messages do not need a template.

## 7. How bulk sending works

1. Admin selects contacts and writes a custom message (`{{name}}` is optional).
2. Confirm dialog.
3. Frontend calls our campaign create + send endpoints once (not one request per contact).
4. Each valid active number is sent individually. One failure does not stop the batch.
5. Results are stored on `message_recipients` and `message_logs`.

SMS is a placeholder only. No SMS provider is integrated.

## 8. Database

- Reused `customers` (added `contact_type`, `is_active`)
- Reused `message_campaigns` / `message_recipients`
- Added `message_logs`

Migration: `database/migrations/add_zaptilo_whatsapp.sql`  
Tables are also created/altered automatically on first API use.

## 9. Backend endpoints (admin JWT)

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `/customers` | List / add contacts |
| PUT/DELETE | `/customers/:id` | Update / deactivate |
| GET | `/messaging/config` | Mode flags only (no token) |
| GET | `/messaging/whatsapp/health` | Connectivity check (no token returned) |
| POST | `/messaging/whatsapp/test` | One-number test |
| GET | `/messaging/whatsapp/templates` | Approved templates |
| POST | `/messaging/campaigns` + `.../send` | Bulk send |
| GET | `/messaging/logs` | Flat send history |
| GET | `/messaging/campaigns` | Campaign history |

## 10. Troubleshooting

- **Token not set** — `ZAPTILO_API_TOKEN` empty. Test send returns 422.
- **Invalid test phone** — must normalise to `91` + 10 digits.
- **Timeout** — increase `ZAPTILO_TIMEOUT` (default 20s).
- **Connection failed / nothing in Zaptilo Sent Report** — Zaptilo's docs list `api.zaptilo.ai`, but that hostname currently has **no DNS**. This app uses `https://web.zaptilo.ai`. Redeploy PHP; Hostinger `.env` can keep either URL. After deploy, **Messages** shows a Zaptilo reachable banner. Then send again.
- **HTTP 4xx from Zaptilo** — check number format, template approval, account credits. Response message is saved without the token.
- **TEST MODE still on** — selected customers will not be messaged. That is intentional.
- **Mock mode** — `MESSAGING_MODE=mock` stores campaigns but does not call Zaptilo except the dedicated test endpoint (which still needs a token).
- Frontend config never includes the API token.

Apache / PHP must be able to read the project-root `.env` file.
