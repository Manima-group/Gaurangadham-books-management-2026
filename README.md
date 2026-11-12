# Gaurangadham Grantha Seva — Book Distribution System

Book distribution, daily sales and money tracking for Gaurangadham's Dhams — built for ordinary users, not accountants.

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind CSS 4 · PostgreSQL · Drizzle ORM · Better Auth · Zod

## Quick start

```bash
cp .env.example .env            # set DATABASE_URL and BETTER_AUTH_SECRET (openssl rand -base64 32)
docker compose up -d            # or use your own PostgreSQL 14+
npm install
npm run db:push                 # create / update tables (run again after every update)
npm run db:seed                 # demo data   (SEED_EMPTY=1 npm run db:seed → admin only)
npm run dev                     # http://localhost:3000
```

| Role | Login (mobile or email) | Password |
|---|---|---|
| Global Admin | `admin@gaurangadham.org` or `9000000001` | `admin123` |
| Dham Manager (Hyderabad) | `9000000002` | `manager123` |
| Devotee (Govinda Sharma) | `9000000011` | `devotee123` |

Change these passwords before real use. `npm run db:reset` wipes and re-seeds.

Production: `npm run build && npm start`.

## What's in it (mapped to the UX spec)

| Spec | Where |
|---|---|
| Simple terminology (Book Stock, Receive Books, Money Yet to Submit, Changes Required…) | `src/lib/terms.ts` — all user-facing status labels in one place |
| Role dashboards + Quick Actions | `/dashboard` → `admin.tsx`, `manager.tsx`, `devotee.tsx` |
| Step 1 Admin setup + progress indicator | `/setup`, `/dhams`, `/drives`, `/books`, `/people` |
| Step 2 Receive Books ("Successfully received 500 copies of …") | `/stock/receive` |
| Step 3 Assign Books to Dham (enter → review → confirm) | `/stock/assign-dham` |
| Step 4 Assign Books to Devotees | `/stock/assign-devotees`, take back at `/stock/take-back` |
| Step 5 Guided daily sales form (auto amount = qty × price, +/− steppers, validation) | `/my/sales` |
| Step 6 Money submission (partial, cash/UPI/bank, UTR) | `/my/money` |
| Step 7 Manager review (Approve / Request Correction / Reject, reason required) | `/reports`, `/reports/[id]` |
| Step 8 Admin monitoring with Dham / drive / devotee / date filters | `/monitor` |
| Step 9 Daily closing — never forces figures to balance; differences need a written note | `/closing` |
| Workflow visualisation (status, responsible, pending, last date, click-through) | `/workflow` |
| First-login welcome + role tour, tooltips, help text, empty states, clear errors | `/welcome`, `HelpTip`, `PageHeader` |
| Every page answers *Where am I? / What do I do? / What happens next?* | `PageHeader` component |
| Activity History, notifications, Book Movement History | `/activity`, `/notifications`, `/stock/history` |

## Dham-wise distribution & Big/Small books

- **Home** opens with Dham-wise widgets: books distributed **today** and **total so far** per Dham, split into 📕 Big and 📗 Small books. Tap a Dham to see **who distributed how many** (ranked, with Big/Small split, value and days), plus which books.
- **Dham-wise Distribution** page (`/distribution`): filter by Today / Last 7 days / This month / All time and by Big or Small books.
- "Distributed" = books reported as sold in daily reports that are approved or being reviewed.
- Every book has a **size** (Big / Small), set when adding or editing a book in Books & Prices.
- **Upgrading an existing database:** run `npm run db:push` — it adds the `size` column (existing books start as *Small*); then mark your big books (e.g. Bhagavad Gita) as *Big* in Books & Prices.

## Look & feel

- **3D intro** — on first open in each browser session a ~8-second intro plays: the Manima emblem flies in and turns in real 3D (stacked depth layers) over slowly turning rays of light and a mandala, with rising diya sparks, a blooming lotus and a light sweep across the logo; then *Manima AI-Tech Solutions presents Gaurangadham Books*. Skippable (button or Esc/Enter), respects "reduce motion", replay from **My Account → Play the intro again** (or `?intro=1`). Code: `src/components/intro.tsx`, styles at the bottom of `globals.css`.
- **Logo** — HD vector traced from the Manima logo: `public/brand/manima-logo.svg` (navy) and `manima-logo-light.svg` (ivory, for dark backgrounds); the intro uses the `.webp` layers in the same folder. Paths are in `src/lib/brand.ts`.
- **Name & portrait** — the app is called *Gaurangadham Grantha Seva* (Book Distribution System), shown with Srila Prabhupada's portrait (`public/brand/prabhupada.webp`). Change the name in one place: `APP_NAME` in `src/lib/brand.ts`.
- **Colours & fonts** — navy ink text, saffron actions, warm ivory background; Plus Jakarta Sans for headings and Inter for body, self-hosted (no Google Fonts call). All colours live in the `@theme` block of `src/app/globals.css`.

## Mobile

Built mobile-first and checked at 360, 390 and 440 px wide (`python3 e2e/mobile_audit.py 390`): no sideways scrolling on any page, all tap targets at least 40 px tall, tables become cards on phones, status filters are one-tap chips, other filters fold into a "Filters" panel, help tips open on tap and stay on screen, and the side menu opens full-screen.

## Reliability, backups & speed

**Same-moment clicks are safe.** Approving a report, assigning books, taking books back, saving a sales report and submitting money each run in one database transaction holding a lock. Two managers approving the same report at once → posted once, the second sees "already reviewed". Two people assigning the same stock at once → never more than exists. A double-tap on Submit Money → one entry. (Tested with real simultaneous clicks: `python3 e2e/race.py`.)

