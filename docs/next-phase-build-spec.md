# Next Phase — Build Specification

**Status: READY, NOT STARTED.** Build begins only when the owner says **"start build"**.
Base: `main@a71aef2` (after PR #17). Branch: `feature/next-phase`.
Plan agreed with the owner on 26 Nov 2026. Project doc: `claude/Next_Phase_Plan_Daily_Sales_Sankalp.md`.

## Ground rules (apply to every part)
- Extend the existing app; do not redesign. Reuse `PageHeader`, `Card`, `Field`, `Badge`, `Alert`, `StatCard`, `ActionForm`, `SubmitButton`, the `field-input` / `btn-*` / `data-table` classes, the brand and ink colours, and the Inter and Plus Jakarta Sans fonts.
- Authorization is enforced in server actions and pages, never only in the menu.
- Database changes are **additive only**: new tables and nullable or defaulted columns. Before merge, the owner gets the exact SQL to run in the Neon SQL Editor (see the Release steps at the end).
- Inventory only moves through `insertMovements` (FIFO lots), under holder locks.
- Integer book counts and integer paise.
- Every new feature gets e2e checks. All existing suites must stay green.
- No deploy, no production data changes, and no merge without the owner.

---

## Part 1 — Quick wins

### F1. Book size mandatory
- **Excel import** (`src/lib/book-import.ts`):
  - The Size column becomes `required: true`.
  - An empty or invalid size is a preview error ("Size must be Big or Small").
  - The sample sheet marks it required.
- **Single book form** (`src/app/(app)/books/forms.tsx`, `src/app/actions/setup.ts`): Size is a required radio with no default; the server rejects a missing size.
- **Existing books**: add a "Check book sizes" list for the Chakra Sevak (filter on Books), showing every book with its size and a one-click Big/Small change, so sizes defaulted to Small can be reviewed. No data is changed automatically.
- **Acceptance**: an import with a blank size fails in preview; creating a book without a size fails; existing books are unchanged.

### F2. Other Dhams' totals for Sector Sevaks
- `/distribution`: managers are no longer redirected to their own Dham. They see the Dham-wise table (reuse `dhamWise`) with **big, small and total books and rank only**. Money columns and devotee names are hidden for every Dham except their own.
- Clicking another Dham's row is not allowed for managers (their own row still opens `/distribution/[id]`).
- **Acceptance**: a manager sees all Dhams' book totals; the HTML has no ₹ amounts or devotee names for other Dhams; `/distribution/<other id>` is denied.

### F3. Daily sales without approval (per-Dham switch)
- **Schema**: `dham.sevak_checks_sales boolean not null default false`.
- **Switch**: on Dham settings, editable by that Dham's Sector Sevak and the Chakra Sevak, with an audit row in the activity log.
- **OFF (default)**: in `saveSalesReport`, a devotee's *submit* takes the existing self-approve path. Status `approved`, `postReport` runs in the same transaction, and `reviewedBy` is null with the note "Recorded directly". All existing checks stay: holdings, pending, stall reservations, the 7-day entry window and Book Distribution.
- **ON**: current flow unchanged (submitted, then the Sevak approves, corrects or rejects).
- **Money**: unchanged. Submit Money always waits for the Sevak to mark it received.
- **Sevak view**: `/reports` gets a "Today's reports" tab (read-only list) with **Correct** (opens F5 as Sevak) and **Remove** (existing delete with reversal).
- Wording changes: "Waiting for Sector Sevak" is not shown when the switch is OFF. The devotee sees "Recorded ✓ — your stock is updated."
- **Acceptance**:
  - With the switch OFF, a devotee's submit leaves the report approved and the stock reduced at once.
  - With it ON, the old flow works.
  - Over-selling is still blocked.
  - Money still waits for the Sevak.

### F4. "Not yet submitted today"
- Keep the existing lists (Sevak dashboard, `/pending`, Day Closing) exactly as they are.
- With the switch OFF, the "waiting for review" counts are zero by design. The "not submitted" list still shows.
- **Acceptance**: a devotee with no report today appears in the list in both switch states.

### F4b. Day Closing optional when the switch is OFF
- With the switch OFF there are no Day Closing reminders or warnings for that Dham, and nothing depends on closing. The page stays available.
- With the switch ON, Day Closing behaves as today.

---

## Part 2 — Edit and Sankalp

### F5. Editing a sent report
- **Edit window**:
  - Switch OFF: the devotee may edit their own report until **23:59 IST of the day after** the report date.
  - Switch ON: the devotee may edit until that Dham's **Day Closing** for the date. If the Dham never closes the day, edits end after 7 days.
  - After the window: only the Sector Sevak of that Dham or the Chakra Sevak can correct or remove.
- **Mechanics**, in one transaction with holder locks:
  1. Reverse the report's movements (existing `reverseMovements`).
  2. Validate the new lines against current holdings, pending and stall reservations.
  3. Post the new movements (`postReport`).
  4. Update the report and bump a `revision` counter.
- **Money guard**: the new collected amount must be at least the money already handed over for that devotee in total (the balance can't go negative). Otherwise: "You have already handed over more than this."
- **History**: new table `daily_report_revision` (report_id, revision, edited_by, edited_at, before jsonb, after jsonb, reason). The Sevak sees an "Edited" badge and the history on the report page.
- **Acceptance**:
  - A devotee can edit within the window, and stock reflects the new numbers.
  - The window closes at the right time (OFF: next midnight; ON: Day Closing).
  - An edit needing more books than held is refused.
  - The money guard works.
  - The history is recorded.
  - Sankalp and leaderboard totals update.

### F6. Sankalp per Distribution Drive
- **Schema**: new table `dham_sankalp` (campaign_id, dham_id, big_target int, small_target int, set_by, set_at, locked bool, unique(campaign_id, dham_id)) and `dham_sankalp_audit` (sankalp_id, actor_id, old jsonb, new jsonb, reason, created_at).
- **Who**:
  - Each Dham's Sector Sevak sets their own Dham's sankalp for a Drive. Drives limited to one Dham apply only to that Dham.
  - Editable until the Drive's start date. After that it is locked; only the Chakra Sevak can change it, with a required reason (audited).
- **Score**:
  - Points = small books + 2 × big books.
  - % achieved = achieved points ÷ sankalp points, using **approved** sales in the Drive's date range (same rules as `dhamWise`).
  - A Dham with no sankalp is listed as "No sankalp yet" and is not ranked.
- **Ranking**: by % achieved (ties: more total points, then more big books). Total points are shown alongside.
- **Badges**:
  - 🏆 Sankalp Leader: highest %.
  - ✅ Sankalp Purna: 100% or more.
  - 📚 Most big books: highest big count.
- **UI**:
  - Leaderboard card on the Drive page and the Dham-wise page: 🥇🥈🥉 for the top 3, a progress bar per Dham, and the line "Big x/y · Small x/y · N points". The viewer's own Dham is highlighted; the card stacks on mobile.
  - Sevak dashboard: their Dham's card plus "Set sankalp" while it is unlocked.
  - Devotee Home: one line, "<Dham> — 72% of sankalp · Rank 2 of 6", only while a Drive is active.
- **Privacy**: books only, no money, no devotee names. It follows the F2 rules.
- **Acceptance**:
  - A Sevak sets the sankalp; it locks at the start date.
  - Only the Chakra Sevak can change it afterwards, with a reason that is audited.
  - % and ranking are correct (unit test of the formula, with big = 2 points), and badges are assigned correctly.

---

## Part 3 — Supply routes and Central Store Sevak

### F7. Receipt rules
- Receive into **Central**: sources **External** (label renamed from "External Central"; stored value `external_central` unchanged) or **Temple Store**.
- Receive into a **Dham** (Sector Sevak): source **Temple Store only**. The External option is hidden, and the server rejects `external_central` for Dham receipts.
- The Excel import follows the same rule per destination.
- **Acceptance**: a Sevak can't record External into their Dham (form and replayed request); Central still accepts both.

### F8. Central Store Sevak permission
- **Schema**: `user.is_central_store_sevak boolean not null default false`.
- **Who grants**: only the Chakra Sevak, from the People page (Give / Remove), audited in `access_audit` (new permission value `central_store`).
- **Who can hold it**: a Sector Sevak **or any other approved person**. A person who is not a Sevak can be created by the Chakra Sevak as an account with only this permission. Their menu is Home, Central store and Profile; they have no Dham work.
- **It gives**: Receive into Central, Central stock (by source), Requests from Dhams, Send to Dham, Central activity log.
- **No approval for any send**, including to their own Dham. Everything is in the Central activity log, which the Chakra Sevak can see.
- A Central Store Sevak who is also a Sector Sevak keeps all Sevak work. Central stock and the Dham's stock are separate holders (`central` vs `dham:<id>`) and never mix.
- The Chakra Sevak keeps every Central capability.
- **Acceptance**:
  - The permission toggles on and off with an audit row.
  - Central pages and actions are denied without it, including direct requests.
  - A non-Sevak keeper sees only Central items.
  - Sending to their own Dham needs no approval.

### F9. Request, send and confirm (Central → Dham)
- **Schema**: new tables
  - `central_request` (dham_id, requested_by, status requested/partly_sent/sent/declined/cancelled, note, decline_reason, timestamps)
  - `central_request_line` (request_id, book_id, qty_requested)
  - `central_shipment` (request_id nullable, dham_id, sent_by, sent_at, status on_the_way/received/partly_received, received_by, received_at, note)
  - `central_shipment_line` (shipment_id, book_id, qty_sent, qty_received, qty_short, qty_damaged)
- **Flow**:
  1. The Dham's Sector Sevak requests books from Central (optional).
  2. The Central Store Sevak or Chakra Sevak sends: full, part, or declined with a reason. They can also send without a request.
  3. On send: movement `central` → `ctransit:<shipmentId>` (lots FIFO, under a Central lock, checking Central stock).
  4. The Dham's Sector Sevak confirms received: `ctransit` → `dham:<id>` for received copies. Short copies return to `central`; damaged copies go to `damaged`, with a note.
  5. Copies keep their lot, so the source stays External or Temple Store through Central.
- The existing direct "Assign to Dham" (instant) is replaced by this flow for new sends. Older history stays as it is.
- Holder pattern: add `ctransit:\d+` to `LOT_HOLDER` in `src/lib/lots.ts`, and to reports that list stock "on the way".
- **Notifications** (in-app):
  - Request created → Central Store Sevaks and the Chakra Sevak.
  - Sent or declined → the requesting Sevak.
  - Received → the sender.
- **Acceptance**:
  - Request → part send → confirm received with short/damaged leaves stock correct at Central, in transit and at the Dham.
  - Concurrent sends can't over-send Central stock.
  - A replayed send is not double-posted (client key).
  - Lots carry through.

### F10. Source view through Central
- Dham Stock Sources shows three rows: **Temple direct**, **Temple via Central**, **External via Central** (derived from lot source and movement path). Devotees still see totals only.
- **Acceptance**: after a Central → Dham shipment, the Dham's source view shows "via Central" counts; devotee pages contain no source data.

---

## Out of scope (decided 26 Nov 2026)
- A per-Dham supply switch (Central/Temple).
- Temple Store as a separately managed store with its own Sevak. Temple Store stays a source label, recorded by whoever receives the books.

## Database changes (all additive)

| Change | Part |
|---|---|
| `dham.sevak_checks_sales` boolean default false | F3 |
| `daily_report.revision` int default 0 + `daily_report_revision` table | F5 |
| `dham_sankalp`, `dham_sankalp_audit` tables | F6 |
| `user.is_central_store_sevak` boolean default false | F8 |
| `central_request`, `central_request_line`, `central_shipment`, `central_shipment_line` tables | F9 |
| `access_audit.permission` value `central_store`, `stock_movement.kind` values for central send/receive | F8/F9 (text enums, no DDL) |

## Tests to add
- `e2e/next_phase.py`, covering F1–F10 acceptance checks, including replayed direct requests for every server-side rule.
- Unit tests:
  - sankalp % and ranking
  - report edit window (IST boundaries)
  - shipment arithmetic (sent = received + short + damaged)
- Re-run every existing suite (`permissions`, `four_features`, `features`, `transfers`, `transfers_more`, `outreach`, `pdf`, `hierarchy`, `book_import`, `race`, `devotee_contacts`, `run.py`, unit tests), plus `tsc` and `next build`.

## Build order and estimate

| Part | Items | Days |
|---|---|---|
| 1 | F1, F2, F3, F4, F4b | ~2.5 |
| 2 | F5, F6 | ~4 |
| 3 | F7, F8, F9, F10 | ~4 |
| — | Regression and docs | ~1 |
| **Total** | | **~10–12 working days** |

Each part ends with green tests and a progress update to the owner. Everything ships as one PR, unless the owner asks for one PR per part.

## Release steps (owner)
1. Back up Neon (branch `backup-before-next-phase`).
2. Run the provided migration SQL in the Neon SQL Editor (production branch, database `gaurangadham`), once. It runs in a transaction.
3. Merge the PR (Vercel deploys).
4. Smoke test:
   - a devotee report is recorded at once
   - edit within the window
   - set a sankalp
   - Central request → send → receive
