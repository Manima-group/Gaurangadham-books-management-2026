/**
 * Proves checkpointed stock = full-history stock, before and after checkpoints,
 * including movements added afterwards with a date in the past.
 * Run: npx tsx --conditions=react-server tests/checkpoint.test.ts   (uses DATABASE_URL — run on a test DB)
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { createCheckpoint, devoteeStocksForDham, holderStock, scopeStock } from "@/lib/stock";

type R = { holder: string; book_id: number; qty: number };
const full = async () =>
  (await db.execute(sql`
    select h as holder, book_id, sum(d)::int as qty from (
      select to_holder h, book_id, qty d from stock_movement union all select from_holder, book_id, -qty from stock_movement
    ) x group by h, book_id having sum(d) <> 0`)) as unknown as R[];
const fullScope = async (dham: number | null) =>
  (await db.execute(sql`
    select book_id, sum(d)::int as qty from (
      select to_holder h, dham_id, book_id, qty d from stock_movement union all select from_holder, dham_id, book_id, -qty from stock_movement
    ) x where ${dham == null ? sql`(h like 'dham:%' or h like 'devotee:%' or h = 'central')` : sql`dham_id = ${dham} and (h like 'dham:%' or h like 'devotee:%')`}
    group by book_id`)) as unknown as { book_id: number; qty: number }[];

let failures = 0;
async function compare(label: string) {
  const truth = await full();
  const holders = [...new Set(truth.map((r) => r.holder))];
  for (const h of holders) {
    const got = await holderStock(h);
    for (const r of truth.filter((x) => x.holder === h))
      if ((got.get(Number(r.book_id)) ?? 0) !== Number(r.qty)) { failures++; console.log(`  ✗ ${label} ${h} book ${r.book_id}: ${got.get(Number(r.book_id))} vs ${r.qty}`); }
  }
  const dhams = (await db.execute(sql`select id from dham`)) as unknown as { id: number }[];
  for (const d of [null, ...dhams.map((x) => Number(x.id))]) {
    const t = await fullScope(d), g = await scopeStock(d);
    for (const r of t) if ((g.get(Number(r.book_id)) ?? 0) !== Number(r.qty)) { failures++; console.log(`  ✗ ${label} scope ${d} book ${r.book_id}`); }
    if (d != null) {
      const dev = await devoteeStocksForDham(d);
      for (const r of truth.filter((x) => x.holder.startsWith("devotee:"))) {
        const v = dev.get(r.holder.slice(8))?.get(Number(r.book_id));
        if (v !== undefined && v !== Number(r.qty)) { failures++; console.log(`  ✗ ${label} devotee ${r.holder}`); }
      }
    }
  }
  console.log(`${failures ? "✗" : "✓"} ${label}: ${holders.length} holders checked`);
}

(async () => {
  await compare("no checkpoint");
  console.log("  checkpoint:", await createCheckpoint());
  await compare("after checkpoint 1");
  // add movements after the checkpoint, one back-dated 10 days
  const [m] = (await db.execute(sql`select * from stock_movement where kind = 'assign_devotee' limit 1`)) as unknown as Record<string, unknown>[];
  await db.execute(sql`insert into stock_movement (kind, book_id, qty, from_holder, to_holder, dham_id, devotee_id, movement_date, created_by)
    values ('sold', ${m.book_id}, 1, ${m.to_holder}, 'sold', ${m.dham_id}, ${m.devotee_id}, (current_date - 10), 'test'),
           ('received', ${m.book_id}, 7, 'external', 'central', null, null, current_date, 'test')`);
  await compare("new movements after checkpoint");
  console.log("  checkpoint:", await createCheckpoint());
  await compare("after checkpoint 2");
  console.log("  checkpoint (nothing new):", await createCheckpoint());
  await db.execute(sql`delete from stock_movement where created_by = 'test'`);
  await db.execute(sql`delete from stock_checkpoint_balance; delete from stock_checkpoint`);
  console.log(failures ? `FAILED (${failures})` : "ALL CHECKPOINT TESTS PASSED");
  process.exit(failures ? 1 : 0);
})();
