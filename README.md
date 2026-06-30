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
- **Admin & marketing panel** (`/admin`) — password protected, with three tabs:
  - **Overview** — totals, plan popularity, payment breakdown, sign-up trend,
    estimated fiber revenue, and a live activity feed.
  - **Guests** — list, add, and delete guest accounts.
  - **Plans & Pricing** — add, edit, activate/deactivate, and delete plans and
    prices without touching code.
- **Storage** — **MySQL / MariaDB** (works with XAMPP out of the box), or a
  zero-setup JSON file (`DB_DRIVER=json`).

## Quick start

### Windows with XAMPP (recommended)

1. Install [Node.js](https://nodejs.org/) (LTS) and
   [XAMPP](https://www.apachefriends.org/).
2. Open the **XAMPP Control Panel** and click **Start** next to **MySQL**.
3. **Double-click `start.bat`.** It installs dependencies the first time,
   creates the `hotel_portal` database and tables automatically, starts the
   server, and opens the portal in your browser. Keep the window open while the
   portal runs; close it to stop.

> You can inspect the data anytime in **phpMyAdmin** (the "Admin" button next to
> MySQL in XAMPP) under the `hotel_portal` database.

**Port 3306 already in use?** This is common when another MySQL service is
installed. In XAMPP, click **Config → my.ini** next to MySQL, change `port=3306`
to `port=3307` (there's usually one under `[mysqld]` and one under `[client]`),
save, and start MySQL. The portal **automatically tries port 3307** if 3306
isn't available, so no other change is needed. (You can customise the fallback
list with `DB_PORT_FALLBACKS`.)

**No MySQL handy?** Edit `start.bat` and uncomment `set DB_DRIVER=json` to run
with a zero-setup JSON file instead.

### Any platform (command line)

```bash
npm install

# With MySQL (default) — make sure MySQL is running first:
npm start

# Or without a database:
DB_DRIVER=json npm start
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
| `ADMIN_PASSWORD` | `admin123` | Password to open the admin panel. |
| `DB_DRIVER` | `mysql` | `mysql` (XAMPP-ready) or `json` (no database). |
| `DB_HOST` | `127.0.0.1` | MySQL host. |
| `DB_PORT` | `3306` | MySQL port. |
| `DB_PORT_FALLBACKS` | `3307` | Ports tried automatically if `DB_PORT` is busy. |
| `DB_USER` | `root` | MySQL user (XAMPP default). |
| `DB_PASSWORD` | _(empty)_ | MySQL password (XAMPP default is empty). |
| `DB_NAME` | `hotel_portal` | Database name (created automatically). |
| `SEED_DEMO_USER` | `true` | Seed the demo guest on first run. |
| `DEMO_USERNAME` / `DEMO_PASSWORD` | `guest` / `guest123` | Demo guest credentials. |

See `.env.example` for the full list. Plans, prices, and payment-required
flags are managed from the **Plans & Pricing** tab in `/admin` — no code
edits needed.

## How it works

- **Backend:** Node.js + Express (`server.js`). Passwords are hashed with
  PBKDF2 (Node's built-in `crypto`) — no plaintext storage.
- **Storage:** a pluggable driver (`storage/`) — **MySQL/MariaDB** by default
  (tables auto-created), or a JSON file (`DB_DRIVER=json`). Both expose the same
  interface, so the rest of the app doesn't change.
- **Frontend:** static HTML/CSS/JS in `public/`.
- **Analytics:** every signup, login, failed login, and plan selection is
  recorded as an event, which powers the dashboard.

### Database tables (MySQL)

| Table | Holds |
| --- | --- |
| `users` | Guest accounts (hashed passwords). |
| `events` | Activity log powering the marketing dashboard. |
| `plans` | The editable plan catalogue. |

## Project structure

```
server.js            Express server + REST API
storage/
  index.js           Picks the driver from DB_DRIVER
  mysql.js           MySQL/MariaDB driver (XAMPP-ready)
  json.js            JSON-file driver (no database)
  defaults.js        Default plans + payment methods
  stats.js           Shared dashboard stat computation
public/
  index.html         Guest portal (login → plan → payment → redirect)
  admin.html         Admin panel (Overview / Guests / Plans)
  css/styles.css     Shared styling
  js/portal.js       Guest portal logic
  js/admin.js        Admin panel logic
data/db.json         Auto-created store when DB_DRIVER=json (git-ignored)
.env.example         All configuration options
```

## Notes

- This portal handles the **front-end captive-portal experience** (auth, plan
  choice, payment selection, analytics). Payments are recorded as the guest's
  chosen method — actual money is collected through Wish Money Lebanon or at
  the reception desk; no card processing happens in the app.
- For a real deployment behind a router/NAS, point your gateway's captive
  portal redirect at this server, and after `/api/select-plan` succeeds, grant
  the guest's MAC/IP internet access through your gateway.
