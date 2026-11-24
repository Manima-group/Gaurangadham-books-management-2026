import "server-only";
import { sql } from "drizzle-orm";
import { schema } from "@/db";
import type { Exec } from "./stock";

/**
 * Stock source lots — External Central / Temple Store — carried on every ledger movement.
 *
 * Policy (deterministic FIFO, documented in docs/stock-source-lot-accounting.md):
 *  - A receipt creates a lot; its movement carries lot_id.
 *  - Any movement OUT of a real stock holder (central, dham:*, devotee:*, transit:*) is split across
 *    that holder's lots, oldest first. Stock from before lots existed (lot_id null = "Unknown / legacy")
 *    counts as the oldest. Totals per holder/book never change — only the lot labels are added.
 *  - Corrections copy the lot of the movement they reverse.
 * This is bookkeeping allocation of identical copies, not physical identification of a copy.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = any;
export type MovementRow = typeof schema.stockMovement.$inferInsert;

export const SOURCE_LABEL = { external_central: "External Central", temple_store: "Temple Store", unknown: "Unknown / legacy" } as const;
export type Source = keyof typeof SOURCE_LABEL;
export const SOURCES = ["external_central", "temple_store"] as const;

const LOT_HOLDER = /^(central|dham:\d+|devotee:.+|transit:\d+)$/;

/** Balance per lot (null = legacy) of one holder for some books, oldest lot first. */
async function lotBalances(exec: Exec, holder: string, bookIds: number[]) {
  if (!bookIds.length) return new Map<number, { lot: number | null; qty: number }[]>();
  const r = (await exec.execute(sql`
    select m.book_id, m.lot_id, sum(case when m.to_holder = ${holder} then m.qty else -m.qty end)::int as qty
    from stock_movement m
    where (m.to_holder = ${holder} or m.from_holder = ${holder})
      and m.book_id in (${sql.join(bookIds.map((b) => sql`${b}`), sql`, `)})
    group by m.book_id, m.lot_id
    having sum(case when m.to_holder = ${holder} then m.qty else -m.qty end) <> 0
    order by m.book_id, m.lot_id nulls first`)) as unknown as { book_id: number; lot_id: number | null; qty: number }[];
  const out = new Map<number, { lot: number | null; qty: number }[]>();
  for (const x of r) {
    const k = Number(x.book_id);
    if (!out.has(k)) out.set(k, []);
    out.get(k)!.push({ lot: x.lot_id == null ? null : Number(x.lot_id), qty: Number(x.qty) });
  }
  return out;
}

/**
 * Insert ledger movements, splitting each one that leaves a real stock holder across its source lots (FIFO).
 * Rows that already carry lotId (receipts, corrections) are kept as they are.
 * Callers must already hold the stock locks (lockHolders) and have checked quantities.
 * Returns the inserted ids in order.
 */
export async function insertMovements(tx: Tx, rows: MovementRow[]): Promise<number[]> {
  if (!rows.length) return [];
  // Remaining lot balances, per holder|book, consumed as we go (several rows can take from the same place).
  const cache = new Map<string, { lot: number | null; qty: number }[]>();
  const need = new Map<string, Set<number>>();
  for (const r of rows) {
    if (r.lotId !== undefined && r.lotId !== null) continue;
    if (!LOT_HOLDER.test(r.fromHolder)) continue;
    if (!need.has(r.fromHolder)) need.set(r.fromHolder, new Set());
    need.get(r.fromHolder)!.add(r.bookId);
  }
  for (const [holder, books] of need) {
    const bal = await lotBalances(tx, holder, [...books]);
    for (const b of books) cache.set(`${holder}|${b}`, (bal.get(b) ?? []).filter((x) => x.qty > 0));
  }
  const out: MovementRow[] = [];
  for (const r of rows) {
    const key = `${r.fromHolder}|${r.bookId}`;
    const lots = r.lotId == null && LOT_HOLDER.test(r.fromHolder) ? cache.get(key) : undefined;
    if (!lots) {
      out.push(r);
      continue;
    }
    let left = r.qty;
    for (const l of lots) {
      if (!left) break;
      if (l.qty <= 0) continue;
      const take = Math.min(l.qty, left);
      out.push({ ...r, qty: take, lotId: l.lot });
      l.qty -= take;
      left -= take;
    }
    // Should not happen after the caller's stock check; keep the movement whole rather than lose copies.
    if (left > 0) out.push({ ...r, qty: left, lotId: null });
  }
  const ids = (await tx.insert(schema.stockMovement).values(out).returning({ id: schema.stockMovement.id })) as { id: number }[];
  return ids.map((x) => x.id);
}

/** Create a lot for a receipt. */
export async function createLot(tx: Tx, v: { bookId: number; source: Source; qty: number; into: string; reference?: string | null; by: string }) {
  const [l] = await tx
    .insert(schema.stockLot)
    .values({ bookId: v.bookId, source: v.source, qtyReceived: v.qty, receivedInto: v.into, reference: v.reference ?? null, createdBy: v.by })
    .returning({ id: schema.stockLot.id });
  return l.id as number;
}

export const lotCode = (id: number | null) => (id == null ? "Legacy" : `LOT-${String(id).padStart(5, "0")}`);
