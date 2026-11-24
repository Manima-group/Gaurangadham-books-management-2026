# Four Features — Testing

## Automated
| Suite | Command | Covers |
|---|---|---|
| Four features e2e | `npm run db:reset && python3 e2e/four_features.py` | QR invite/PDF/landing/sign-up/pending denial/duplicates/approval/toggles/audit/revoke; payment split & optional reference & replay idempotency; source picker, source report, no source leakage to devotees; full stall (15/5/5 → 9/3/3 → 11/2/2 → 4/3/3), reservations, concurrency, undo, replay, approval, posting, settlement. |
| Stall math unit | `npx tsx tests/stall-math.test.ts` | Largest remainder, worked examples, transfers, loss, conservation over all S/R combinations. |
| Regression e2e | `features, transfers, transfers_more, outreach, pdf, hierarchy, book_import, race, devotee_contacts, run.py` (each after `npm run db:reset`) | Existing behaviour. |
| Checkpoint unit | `npx tsx --conditions=react-server tests/checkpoint.test.ts` | Ledger checkpoints. |

Run against local Postgres and `npm start` only — never production.

## Migration validation
1. Fresh DB from the **pre-feature** schema (`main`) + seed.
2. Checksum every row of every table (old columns only).
3. `drizzle-kit push` with the new schema; capture SQL (`docs/four-features-migration.sql`).
4. Re-checksum: identical for all 26 existing tables. Defaults: existing users `approved / distribution on / dham-sales off`; existing movements `lot_id null`; reports `payment_mode null`.
5. Second push: "No changes detected".
