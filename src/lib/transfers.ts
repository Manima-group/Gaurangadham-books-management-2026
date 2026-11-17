import "server-only";
import { desc, eq, inArray, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { allHoldings } from "./stock";
import type { AppUser } from "./session";

/** Transfers this person can see: Chakra Sevak all; Sector Sevak those in or out of their Dham. */
export async function listTransfers(u: AppUser, status?: string) {
  const t = schema.dhamTransfer;
  const where = u.role === "admin" ? undefined : or(eq(t.fromDhamId, u.dhamId ?? -1), eq(t.toDhamId, u.dhamId ?? -1));
  let rows = await db.select().from(t).where(where).orderBy(desc(t.requestedAt)).limit(300);
  if (status) rows = rows.filter((r) => r.status === status);
  const ids = rows.map((r) => r.id);
  const lines = ids.length ? await db.select().from(schema.dhamTransferLine).where(inArray(schema.dhamTransferLine.transferId, ids)) : [];
  return { rows, lines };
}

/** Each Dham's shelf (only books it holds), for "ask which Dham" — the asking Dham itself is left out. */
export async function shelvesExcept(dhamId: number | null) {
  const [h, books, dhams] = await Promise.all([
    allHoldings(),
    db.select({ id: schema.book.id, title: schema.book.title, language: schema.book.language }).from(schema.book),
    db.select({ id: schema.dham.id, name: schema.dham.name }).from(schema.dham).orderBy(schema.dham.name),
  ]);
  return dhams
    .filter((d) => d.id !== dhamId)
    .map((d) => ({
      dhamId: d.id,
      dhamName: d.name,
      books: h
        .filter((x) => x.holder === `dham:${d.id}` && x.qty > 0)
        .map((x) => ({ ...books.find((b) => b.id === x.bookId)!, qty: x.qty }))
        .filter((b) => b.id)
        .sort((a, z) => a.title.localeCompare(z.title)),
    }));
}
