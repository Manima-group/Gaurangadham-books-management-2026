# Payment Modes (Cash / UPI / Split) & Settlement

## Where
- **Daily sales report**: "How was the money received?" Cash · UPI · Both. Stored as `payment_mode`, `cash_paise`, `upi_paise` on `daily_report`. Reports from before this change have `payment_mode = null` ("Not recorded").
- **Submit Money**: Cash · UPI · Both · Bank. UPI/bank reference is now **optional**. Split stores both parts.
- **Shared Book Stall Quick Sell**: Cash · UPI · Both per sale.
- **Reports**: report detail shows "Received as"; My Reports shows the split.

## Rules
- All money is integer paise. Split: `cash + upi = total` exactly, both parts > 0 (server-side; the form shows the running sum).
- **Collector ≠ owner.** At stalls the person who received the money (`stall_sale.recipient_id`) is recorded separately from whose books were sold (attributed at closing). Stall money counts in the recipient's "collected" balance; they hand it over with Submit Money → "For a Shared Book Stall?".
- **No double-posting.** Submit Money carries a per-form `client_key` (unique per devotee); a repeated tap or an offline replay returns "Already submitted" and saves nothing. Quick Sell uses a unique `(stall_id, client_key)`. Both are also serialized with advisory locks.

## Stall settlement
After the closing is posted the stall is **Money to hand over**. When every recipient's *received* (confirmed by a Sevak) hand-overs tagged with the stall cover what they received there, the stall closes automatically (also a "Check if settled" button).

## Known limitation
Dham-level money totals add stall money by the recipient's Dham. Distribution Drive (campaign) filters do not include stall money (stalls have no drive).
