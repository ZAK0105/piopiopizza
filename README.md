# Pio Pio Pizza

Express pizza ordering: a mobile customer app, an orders API, and an admin dashboard with a live kitchen board.
No dependencies — it needs only Node.js 20 or newer.

## Run it

```bash
ADMIN_PASSWORD='choose-a-password' npm start     # http://localhost:3000
npm run demo                                     # same, but loads 3 weeks of demo orders on first start
npm test
```

- Customer app (Norwegian): `http://localhost:3000/`
- Admin: `http://localhost:3000/admin/`
- Staff dashboard for drivers and kitchen, made for phones: `http://localhost:3000/staff/`

If `ADMIN_PASSWORD` is not set, a random password is generated and printed in the terminal at each start.
Other settings: `PORT` (default 3000), `DATA_DIR` (default `./data`), `STORE_TZ` (default `Europe/Oslo`).

## What is where

| Folder | What it is |
|---|---|
| `app/` | Customer app. `menu.js` is the single list of products and standard prices, shared with the server. |
| `admin/` | Admin dashboard: Overview, Kitchen, Orders, Menu, Staff, Settings. |
| `staff/` | Staff dashboard: drivers take, collect and deliver orders and share their GPS; kitchen staff move orders through the oven. |
| `app/core.js` | The order rules: pricing, validation, order steps, statistics. Shared by the Node server, Base44 and the dashboard. |
| `server/` | `server.js` (HTTP + API), `logic.js` (order rules bound to the store), `db.js` (JSON file store), `demo.js` (demo orders). |
| `base44/` | Base44-only files (see below). |
| `test/` | API tests. |
| `tools/bundle.js` | `npm run bundle` builds `dist/pio-pio-pizza.html`, the customer app as one offline demo file. |
| `project/`, `chats/` | The original Claude Design export. |

## Base44 version

The same app runs on Base44 at https://piopio.base44.app (admin at `/admin`, sign in with a Base44 admin account).
`npm run base44` builds `dist-base44/`, the files that go into the Base44 app. `base44/` holds the Base44-only parts:
data models, the `placeOrder` and `trackOrder` backend functions, and `src/piopio/backend.js`, which connects the
front-ends to Base44. Everything else is generated from `app/` and `admin/`, so edit those and rebuild.

## How it works

- The customer app asks the server for prices, sold-out items and whether the kitchen is open. Without a server
  (the single-file bundle) it runs as a self-contained demo with a simulated tracker.
- Orders are priced on the server from `app/menu.js` plus the admin's price changes; totals sent by a browser are ignored.
- Order steps: received → in oven → ready → out for delivery → done (pickup: received → in oven → ready → done).
  A delivery leaves `ready` only with a driver: a driver takes it on the staff dashboard, or the admin assigns one.
- While a driver is out, their phone sends its position every few seconds; the customer's tracker shows the driver's
  name, vehicle, phone and position on an OpenStreetMap map, with distance and an estimated arrival time.
- Staff sign in with a PIN on the Node server, and with their own account (the e-mail on the Staff list) on Base44.
  Admins can open the staff dashboard as any staff member, with a simulated drive for testing.
- The admin dashboard updates live over a server-sent event stream.
- Data is one JSON file, `data/db.json`. Back it up by copying it.

## Before taking real orders

This is a working prototype, not a finished shop:

- **Payments are simulated.** "Pay with Vipps" and the card form charge nothing. A payment provider (Vipps MobilePay,
  Nexi/Nets, Stripe) must confirm payment before an order is created, and card details must be entered in the
  provider's hosted fields, never in this app's own form.
- **Run it behind HTTPS** (a reverse proxy or a hosting platform). The admin cookie is marked `Secure` when the
  proxy sends `X-Forwarded-Proto: https`.
- **One admin password, one server process.** There are no staff accounts, and the JSON store is meant for a single
  shop on a single machine; move to a database before running several instances.
- **Map tiles come from openstreetmap.org**, which is fine for light use; a busy shop should switch to a paid tile
  provider (one line in `app/app.js`).
- **Customer details are minimal.** Orders hold a delivery address but no name or phone number, and addresses in the
  app are three fixed examples.
