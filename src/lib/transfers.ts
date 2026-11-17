import "server-only";
import { and, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { allHoldings, holderStock, type Exec } from "./stock";
import type { AppUser } from "./session";

/**
 * Books Transfer rules shared by pages, actions and reports.
 *
 * Holders are the stock-ledger holders: `dham:<id>` (a Dham shelf) or `devotee:<userId>`.
 * Reservation: copies approved but not yet dispatched stay in the holder's physical stock
 * but are not *available* to anything else (other transfers, giving books out, taking back).
 */

export type Transfer = typeof schema.dhamTransfer.$inferSelect;
export type TransferLine = typeof schema.dhamTransferLine.$inferSelect;

export const ref = (id: number) => `BT-${String(id).padStart(5, "0")}`;
export const fromHolderOf = (t: Pick<Transfer, "fromHolder" | "fromDhamId">) => t.fromHolder ?? `dham:${t.fromDhamId}`;
export const toHolderOf = (t: Pick<Transfer, "toHolder" | "toDhamId">) => t.toHolder ?? `dham:${t.toDhamId}`;
export const isDevoteeHolder = (h: string) => h.startsWith("devotee:");
export const holderUserId = (h: string) => (isDevoteeHolder(h) ? h.slice(8) : null);

/** Statuses in which approved copies are reserved at the source. */
export const RESERVING = ["approved", "accepted"] as const;
/** Statuses with copies on the way (dispatched, not fully accounted for). */
export const IN_TRANSIT = ["sent", "partially_received", "disputed"] as const;
export const OPEN = ["requested", "approved", "accepted", ...IN_TRANSIT] as const;

/** Approved quantity for a line (older rows kept the approval in sent_qty). */
export const approvedOf = (l: Pick<TransferLine, "approvedQty" | "sentQty">) => l.approvedQty ?? l.sentQty ?? 0;
export const dispatchedOf = (t: Pick<Transfer, "status">, l: Pick<TransferLine, "sentQty">) =>
  ["sent", "partially_received", "disputed", "received", "completed"].includes(t.status) ? (l.sentQty ?? 0) : 0;
/** Copies still on the way for a line: dispatched − received − returned − written off. */
export const remainingOf = (t: Pick<Transfer, "status">, l: TransferLine) =>
  t.status === "received" ? 0 : Math.max(dispatchedOf(t, l) - l.receivedQty - l.returnedQty - l.lostQty, 0);

/** Copies reserved per holder per book by approved, not yet dispatched transfers. */
export async function reservations(exec: Exec = db) {
  const r = (await exec.execute(sql`
    select coalesce(t.from_holder, 'dham:' || t.from_dham_id) as holder, l.book_id, sum(coalesce(l.approved_qty, l.sent_qty, 0))::int as qty
    from dham_transfer t join dham_transfer_line l on l.transfer_id = t.id
    where t.status in ('approved','accepted')
    group by 1, 2 having sum(coalesce(l.approved_qty, l.sent_qty, 0)) > 0`)) as unknown as { holder: string; book_id: number; qty: number }[];
  const out = new Map<string, Map<number, number>>();
  for (const x of r) {
    if (!out.has(x.holder)) out.set(x.holder, new Map());
    out.get(x.holder)!.set(Number(x.book_id), Number(x.qty));
  }
  return out;
}

/** Physical stock minus reserved copies = what can still be given, sent or transferred. */
export async function availableFor(holder: string, exec: Exec = db, exceptTransferId?: number) {
  const [stock, res] = await Promise.all([holderStock(holder, exec), reservedFor(holder, exec, exceptTransferId)]);
  const out = new Map<number, number>();
  for (const [b, q] of stock) out.set(b, q - (res.get(b) ?? 0));
  return out;
}

export async function reservedFor(holder: string, exec: Exec = db, exceptTransferId?: number) {
  const r = (await exec.execute(sql`
    select l.book_id, sum(coalesce(l.approved_qty, l.sent_qty, 0))::int as qty
    from dham_transfer t join dham_transfer_line l on l.transfer_id = t.id
    where t.status in ('approved','accepted') and coalesce(t.from_holder, 'dham:' || t.from_dham_id) = ${holder}
      ${exceptTransferId ? sql`and t.id <> ${exceptTransferId}` : sql``}
    group by l.book_id`)) as unknown as { book_id: number; qty: number }[];
  return new Map(r.map((x) => [Number(x.book_id), Number(x.qty)]));
}

/* ---------------- Who may do what ---------------- */

/** Approves / rejects / assigns the sender / reconciles: Sector Sevak of the source Dham, or a Chakra Sevak. */
export const isSourceManager = (u: AppUser, t: Transfer) => u.role === "admin" || (u.role === "manager" && u.dhamId === t.fromDhamId);
export const isDestManager = (u: AppUser, t: Transfer) => u.role === "admin" || (u.role === "manager" && u.dhamId === t.toDhamId);

/** Prepares and dispatches: the assigned sender, the source devotee, or (Dham shelf without a sender) its Sector Sevak. */
export function canSend(u: AppUser, t: Transfer) {
  const src = fromHolderOf(t);
  if (t.senderId) return u.id === t.senderId || isSourceManager(u, t);
  if (isDevoteeHolder(src)) return u.id === holderUserId(src) || isSourceManager(u, t);
  return isSourceManager(u, t);
}

/** Confirms receipt: the receiving devotee, or the Sector Sevak of the receiving Dham. */
export function canReceive(u: AppUser, t: Transfer) {
  const dst = toHolderOf(t);
  return (isDevoteeHolder(dst) && u.id === holderUserId(dst)) || isDestManager(u, t);
}

/** Withdraws before dispatch: whoever asked, or the receiving side's Sector Sevak. */
export const canCancel = (u: AppUser, t: Transfer) => u.id === t.requestedBy || isDestManager(u, t);

/** Who can see a transfer at all. */
export function canSee(u: AppUser, t: Transfer) {
  if (u.role === "admin") return true;
  if (u.role === "manager") return u.dhamId === t.fromDhamId || u.dhamId === t.toDhamId;
  if (u.role === "devotee")
    return t.requestedBy === u.id || t.senderId === u.id || fromHolderOf(t) === `devotee:${u.id}` || toHolderOf(t) === `devotee:${u.id}`;
  return false;
}

/** SQL filter for the transfers a user can see. */
export function visibleWhere(u: AppUser): SQL | undefined {
  const t = schema.dhamTransfer;
  if (u.role === "admin") return undefined;
  if (u.role === "manager") return or(eq(t.fromDhamId, u.dhamId ?? -1), eq(t.toDhamId, u.dhamId ?? -1));
  if (u.role === "devotee")
    return or(eq(t.requestedBy, u.id), eq(t.senderId, u.id), eq(t.fromHolder, `devotee:${u.id}`), eq(t.toHolder, `devotee:${u.id}`));
  return sql`false`;
}

/** Transfers waiting for this user's action (approve / accept & send / receive / reconcile). */
export function needsMe(u: AppUser, t: Transfer) {
  if (t.status === "requested") return isSourceManager(u, t) && u.role !== "admin";
  if (t.status === "approved" || t.status === "accepted") return canSend(u, t) && u.role !== "admin";
  if (IN_TRANSIT.includes(t.status as (typeof IN_TRANSIT)[number])) return canReceive(u, t) && u.role !== "admin";
  return false;
}

export async function listTransfers(u: AppUser, status?: string) {
  const t = schema.dhamTransfer;
  let rows = await db.select().from(t).where(visibleWhere(u)).orderBy(desc(t.requestedAt)).limit(500);
  if (status) rows = rows.filter((r) => r.status === status);
  const ids = rows.map((r) => r.id);
  const lines = ids.length ? await db.select().from(schema.dhamTransferLine).where(inArray(schema.dhamTransferLine.transferId, ids)) : [];
  return { rows, lines };
}

/** Names for holders: Dham shelves and devotees. */
export async function holderNames(holders: string[]) {
  const dhamIds = [...new Set(holders.filter((h) => h.startsWith("dham:")).map((h) => Number(h.slice(5))))];
  const userIds = [...new Set(holders.filter(isDevoteeHolder).map((h) => h.slice(8)))];
  const [dhams, users] = await Promise.all([
    dhamIds.length ? db.select({ id: schema.dham.id, name: schema.dham.name }).from(schema.dham).where(inArray(schema.dham.id, dhamIds)) : [],
    userIds.length ? db.select({ id: schema.user.id, name: schema.user.name, dhamId: schema.user.dhamId }).from(schema.user).where(inArray(schema.user.id, userIds)) : [],
  ]);
  const map = new Map<string, string>();
  for (const d of dhams) map.set(`dham:${d.id}`, `${d.name} (shelf)`);
  for (const x of users) map.set(`devotee:${x.id}`, x.name);
  return (h: string) => map.get(h) ?? (h.startsWith("dham:") ? "Dham" : "Devotee");
}

/** Every possible source with its *available* books (stock − reserved), for "Request Books". */
export async function sources() {
  const [h, res, books, dhams, people] = await Promise.all([
    allHoldings(),
    reservations(),
    db.select({ id: schema.book.id, title: schema.book.title, language: schema.book.language }).from(schema.book),
    db.select({ id: schema.dham.id, name: schema.dham.name }).from(schema.dham).where(eq(schema.dham.isActive, true)),
    db.select({ id: schema.user.id, name: schema.user.name, phone: schema.user.phone, dhamId: schema.user.dhamId, role: schema.user.role })
      .from(schema.user).where(and(eq(schema.user.isActive, true), inArray(schema.user.role, ["devotee", "manager"]))),
  ]);
  const bookMap = new Map(books.map((b) => [b.id, b]));
  const dhamName = new Map(dhams.map((d) => [d.id, d.name]));
  const person = new Map(people.map((p) => [p.id, p]));
  type Src = { holder: string; kind: "dham" | "devotee"; name: string; dhamId: number; dhamName: string; phone: string | null; books: { id: number; title: string; language: string; qty: number }[] };
  const out = new Map<string, Src>();
  for (const x of h) {
    if (x.holder.startsWith("transit:")) continue;
    const avail = x.qty - (res.get(x.holder)?.get(x.bookId) ?? 0);
    if (avail <= 0) continue;
    let s = out.get(x.holder);
    if (!s) {
      if (x.holder.startsWith("dham:")) {
        const id = Number(x.holder.slice(5));
        if (!dhamName.has(id)) continue;
        s = { holder: x.holder, kind: "dham", name: `${dhamName.get(id)} — shelf`, dhamId: id, dhamName: dhamName.get(id)!, phone: null, books: [] };
      } else {
        const p = person.get(x.holder.slice(8));
        if (!p || !p.dhamId || !dhamName.has(p.dhamId)) continue;
        s = { holder: x.holder, kind: "devotee", name: p.name, dhamId: p.dhamId, dhamName: dhamName.get(p.dhamId)!, phone: p.phone, books: [] };
      }
      out.set(x.holder, s);
    }
    const b = bookMap.get(x.bookId);
    if (b) s.books.push({ id: b.id, title: b.title, language: b.language, qty: avail });
  }
  for (const s of out.values()) s.books.sort((a, z) => a.title.localeCompare(z.title));
  return [...out.values()].sort((a, z) => a.dhamName.localeCompare(z.dhamName) || Number(a.kind === "devotee") - Number(z.kind === "devotee") || a.name.localeCompare(z.name));
}
