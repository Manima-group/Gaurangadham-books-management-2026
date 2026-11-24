# Four Features — Audit (before implementation)

Branch: `feature/four-features` (from `main`). Stack: Next.js 15 App Router + Server Actions, Drizzle/Postgres (Neon in production), Better Auth.

## What existed
| Area | Existing behaviour | Gap vs. master prompt V3 |
|---|---|---|
| Accounts | Sevaks create every account (phone → synthetic email, password). No self-signup. | No QR self-registration, approval queue, or permission toggles. |
| Roles | `admin` (Chakra Sevak), `manager` (Sector Sevak = Dham Manager), `devotee`, `contact` (outreach only). Chakra comes from the existing hierarchy. | None — kept as is. No new role. |
| Sector | No sector table; a Sector = the Sector Sevak's scope of a Dham. | Shown as "Sector of <Sevak names>". |
| Payments | `daily_report.collected_paise` only. `money_submission.method` cash/upi/bank, UPI/bank reference **required**. | No payment mode on sales; no split; reference must be optional; no idempotency key. |
| Stock | Double-entry `stock_movement` ledger with holders, advisory locks, transfer reservations. | No source/lot on any movement. |
| Group selling | None. | Shared Book Stall entirely new. |

## Design decisions
- **Additive schema only.** New columns are nullable or have defaults that preserve today's behaviour (existing devotees: `approval_status='approved'`, `can_distribute_books=true`).
- **Legacy stock = Unknown.** Existing movements keep `lot_id = null`, reported as "Unknown / legacy". Nothing is guessed.
- **Stall contributions are reservations, not transfers.** Nothing moves in the ledger until the closing is approved.
- **Authorization in the server.** `requireApproved()` / `requireUser()` check approval and the Book Distribution flag on every page and action; session data is read from the DB on every request, so toggles apply to live sessions.
- **UI unchanged in style.** Same tokens (brand #f26b1d, ink/navy, Inter + Plus Jakarta Sans), same `PageHeader`/`Card`/`Field`/`Badge`/`ActionForm` components and `field-input`/`btn-*` classes. See `shared-stall-ui-baseline.md`.
