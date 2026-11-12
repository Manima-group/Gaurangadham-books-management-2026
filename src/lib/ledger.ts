import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { schema } from "@/db";
import { H, holderStock, lockHolders, type Exec } from "./stock";

/* A drizzle transaction (kept loose so both db.transaction tx types fit). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = any;

type Line = typeof schema.dailyReportLine.$inferSelect;
type Report = typeof schema.dailyReport.$inferSelect;

/** Turn an approved report's lines into stock movements (one per book per kind). */
export async function postReport(tx: Tx, r: Report, lines: Line[], actorId: string) {
  const per = new Map<number, { sold: number; returned: number; damaged: number }>();
  for (const l of lines) {
    const p = per.get(l.bookId) ?? { sold: 0, returned: 0, damaged: 0 };
    p.sold += l.soldQty;
    p.returned += l.returnedQty;
    p.damaged += l.damagedQty;
    per.set(l.bookId, p);
  }
  const base = {
    fromHolder: H.devotee(r.devoteeId),
    dhamId: r.dhamId,
    devoteeId: r.devoteeId,
    campaignId: r.campaignId,
    reportId: r.id,
    movementDate: r.reportDate,
    createdBy: actorId,
  };
  const moves = [];
  for (const [bookId, p] of per) {
    if (p.sold) moves.push({ ...base, bookId, kind: "sold" as const, qty: p.sold, toHolder: "sold" });
    if (p.returned) moves.push({ ...base, bookId, kind: "returned" as const, qty: p.returned, toHolder: H.dham(r.dhamId) });
    if (p.damaged) moves.push({ ...base, bookId, kind: "damaged" as const, qty: p.damaged, toHolder: "damaged" });
  }
  if (moves.length) await tx.insert(schema.stockMovement).values(moves);
}

/** Does the devotee still hold enough copies for these lines? */
export async function holdsEnough(tx: Exec, devoteeId: string, lines: Line[]) {
  const hold = await holderStock(H.devotee(devoteeId), tx);
  const need = new Map<number, number>();
  for (const l of lines) need.set(l.bookId, (need.get(l.bookId) ?? 0) + l.soldQty + l.returnedQty + l.damagedQty);
  return [...need].every(([b, q]) => q <= (hold.get(b) ?? 0));
}

const STOCK_HOLDER = /^(central|dham:\d+|devotee:.+)$/;

/**
 * Undo movements by adding "correction" movements that reverse them (the ledger is never edited).
 * Each correction carries the original's date, so day totals and closings stay consistent.
 * Returns an error message when a holder no longer has the copies to give back.
 */
export async function reverseMovements(tx: Tx, ids: number[], actorId: string, note: string): Promise<string | null> {
  if (!ids.length) return null;
  const moves = await tx
    .select()
    .from(schema.stockMovement)
    .where(and(inArray(schema.stockMovement.id, ids), isNull(schema.stockMovement.reversedBy)));
  if (!moves.length) return null;
  // Lock every real stock place involved, then check the ones that must give copies back.
  await lockHolders(tx, moves.flatMap((m: typeof schema.stockMovement.$inferSelect) => [m.fromHolder, m.toHolder]).filter((h: string) => STOCK_HOLDER.test(h)));
  const need = new Map<string, Map<number, number>>();
  for (const m of moves) {
    if (!STOCK_HOLDER.test(m.toHolder)) continue; // sold / damaged / external can always "give back"
    const byBook = need.get(m.toHolder) ?? new Map<number, number>();
    byBook.set(m.bookId, (byBook.get(m.bookId) ?? 0) + m.qty);
    need.set(m.toHolder, byBook);
  }
  for (const [holder, byBook] of need) {
    const have = await holderStock(holder, tx);
    for (const [bookId, q] of byBook) {
      if ((have.get(bookId) ?? 0) < q) {
        const who = holder === "central" ? "The Central Store" : holder.startsWith("dham:") ? "The Dham store" : "The devotee";
        return `${who} no longer has those copies (they were already given out or sold), so this can't be undone.`;
      }
    }
  }
  for (const m of moves) {
    const [c] = await tx
      .insert(schema.stockMovement)
      .values({
        kind: "correction",
        bookId: m.bookId,
        qty: m.qty,
        fromHolder: m.toHolder,
        toHolder: m.fromHolder,
        dhamId: m.dhamId,
        devoteeId: m.devoteeId,
        campaignId: m.campaignId,
        reportId: m.reportId,
        movementDate: m.movementDate,
        note: `${note} (undo of #${m.id})`,
        createdBy: actorId,
      })
      .returning({ id: schema.stockMovement.id });
    await tx.update(schema.stockMovement).set({ reversedBy: c.id }).where(eq(schema.stockMovement.id, m.id));
  }
  return null;
}

/** Remove a report with its places and lines; reverses its stock first if it was approved. */
export async function deleteReportTx(tx: Tx, r: Report, actorId: string): Promise<string | null> {
  await lockHolders(tx, [H.devotee(r.devoteeId)]);
  if (r.status === "approved") {
    const ids = (
      await tx
        .select({ id: schema.stockMovement.id })
        .from(schema.stockMovement)
        .where(and(eq(schema.stockMovement.reportId, r.id), isNull(schema.stockMovement.reversedBy), sql`kind <> 'correction'`))
    ).map((x: { id: number }) => x.id);
    const err = await reverseMovements(tx, ids, actorId, `Report of ${r.reportDate} deleted`);
    if (err) return err;
  }
  await tx.delete(schema.dailyReportLine).where(eq(schema.dailyReportLine.reportId, r.id));
  await tx.delete(schema.dailyReportVenue).where(eq(schema.dailyReportVenue.reportId, r.id));
  await tx.delete(schema.dailyReport).where(eq(schema.dailyReport.id, r.id));
  return null;
}