**Backups**
```bash
npm run db:backup                       # → backups/gaurangadham-YYYY-MM-DD_HH-mm.dump (newest 30 kept)
npm run db:restore -- backups/<file>    # replaces all data; asks you to type RESTORE
```
Automatic daily backup at 02:00 IST — pick one:
- **Docker:** `docker compose up -d` also starts the `backup` service (files land in `./backups`).
- **Windows:** once, in PowerShell from the project folder: `powershell -ExecutionPolicy Bypass -File scripts\schedule-backup-windows.ps1`
- **Linux:** `crontab -e` → `0 2 * * * cd /path/to/app && npm run db:backup >> backups/backup.log 2>&1`

`pg_dump` is found automatically (PATH, `C:\Program Files\PostgreSQL\<ver>\bin`, or Docker); set `PG_BIN` if needed. **Copy the `backups` folder off the machine regularly** (Google Drive, USB) — a backup on the same disk doesn't survive a disk failure.

**Speed.** Lookup indexes on reports, report lines, money, movements, notifications and activity. Stock uses saved **checkpoints**: balances are read from the latest checkpoint plus only newer movements (made automatically in the background at most every 12 h once 500+ new movements exist; or `npm run db:checkpoint`). With 2 years of data (29k reports, 175k movements) every page answers in ≈ 0.25 s or less; the stock overview went from 181 ms to 29 ms.

## Download Report (Excel & PDF)

Daily Reports, Collected Money, Dham-wise Distribution (overview and per Dham), Daily Closing and Book Stock each have **⬇ Download Report: 📊 Excel · 📄 PDF**, exporting exactly what the page shows (same filters). Managers only ever get their own Dham. PDFs use the bundled Noto Sans font (`assets/fonts`) so ₹ prints correctly.

## Install on phones & offline mode

The app is an installable **PWA**:
- **Android (Chrome):** open the site → menu ⋮ → **Install app** / **Add to Home screen**.
- **iPhone (Safari):** Share → **Add to Home Screen**.

Offline: pages a devotee uses (Home, Today's Sales, My Books, Submit Money, My Reports) are saved on the phone after they log in. With no signal they still open; **Submit Today's Sales** and **Submit Money** are saved on the phone and **sent automatically** when the signal returns (a banner shows what's waiting; anything the server rejects is shown with an "Open and fix" link). Saved pages are cleared at logout / when a different person logs in.

> Offline mode needs **HTTPS** in production (browsers only allow service workers on https:// or localhost). Phones opening `http://192.168.x.x:3000` on your Wi-Fi get the normal app, but not offline mode.

## Daily sales at many places · manager distribution · delete & undo

- **Many places in one day.** A devotee (or a Manager) adds each place they went to — name, landmark, time of day — and how many of each book they gave there. Past place names are suggested. A Manager sees a per-place breakdown when reviewing.
- **Money is never required.** The sales form has an optional "money collected" box; money can be handed over any time from *Hand Over Money*.
- **Clean devotee home.** One big "Add Today's Sales" button, Given / Sold / Left tiles, and a per-book list with a progress bar (*My Books*).
- **Managers distribute too.** A Manager can give books to themselves ("— me") and use *My Sales / My Books / My Money*. Their own reports are approved automatically.
- **Delete everywhere, safely.**
  - Reports: the owner can delete until approved; a Manager/Admin can delete any — an approved report's sold books go back to the devotee.
  - Stock movements: *Undo* adds a correction (the history keeps both). Blocked if the books were already sold or given on.
  - Money entries, people, Dhams, books, drives, notifications: delete, or **Mark as Inactive** when they already have history.
  - Daily closing: *Re-open this day*.
- **Loading:** shimmer skeleton pages plus a 3D book loader in the middle while a page loads.
- **Fast forms:** forms call the server directly with their own pending state (no stuck "Sending…"), and never clear what you typed on an error.

## Tests

| Command | What it checks |
|---|---|
| `python3 e2e/run.py` | Whole workflow across all three roles |
| `python3 e2e/allpages.py` | Every page for every role loads without errors |
| `python3 e2e/mobile_audit.py 390` | No sideways scrolling, tap targets ≥ 40 px at a phone width |
| `python3 e2e/race.py` | Simultaneous approve / assign / money clicks |
| `python3 e2e/offline.py` | Offline sales & money, auto-send on reconnect |
| `python3 e2e/features.py` | Many places per day, manager self-distribution, delete/undo, inactive vs delete, loader |
| `npx tsx --conditions=react-server tests/checkpoint.test.ts` | Checkpointed stock = full-history stock |

The e2e scripts need Python Playwright (`pip install playwright && playwright install chromium`) and the app running on port 3000 with demo data (`npm run db:reset`).

## How the numbers work

- **Stock is a ledger** (`stock_movement`): every movement moves N copies from one holder to another (`central`, `dham:<id>`, `devotee:<id>`, `sold`, `damaged`). Balances are always computed, never overwritten.
- Sales reduce stock **only when a Manager approves** a report. Until then they show as "being reviewed".
- Money is stored in **paise** (integers). Collected comes from daily reports; submitted from money submissions; entries a Manager marks as not matching stop counting as submitted.
- Managers only ever see their own Dham (enforced server-side in every query and action).

## Tested

An end-to-end browser run covers: wrong password, admin tour, receive 500 copies, assign to Dham, over-allocation error, add devotee, price change, manager assigns books, devotee submits sales on a phone-sized screen (with over-quantity validation and auto totals), partial UPI money submission (UTR required), manager correction-reason validation, approval, money confirmation, daily closing, role access restrictions, and loading every page for every role with no errors.
