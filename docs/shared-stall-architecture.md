# Shared Book Stall — Architecture

## Tables (all new)
`book_stall`, `stall_participant`, `stall_contribution`, `stall_sale`, `stall_sale_line`, `stall_count`, `stall_allocation`, `stall_transfer_line`, `stall_confirmation`, `stall_approval`, `stall_event`. Ledger additions: `stock_movement.stall_id`, kind `stall_transfer`.

## Lifecycle
`draft` → `active` → `closing` (⇄ `disputed`) → `pending_approval` → `pending_settlement` → `closed`; `cancelled` only before closing and with no sales. (READY is the draft state with confirmed contributions; opening requires at least one.)

## Who
Created by an approved devotee with Book Distribution ON, or a Sector Sevak; the creator is the coordinator. Same-Dham (invite from own Dham list) or multi-Dham (invite by exact mobile number). Invitees accept/decline; only people with Book Distribution can join. Visible to participants, Sevaks of involved Dhams, Chakra Sevaks.

## Contributions = reservations
An owner adds their own free copies (holding − reported-not-approved − reserved); the coordinator may *propose* copies for someone, which that owner confirms. Confirmed copies of open stalls are counted in `reservations()/reservedFor()` and in the daily-sales check, so they cannot be sold, given back, or transferred elsewhere. Nothing moves in the ledger.

## Quick Sell
Any participant sells by title/qty with Cash/UPI/Split, no owner selection. Per stall advisory lock (`stall:<id>`) + remaining check prevent overselling under concurrency; `(stall_id, client_key)` makes replays idempotent. Undo = a new opposite sale (`reversal_of`), original kept.

## Closing (`src/lib/stall-math.ts`, unit tested)
Per title: C contributed, S net sold, R counted, L = C − S − R (≥ 0, note required if > 0).
- Default take-home = R split by contribution, largest remainder (ties → earlier owner). Loss split the same way.
- Coordinator can edit take-home per owner (must sum to R). Taking home more than you contributed (after loss) pulls copies from owners with spare copies, in proportion → `stall_transfer_line`, a real ownership transfer.
- Attributed sold = contributed − loss − own return − transfer out. Σ = S always.
- Example: 15/5/5, S=10 → returns 9/3/3, sold 6/2/2. Edited 11/2/2 → sold 4/3/3.
- Every change creates a new `allocation_version`; earlier confirmations stop counting.

## Approval & posting
All owners confirm (any dispute → `disputed`). Then the Sector Sevak of every participating Dham (or a Chakra Sevak) approves; a Sevak who is an owner approves their Dham by confirming. On the last approval, in one transaction with holder locks: `sold` and `damaged` movements per owner, `stall_transfer` owner→owner, all with `stall_id`, lots FIFO.

## Settlement
See `payment-modes-and-settlement.md`. Attributed sales (whose books) and payment custody (who holds money) are reported separately on the stall page.
