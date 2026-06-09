# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

AMT Trans'it — a logistics / cash-management ERP for a freight company shipping
between France (departure) and Côte d'Ivoire / other routes (arrival). The web
app is **vanilla JS ES modules, no build step, no framework, no bundler**.
Firebase (Firestore + Auth + Cloud Functions) is the entire backend. The UI and
all comments/data are in **French**.

There is no root `package.json`, no test suite, and no linter. The only npm
projects are `functions/` and `mobile-parrainage/`.

## Commands

**Web app (dev):** serve the repo root statically and open `index.html`. The
team uses VS Code Live Server (port `5502`, see `.vscode/settings.json`). Any
static server at the repo root works — there is nothing to build.

**Web app (deploy):** the site is hosted on **Vercel** (static; `vercel.json`
redirects legacy `/paris` and `/abidjan` paths to `/index.html`). `firebase.json`
has **no hosting block** — do not run `firebase deploy --only hosting`.

**Cloud Functions** (`functions/`, Node 20, firebase-functions **v2 / 2nd gen**):
```bash
cd functions && npm install
npm run serve     # emulator (functions only)
npm run deploy    # firebase deploy --only functions
npm run logs
```

**Firestore rules / indexes:**
```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

**Full local emulators:** `firebase emulators:start` (auth 9099, firestore 8080,
functions 5001, ui enabled). Firebase project: `caisse-amt-perso`.

**Mobile app** (`mobile-parrainage/`, Expo SDK 52, read-only parrain/filleul):
```bash
cd mobile-parrainage && npm install
npx expo start            # Expo Go / simulators
eas build --profile preview   # shareable Android APK (see eas.json)
```

**Data repair:** `node scripts/backfill-agency.cjs` — backfills missing
`agency` / `isDeleted` fields (read the file header before running; needs admin
credentials and is destructive-by-write).

## Architecture

### Single unified SPA

`index.html` is the only real page. It loads, in order: `utils.js` (classic
script — global loader + `window.AppModal`), `auth-guard.js` (module), `app.js`
(module). The body is `display:none` until `auth-guard.js` validates the
session.

- **`auth-guard.js`** — the gate. Runs `onAuthStateChanged`, loads the
  `users/{uid}` profile (`role`, `agency`), loads role permissions from
  `roles/{role}`, populates `sessionStorage` (`userRole`, `userAgency`,
  `currentActiveAgency`, etc.), injects the user/agency-switcher header, applies
  per-agency **branding** (colors/logo/fonts from `settings/*` docs, cached in
  `sessionStorage`), and force-redirects users off the legacy `/paris/` and
  `/abidjan/` folders back to the unified root.
- **`app.js`** — the router. Exports a global `window.app` singleton. The full
  "super-menu" is hard-coded in `index.html`; `app.js` shows/hides menu
  categories based on `settings/menus_<agency>` (order, per-role allow-lists,
  `visibleMenus`, `hiddenItems`) combined with the agency type. `renderPage()`
  dispatches via a `renderers` map to the right View module.

### Agency / multi-tenant model — read this before touching data access

`agencies-config.js` defines agencies, each with a `type`:
- **`departure`** (e.g. `paris`) → UI/code lives in `paris/`
- **`arrival`** (e.g. `abidjan`) → UI/code lives in `abidjan/`

`getCollectionName(baseName)` does tenant-aware Firestore collection routing:
- Historical `paris` / `abidjan` / `all` → **base collection name unchanged**
  (e.g. `transactions`).
- SaaS routes → **suffixed** collections (e.g. agency `chine` →
  `transactions_chine`; `abidjan_chine` reads `transactions_chine`).

**Always use `getCollectionName()` for tenant-scoped collections** (transactions,
livraisons, expenses, clients, etc.). Hard-coding a base name breaks isolation
for SaaS routes. `firestore.rules` enforces the same model: historical
collections are gated on `agency in ['paris','abidjan']`; everything else is
matched by a regex on the collection-name suffix vs. the user's `agency`.
`agency === 'all'` or role `super_admin` = global access.

### View module pattern

Every screen is an ES module exporting a singleton, e.g.:
```js
export const SomethingView = { render(app, container) { /* ... */ } };
```
Views are statically imported at the top of `app.js` and invoked from the
`renderers` map. Locations:
- `shared/views/` — used by both agency types
- `paris/js/views/` — departure-specific
- `abidjan/js/views/` — arrival-specific
- A few pages render **dual** views chosen by `isArrival` (e.g. `dashboard`,
  `chat`, `settings-software`).

Views reach back into the app via globals: `window.app.showToast(...)`,
`window.app.formatMoneyLocal(...)`, `window.app.renderPage(...)`, and
`window.AppModal.confirm/error/...` for dialogs (don't use native
`alert`/`confirm` in new code).

### Auth specifics

Login (`login.js`) maps a username to a technical email: `username` →
`username@amt.com` (unless it already contains `@`). Roles seen across the code:
`super_admin`, `admin`, `manager`, `agent`, `chauf`, `spectateur`. Cloud
Functions (`createAgent`, `deleteAgent`, `provisionDemarcheurAuth`) re-check the
caller's role server-side via the Admin SDK — never trust client role for
privileged actions. `provisionDemarcheurAuth` issues custom claims
(`role: 'demarcheur'`) consumed by the mobile-app Firestore rules; demarcheur
claims grant **no** staff access (staff rules read `users/{uid}.role`, not the
token).

## Conventions & gotchas

- **Firebase SDK** is loaded by URL from `https://www.gstatic.com/firebasejs/9.22.0/...`
  (modular v9), often via dynamic `import()` inside view methods. Keep the
  version consistent (`9.22.0`).
- **Soft deletes:** records carry `isDeleted`; queries filter it. Tenant docs
  must carry an `agency` field — a Firestore `where`/`orderBy` on a field
  silently excludes documents missing that field (the reason
  `backfill-agency.cjs` exists).
- **Money / i18n:** `window.app.formatMoneyLocal(amount)` → EUR when active
  agency is `paris`, otherwise XOF (FCFA). EUR↔FCFA rate is
  `CONSTANTS.TAUX_CONVERSION = 656` in `constants.js`.
- **Shipping mode:** `sessionStorage.shippingMode` (`maritime` | `aerien`),
  toggled from the header; changing it calls `location.reload()` so screens
  recalculate.
- **Cash-flow logic** lives in `services/transactionService.js` (validated-
  session whitelist, cash balance, storage fees) — reuse it rather than
  re-deriving totals.
- Legacy `/paris/*` and `/abidjan/*` folders still exist but the app is the
  unified root; auth-guard actively migrates users off them. New screens go
  through `app.js` + a View module, not standalone HTML pages.

## Working in this repo

The maintainer is non-technical and works in French. When communicating about
this project, reply in plain, non-technical French, one step at a time, and
validate changes on localhost before any commit/push.
