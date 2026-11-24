# Four Features — Deployment (needs owner approval)

**Nothing here has been run against production.**

1. Review/merge the PR only after approval.
2. Back up Neon (`npm run db:backup`) or create a Neon branch from production.
3. On the Neon branch first: `DATABASE_URL_UNPOOLED=<branch url> npx drizzle-kit push` and compare its SQL to `docs/four-features-migration.sql` (58 statements: 15 `CREATE TABLE`, `ADD COLUMN`s, indexes — no DROP/RENAME/ALTER TYPE).
4. Smoke-test the preview deployment against the branch.
5. Then run the same push on production (`db:push`) before or together with the deploy.
6. Optional: set `BETTER_AUTH_URL` to the public URL so QR links use the right host.

Rollback: the old code ignores the new columns/tables, **but it does not know about approval or the permission flags** — QR registrants who are pending/rejected, and devotees with Book Distribution off, would get normal devotee access on the old code. Before rolling back, mark them inactive:
`update "user" set is_active = false where role = 'devotee' and (approval_status <> 'approved' or not can_distribute_books);`
Open stalls' reserved copies are also not respected by old code. Do not drop the new tables/columns without a backup.

No new paid services, no SMS, no secrets added. New dependency: `qrcode` (MIT).
