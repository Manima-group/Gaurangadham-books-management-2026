# Stock Source Lot Accounting

## Sources
`EXTERNAL_CENTRAL` (books from the central/external supplier) and `TEMPLE_STORE`. Every receipt (Receive Books form and the Excel book import) must choose one; it creates a `stock_lot` and the receipt movement carries `lot_id`.

## Legacy
All stock that existed before this change has `lot_id = null` and is reported as **Unknown / legacy**. It is never re-labelled or guessed.

## Lineage (FIFO)
`insertMovements()` (`src/lib/lots.ts`) is now the only way movements are written. Any movement leaving a real holder (central, Dham store, devotee, transit) is split across that holder's lot balances, oldest first; legacy (null) counts as oldest. Totals per holder/book never change — only labels are added. Corrections copy the lot of the movement they reverse. Applies to assign, take-back, transfers (send/receive/return/loss), sales/returns/damage on report approval, and stall postings.

This is bookkeeping allocation of identical copies, not physical identification of a copy.

## Visibility
- **Devotees never see source data** — not in pages, props, exports or error messages (e2e checks the HTML of devotee pages for any source/lot text).
- Sector Sevak: `/stock/sources` for their Dham store and its devotees. Chakra Sevak: everything, or one Dham. Filters: Dham, source, dates. Shows copies in hand by source and place, and received/sold/damaged/moved per book.
- Stall page "By stock source" table is shown only to Sevaks.
