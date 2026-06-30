# 🏨 Hotel WiFi Captive Portal

A self-contained captive portal for a hotel. Guests sign in (or sign up),
choose a WiFi plan, pay via **Wish Money Lebanon** or **cash at reception**,
and are redirected to the hotel's official website. Staff get a live
**marketing dashboard** to track activity.

## Features

- **Login / Sign-up** — guests log in with a username + password, or register
  a new account (full name + room number) if they don't have one.
- **Plan selection** — four plans:
  | Plan | Speed | Price |
  | --- | --- | --- |
  | Free WiFi | Best effort | Free |
  | Fiber Optic 50 Mbps | 50 Mbps | $5 |
  | Fiber Optic 70 Mbps | 70 Mbps | $8 |
  | Fiber Optic Open Speed | Unlimited | $12 |
- **Payment** — paid (fiber) plans require a payment method: **Wish Money
  Lebanon** or **Cash at Reception**. Free WiFi needs no payment.
- **Redirect** — after a plan is confirmed the guest is sent to the hotel's
  official website.
- **Marketing dashboard** (`/admin`) — totals, plan popularity, payment method
  breakdown, sign-up trend, estimated fiber revenue, and a live activity feed.

## Quick start

### Windows (easiest)

Make sure [Node.js](https://nodejs.org/) (LTS) is installed, then just
**double-click `start.bat`**. It installs dependencies the first time,
starts the server, and opens the portal in your browser. Keep the window
open while the portal runs; close it to stop.

### Any platform (command line)

```bash
npm install
npm start
```

Then open:

- Guest portal: <http://localhost:3000>
- Marketing dashboard: <http://localhost:3000/admin>

### Sign-in credentials

- **Guest portal:** guests create their own accounts via **Sign up**. For
  convenience, a demo account is auto-created on first run:
  **username `guest` / password `guest123`** (change with `DEMO_USERNAME` /
  `DEMO_PASSWORD`, or disable with `SEED_DEMO_USER=false`).
- **Marketing dashboard:** password **`admin123`** (change with
  `ADMIN_PASSWORD`).

## Configuration

All configuration is via environment variables (defaults shown):

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Port the server listens on. |
| `OFFICIAL_WEBSITE_URL` | `https://www.your-hotel.com` | Where guests are redirected after choosing a plan. |
| `ADMIN_PASSWORD` | `admin123` | Password to open the marketing dashboard. |

Example:

```bash
OFFICIAL_WEBSITE_URL="https://www.grandhotel.com" \
ADMIN_PASSWORD="a-strong-secret" \
PORT=8080 \
npm start
```

To change plans, prices, or payment methods, edit the `PLANS` and
`PAYMENT_METHODS` arrays at the top of `server.js`.

## How it works

- **Backend:** Node.js + Express (`server.js`). Passwords are hashed with
  PBKDF2 (Node's built-in `crypto`) — no plaintext storage.
- **Storage:** a JSON file at `data/db.json` (created automatically) holding
  `users` and `events`. No database to install.
- **Frontend:** static HTML/CSS/JS in `public/`.
- **Analytics:** every signup, login, failed login, and plan selection is
  recorded as an event, which powers the dashboard.

## Project structure

```
server.js            Express server + API + plan catalogue
db.js                JSON-file storage helper
public/
  index.html         Guest portal (login → plan → payment → redirect)
  admin.html         Marketing dashboard
  css/styles.css     Shared styling
  js/portal.js       Guest portal logic
  js/admin.js        Dashboard logic
data/db.json         Auto-created data store (git-ignored)
```

## Notes

- This portal handles the **front-end captive-portal experience** (auth, plan
  choice, payment selection, analytics). Payments are recorded as the guest's
  chosen method — actual money is collected through Wish Money Lebanon or at
  the reception desk; no card processing happens in the app.
- For a real deployment behind a router/NAS, point your gateway's captive
  portal redirect at this server, and after `/api/select-plan` succeeds, grant
  the guest's MAC/IP internet access through your gateway.
