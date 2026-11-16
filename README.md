# Pio Pio Pizza

Express pizza ordering: a mobile customer app, an orders API, and an admin dashboard with a live kitchen board.
No dependencies — it needs only Node.js 20 or newer.

## Run it

```bash
ADMIN_PASSWORD='choose-a-password' npm start     # http://localhost:3000
npm run demo                                     # same, but loads 3 weeks of demo orders on first start
npm test
```

- Customer app: `http://localhost:3000/`
- Admin: `http://localhost:3000/admin/`

If `ADMIN_PASSWORD` is not set, a random password is generated and printed in the terminal at each start.
Other settings: `PORT` (default 3000), `DATA_DIR` (default `./data`), `STORE_TZ` (default `Europe/Oslo`).

## What is where

| Folder | What it is |
|---|---|
| `app/` | Customer app. `menu.js` is the single list of products and standard prices, shared with the server. |
| `admin/` | Admin dashboard: Overview, Kitchen, Orders, Menu, Settings. |
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
- Order steps: received → in oven → out for delivery (or ready for pickup) → done. The kitchen board moves an order
  one step at a time and the customer's tracker follows.
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
- **Customer details are minimal.** Orders hold a delivery address but no name or phone number, and addresses in the
  app are three fixed examples.
