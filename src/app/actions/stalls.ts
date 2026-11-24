"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { fail, fromZod, ok, type ActionState } from "@/lib/action";
import { requireApproved, type AppUser } from "@/lib/session";
import { logActivity, notify, dhamManagers } from "@/lib/activity";
import { H, lockHolders, lockKey, holderStock, pendingReportedQty } from "@/lib/stock";
import { availableFor } from "@/lib/transfers";
import { insertMovements } from "@/lib/lots";
import { inr, num, toPaise, todayIST } from "@/lib/format";
import { allocateTitle } from "@/lib/stall-math";
import { canCreateStall, settleIfDone, logStall, participatingDhams, ref, stallAccess, stallStock, type Stall } from "@/lib/stalls";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const ROLES = ["devotee", "manager", "admin"] as const;
const path = (id: number) => `/stalls/${id}`;
const refresh = (id: number) => {
  revalidatePath("/stalls");
  revalidatePath(path(id));
};

async function loadStall(id: number, tx: Tx | typeof db = db) {
  const [s] = await tx.select().from(schema.bookStall).where(eq(schema.bookStall.id, id));
  return s;
}

/** Lock the stall row for the rest of the transaction, then read it fresh. */
async function lockStall(tx: Tx, id: number) {
  await lockKey(tx, `stall:${id}`);
  return loadStall(id, tx);
}

async function isAcceptedParticipant(tx: Tx | typeof db, stallId: number, userId: string) {
  const [p] = await tx.select().from(schema.stallParticipant)
    .where(and(eq(schema.stallParticipant.stallId, stallId), eq(schema.stallParticipant.userId, userId), eq(schema.stallParticipant.status, "accepted")));
  return !!p;
}

/* ---------------- Create ---------------- */

const CreateSchema = z.object({
  name: z.string().trim().min(3, "Please give the stall a name.").max(100, "Name is too long."),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Please choose the date."),
  location: z.string().trim().max(160).optional(),
  description: z.string().trim().max(500).optional(),
  mode: z.enum(["same_dham", "multi_dham"]),
});

export async function createStall(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireApproved(...ROLES);
  if (!canCreateStall(u)) return fail("Only devotees with Book Distribution turned on, or a Sector Sevak, can create a stall.");
  const p = CreateSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return fromZod(p.error);
  const id = await db.transaction(async (tx) => {
    const [s] = await tx.insert(schema.bookStall).values({
      name: p.data.name, eventDate: p.data.eventDate, location: p.data.location || null, description: p.data.description || null,
      organizingDhamId: u.dhamId!, mode: p.data.mode, coordinatorId: u.id, createdBy: u.id,
    }).returning({ id: schema.bookStall.id });
    // The creator is the stall coordinator and its first participant.
    await tx.insert(schema.stallParticipant).values({ stallId: s.id, userId: u.id, dhamId: u.dhamId!, status: "accepted", invitedBy: u.id, respondedAt: new Date() });
    await logStall(tx, s.id, u.id, "created", { mode: p.data.mode });
    return s.id;
  });
  await logActivity(u.id, `${u.name} created the Shared Book Stall "${p.data.name}" (${ref(id)})`, { dhamId: u.dhamId });
  redirect(path(id));
}

/* ---------------- Invitations ---------------- */

export async function inviteToStall(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireApproved(...ROLES);
  const id = Number(fd.get("stallId"));
  const s = await loadStall(id);
  if (!s || s.coordinatorId !== u.id) return fail("Only the stall coordinator can invite.");
  if (s.status !== "draft" && s.status !== "active") return fail("Invitations are closed for this stall.");
  // Same-Dham: pick from your Dham's list. Multi-Dham: the exact mobile number of the person (no browsing other Dhams).
  let target: typeof schema.user.$inferSelect | undefined;
  const userId = String(fd.get("userId") || "");
  const phone = String(fd.get("phone") || "").replace(/\D/g, "").replace(/^(91|0)(?=\d{10}$)/, "");
  if (userId) [target] = await db.select().from(schema.user).where(eq(schema.user.id, userId));
  else if (/^[6-9]\d{9}$/.test(phone)) [target] = await db.select().from(schema.user).where(eq(schema.user.phone, phone));
  else return fail("Please choose a devotee, or enter a 10-digit mobile number.", undefined, { phone: "Enter a mobile number" });
  if (!target || !target.isActive) return fail("No active person found with that mobile number.");
  if (s.mode === "same_dham" && target.dhamId !== s.organizingDhamId) return fail("This stall is for one Dham only. Change it to multi-Dham to invite from other Dhams.");
  const eligible = target.approvalStatus === "approved" && (target.role === "manager" || (target.role === "devotee" && target.canDistributeBooks));
  if (!eligible) return fail(`${target.name} cannot join: Book Distribution is not turned on for them.`);
  if (!target.dhamId) return fail(`${target.name} is not linked to a Dham.`);
  const [existing] = await db.select().from(schema.stallParticipant).where(and(eq(schema.stallParticipant.stallId, id), eq(schema.stallParticipant.userId, target.id)));
  if (existing && (existing.status === "accepted" || existing.status === "invited")) return ok(`${target.name} is already ${existing.status === "accepted" ? "in" : "invited to"} this stall.`);
  if (existing) await db.update(schema.stallParticipant).set({ status: "invited", invitedBy: u.id, respondedAt: null }).where(eq(schema.stallParticipant.id, existing.id));
  else await db.insert(schema.stallParticipant).values({ stallId: id, userId: target.id, dhamId: target.dhamId, status: "invited", invitedBy: u.id }).onConflictDoNothing();
  await logStall(db as unknown as Tx, id, u.id, "invited", { userId: target.id });
  await notify([target.id], `Invitation: ${s.name}`, `${u.name} invited you to a Shared Book Stall. Please accept or decline.`, path(id));
  refresh(id);
  return ok(`${target.name} invited.`, "They see the invitation in their notifications.");
}

export async function respondInvite(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireApproved(...ROLES);
  const id = Number(fd.get("stallId"));
  const accept = fd.get("decision") === "accept";
  const s = await loadStall(id);
  if (!s) return fail("Stall not found.");
  if (accept && !u.canDistribute) return fail("Book Distribution is not turned on for you.");
  const done = await db.update(schema.stallParticipant).set({ status: accept ? "accepted" : "declined", respondedAt: new Date() })
    .where(and(eq(schema.stallParticipant.stallId, id), eq(schema.stallParticipant.userId, u.id), eq(schema.stallParticipant.status, "invited")))
    .returning({ id: schema.stallParticipant.id });
  if (!done.length) return fail("There is no open invitation for you here.");
  await logStall(db as unknown as Tx, id, u.id, accept ? "joined" : "declined");
  await notify([s.coordinatorId], `${u.name} ${accept ? "joined" : "declined"} ${s.name}`, undefined, path(id));
  refresh(id);
  return ok(accept ? "You joined the stall 🙏" : "Invitation declined.");
}

/* ---------------- Contributions (reserve, not transfer) ---------------- */

/** Copies this owner can still put on a stall: holding − reported-not-approved − reserved (transfers + stalls). */
async function freeCopies(tx: Tx, ownerId: string) {
  const [avail, pending] = await Promise.all([availableFor(H.devotee(ownerId), tx), pendingReportedQty(ownerId, undefined, tx)]);
  const out = new Map<number, number>();
  for (const [b, q] of avail) out.set(b, q - (pending.get(b) ?? 0));
  return out;
}

export async function contribute(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireApproved(...ROLES);
  const id = Number(fd.get("stallId"));
  const clientKey = String(fd.get("clientKey") || "").slice(0, 64) || null;
  const ownerId = String(fd.get("ownerId") || u.id);
  const lines: { bookId: number; qty: number }[] = [];
  for (const [k, v] of fd.entries()) {
    const m = /^qty_(\d+)$/.exec(k);
    if (!m || String(v).trim() === "") continue;
    const q = Number(v);
    if (!Number.isInteger(q) || q < 0) return fail("Enter whole numbers (0 or more).", undefined, { [k]: "Whole number" });
    if (q > 0) lines.push({ bookId: Number(m[1]), qty: q });
  }
  if (!lines.length) return fail("Enter how many copies of at least one book.");
  const res = await db.transaction(async (tx) => {
    const s = await lockStall(tx, id);
    if (!s) return fail("Stall not found.");
    if (s.status !== "draft" && s.status !== "active") return fail("Books can be added only before the stall starts closing.");
    if (!(await isAcceptedParticipant(tx, id, ownerId))) return fail("The owner must first accept the invitation.");
    // You add your own copies (confirmed at once). The coordinator may propose copies for someone — that owner confirms.
    if (ownerId !== u.id && s.coordinatorId !== u.id) return fail("You can add only your own books.");
    if (clientKey) {
      const [dup] = await tx.select({ id: schema.stallContribution.id }).from(schema.stallContribution)
        .where(and(eq(schema.stallContribution.stallId, id), eq(schema.stallContribution.clientKey, clientKey)));
      if (dup) return ok("Already saved.");
    }
    const own = ownerId === u.id;
    if (own) {
      await lockHolders(tx, [H.devotee(ownerId)]);
      const free = await freeCopies(tx, ownerId);
      for (const l of lines) if (l.qty > (free.get(l.bookId) ?? 0)) return fail(`You have only ${num(Math.max(free.get(l.bookId) ?? 0, 0))} free copies of one of the books.`, "Copies already reported, on another stall, or reserved for a transfer can't be added.", { [`qty_${l.bookId}`]: `Max ${Math.max(free.get(l.bookId) ?? 0, 0)}` });
    }
    await tx.insert(schema.stallContribution).values(lines.map((l, i) => ({
      stallId: id, userId: ownerId, bookId: l.bookId, qty: l.qty, status: own ? ("confirmed" as const) : ("proposed" as const),
      proposedBy: u.id, clientKey: clientKey ? (i === 0 ? clientKey : `${clientKey}:${i}`) : null, confirmedAt: own ? new Date() : null,
    })));
    await logStall(tx, id, u.id, own ? "contributed" : "proposed_contribution", { ownerId, lines });
    return ok(own ? `${num(lines.reduce((a, l) => a + l.qty, 0))} copies added to the stall.` : "Proposed. The owner must confirm.", own ? "They stay yours until the stall closes; they are kept aside for the stall." : undefined);
  });
  if (res.status === "success" && ownerId !== u.id) await notify([ownerId], "Please confirm books for the stall", `${u.name} proposed books from your stock.`, path(id));
  refresh(id);
  return res;
}

export async function confirmContribution(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireApproved(...ROLES);
  const cid = Number(fd.get("id"));
  const accept = fd.get("decision") !== "reject";
  const res = await db.transaction(async (tx) => {
    const [c] = await tx.select().from(schema.stallContribution).where(eq(schema.stallContribution.id, cid));
    if (!c || c.userId !== u.id) return fail("Only the owner of these books can confirm.");
    const s = await lockStall(tx, c.stallId);
    if (s.status !== "draft" && s.status !== "active") return fail("This stall is closing; books can't be added now.");
    if (c.status !== "proposed") return ok("Already done.");
    if (accept) {
      await lockHolders(tx, [H.devotee(u.id)]);
      const free = await freeCopies(tx, u.id);
      if (c.qty > (free.get(c.bookId) ?? 0)) return fail(`You have only ${num(Math.max(free.get(c.bookId) ?? 0, 0))} free copies of this book.`);
    }
    await tx.update(schema.stallContribution).set({ status: accept ? "confirmed" : "withdrawn", confirmedAt: accept ? new Date() : null }).where(eq(schema.stallContribution.id, cid));
    await logStall(tx, c.stallId, u.id, accept ? "confirmed_contribution" : "rejected_contribution", { id: cid });
    return ok(accept ? "Confirmed — these copies are kept aside for the stall." : "Not added.");
  });
  refresh(Number(fd.get("stallId")));
  return res;
}

export async function withdrawContribution(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireApproved(...ROLES);
  const cid = Number(fd.get("id"));
  const res = await db.transaction(async (tx) => {
    const [c] = await tx.select().from(schema.stallContribution).where(eq(schema.stallContribution.id, cid));
    if (!c) return fail("Not found.");
    const s = await lockStall(tx, c.stallId);
    if (c.userId !== u.id && s.coordinatorId !== u.id) return fail("Only the owner or the coordinator can take books back.");
    if (s.status !== "draft" && s.status !== "active") return fail("The stall is closing; returns are decided at closing.");
    if (c.status === "withdrawn") return ok("Already taken back.");
    if (c.status === "confirmed" && s.status === "active") {
      const st = (await stallStock(s.id, tx)).find((x) => x.book_id === c.bookId);
      if (st && st.left < c.qty) return fail(`Only ${num(st.left)} copies of this book are left on the stall — the rest are sold.`, "You can take back the unsold copies at closing.");
    }
    await tx.update(schema.stallContribution).set({ status: "withdrawn" }).where(eq(schema.stallContribution.id, cid));
    await logStall(tx, c.stallId, u.id, "withdrew_contribution", { id: cid, qty: c.qty });
    return ok("Books taken back from the stall.");
  });
  refresh(Number(fd.get("stallId")));
  return res;
}

/* ---------------- Lifecycle ---------------- */

async function setStatus(tx: Tx, s: Stall, to: Stall["status"], actor: string, detail?: Record<string, unknown>) {
  const done = await tx.update(schema.bookStall).set({ status: to, updatedAt: new Date(), ...(to === "closed" || to === "cancelled" ? { closedAt: new Date() } : {}) })
    .where(and(eq(schema.bookStall.id, s.id), eq(schema.bookStall.status, s.status))).returning({ id: schema.bookStall.id });
  if (done.length) await logStall(tx, s.id, actor, `status:${to}`, detail);
  return done.length > 0;
}

export async function openStall(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireApproved(...ROLES);
  const id = Number(fd.get("stallId"));
  const res = await db.transaction(async (tx) => {
    const s = await lockStall(tx, id);
    if (!s || s.coordinatorId !== u.id) return fail("Only the coordinator can start the stall.");
    if (s.status !== "draft") return fail("The stall has already started.");
    const st = await stallStock(id, tx);
    if (!st.length) return fail("Add some books first.", "At least one owner must add (confirm) books.");
    await setStatus(tx, s, "active", u.id);
    return ok("The stall is open — start selling 🙏");
  });
  refresh(id);
  return res;
}

export async function cancelStall(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireApproved(...ROLES);
  const id = Number(fd.get("stallId"));
  const reason = String(fd.get("reason") || "").trim();
  const res = await db.transaction(async (tx) => {
    const s = await lockStall(tx, id);
    if (!s || (s.coordinatorId !== u.id && u.role !== "admin")) return fail("Only the coordinator can cancel.");
    if (s.status !== "draft" && s.status !== "active") return fail("A stall can be cancelled only before closing starts.");
    const [{ n }] = (await tx.execute(sql`select count(*)::int as n from stall_sale where stall_id = ${id}`)) as unknown as { n: number }[];
    if (Number(n) > 0) return fail("This stall already has sales.", "Close it instead, so the money and books are settled.");
    await setStatus(tx, s, "cancelled", u.id, { reason });
    return ok("Stall cancelled. All books are free again.");
  });
  refresh(id);
  return res;
}

/* ---------------- Quick Sell (group, no owner) ---------------- */

export async function quickSell(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireApproved(...ROLES);
  const id = Number(fd.get("stallId"));
  const clientKey = String(fd.get("clientKey") || "").slice(0, 64);
  if (!clientKey) return fail("Please refresh the page and try again.");
  const mode = fd.get("mode") === "upi" ? "upi" : fd.get("mode") === "split" ? "split" : "cash";
  const lines: { bookId: number; qty: number }[] = [];
  for (const [k, v] of fd.entries()) {
    const m = /^sell_(\d+)$/.exec(k);
    if (!m || String(v).trim() === "") continue;
    const q = Number(v);
    if (!Number.isInteger(q) || q < 0) return fail("Enter whole numbers.");
    if (q > 0) lines.push({ bookId: Number(m[1]), qty: q });
  }
  if (!lines.length) return fail("Choose at least one book.");
  const res = await db.transaction(async (tx) => {
    const s = await lockStall(tx, id); // one sale at a time per stall: no overselling
    if (!s) return fail("Stall not found.");
    const [dup] = await tx.select().from(schema.stallSale).where(and(eq(schema.stallSale.stallId, id), eq(schema.stallSale.clientKey, clientKey)));
    if (dup) return ok("Already saved ✓", "This sale was recorded once — not added twice.");
    if (s.status !== "active") return fail("The stall is not open for selling.");
    if (!(await isAcceptedParticipant(tx, id, u.id))) return fail("Only stall participants can sell here.");
    const recipientId = String(fd.get("recipientId") || u.id);
    if (recipientId !== u.id && !(await isAcceptedParticipant(tx, id, recipientId))) return fail("The person who received the money must be a stall participant.");
    const stock = new Map((await stallStock(id, tx)).map((x) => [x.book_id, x]));
    for (const l of lines) {
      const st = stock.get(l.bookId);
      if (!st) return fail("That book is not on this stall.");
      if (l.qty > st.left) return fail(`Only ${num(st.left)} ${st.left === 1 ? "copy" : "copies"} of ${st.title} left on the stall.`, undefined, { [`sell_${l.bookId}`]: `Max ${st.left}` });
    }
    const priced = lines.map((l) => ({ ...l, price: stock.get(l.bookId)!.price_paise, amount: l.qty * stock.get(l.bookId)!.price_paise }));
    const total = priced.reduce((a, l) => a + l.amount, 0);
    let cash = mode === "cash" ? total : 0;
    let upi = mode === "upi" ? total : 0;
    if (mode === "split") {
      cash = toPaise(String(fd.get("cash") || "0") || "0");
      upi = toPaise(String(fd.get("upi") || "0") || "0");
      if (!(cash > 0 && upi > 0) || cash + upi !== total) return fail(`Cash + UPI must equal ${inr(total)}.`, `You entered ${inr(cash)} + ${inr(upi)}.`, { cash: "Parts don't add up" });
    }
    const [sale] = await tx.insert(schema.stallSale).values({ stallId: id, clientKey, operatorId: u.id, recipientId, mode, totalPaise: total, cashPaise: cash, upiPaise: upi, note: String(fd.get("note") || "").trim().slice(0, 200) || null })
      .returning({ id: schema.stallSale.id });
    await tx.insert(schema.stallSaleLine).values(priced.map((l) => ({ saleId: sale.id, stallId: id, bookId: l.bookId, qty: l.qty, pricePaise: l.price, amountPaise: l.amount })));
    return ok(`Sold ${num(lines.reduce((a, l) => a + l.qty, 0))} · ${inr(total)} ✓`, mode === "split" ? `Cash ${inr(cash)} + UPI ${inr(upi)}` : mode === "upi" ? "UPI" : "Cash");
  });
  refresh(id);
  return res;
}

export async function reverseSale(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireApproved(...ROLES);
  const id = Number(fd.get("stallId"));
  const saleId = Number(fd.get("saleId"));
  const reason = String(fd.get("reason") || "").trim();
  const res = await db.transaction(async (tx) => {
    const s = await lockStall(tx, id);
    if (!s || s.status !== "active") return fail("Sales can be undone only while the stall is open.");
    const [sale] = await tx.select().from(schema.stallSale).where(and(eq(schema.stallSale.id, saleId), eq(schema.stallSale.stallId, id)));
    if (!sale) return fail("Sale not found.");
    if (sale.operatorId !== u.id && s.coordinatorId !== u.id) return fail("Only the person who sold, or the coordinator, can undo a sale.");
    if (sale.reversalOf || sale.reversedBy) return ok("Already undone.");
    const lines = await tx.select().from(schema.stallSaleLine).where(eq(schema.stallSaleLine.saleId, saleId));
    // An undo is a new, opposite entry — the original stays in the record.
    const [rev] = await tx.insert(schema.stallSale).values({
      stallId: id, clientKey: `undo:${saleId}`, operatorId: u.id, recipientId: sale.recipientId, mode: sale.mode,
      totalPaise: -sale.totalPaise, cashPaise: -sale.cashPaise, upiPaise: -sale.upiPaise, reversalOf: saleId, note: reason || "Undo",
    }).onConflictDoNothing().returning({ id: schema.stallSale.id });
    if (!rev) return ok("Already undone.");
    await tx.insert(schema.stallSaleLine).values(lines.map((l) => ({ saleId: rev.id, stallId: id, bookId: l.bookId, qty: -l.qty, pricePaise: l.pricePaise, amountPaise: -l.amountPaise })));
    await tx.update(schema.stallSale).set({ reversedBy: rev.id }).where(eq(schema.stallSale.id, saleId));
    await logStall(tx, id, u.id, "reversed_sale", { saleId, reason });
    return ok(`Sale undone (${inr(sale.totalPaise)}).`);
  });
  refresh(id);
  return res;
}

/* ---------------- Closing: count, allocate, confirm ---------------- */

export async function startClosing(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireApproved(...ROLES);
  const id = Number(fd.get("stallId"));
  const res = await db.transaction(async (tx) => {
    const s = await lockStall(tx, id);
    if (!s || s.coordinatorId !== u.id) return fail("Only the coordinator can close the stall.");
    if (s.status !== "active") return fail("The stall is not open.");
    // Proposed (unconfirmed) copies never reached the stall.
    await tx.update(schema.stallContribution).set({ status: "withdrawn" }).where(and(eq(schema.stallContribution.stallId, id), eq(schema.stallContribution.status, "proposed")));
    await setStatus(tx, s, "closing", u.id);
    return ok("Selling stopped. Now count the books left on the table.");
  });
  refresh(id);
  return res;
}

type OwnerRow = { userId: string; contributed: number };

async function ownersByBook(tx: Tx | typeof db, stallId: number) {
  const rows = await tx.select({ userId: schema.stallContribution.userId, bookId: schema.stallContribution.bookId, qty: sql<number>`sum(${schema.stallContribution.qty})::int` })
    .from(schema.stallContribution)
    .where(and(eq(schema.stallContribution.stallId, stallId), eq(schema.stallContribution.status, "confirmed")))
    .groupBy(schema.stallContribution.userId, schema.stallContribution.bookId)
    .orderBy(schema.stallContribution.userId);
  const m = new Map<number, OwnerRow[]>();
  for (const r of rows) {
    if (!m.has(r.bookId)) m.set(r.bookId, []);
    m.get(r.bookId)!.push({ userId: r.userId, contributed: Number(r.qty) });
  }
  return m;
}

/** Save an allocation as a new version (older confirmations stop counting). */
async function saveAllocation(tx: Tx, s: Stall, actor: string, takeHome?: Map<string, Map<number, number>>) {
  const counts = await tx.select().from(schema.stallCount).where(eq(schema.stallCount.stallId, s.id));
  const owners = await ownersByBook(tx, s.id);
  const prices = new Map((await stallStock(s.id, tx)).map((x) => [x.book_id, x.price_paise]));
  const version = s.allocationVersion + 1;
  const allocRows: (typeof schema.stallAllocation.$inferInsert)[] = [];
  const xfer: (typeof schema.stallTransferLine.$inferInsert)[] = [];
  for (const c of counts) {
    const os = owners.get(c.bookId) ?? [];
    const th = takeHome ? new Map(os.map((o) => [o.userId, takeHome.get(o.userId)?.get(c.bookId) ?? 0])) : undefined;
    const r = allocateTitle(os, c.sold, c.remaining, th);
    if (r.error) return { error: r.error, bookId: c.bookId };
    for (const x of r.rows)
      allocRows.push({ stallId: s.id, version, userId: x.userId, bookId: c.bookId, contributed: x.contributed, suggestedTakeHome: x.suggestedTakeHome, takeHome: x.takeHome,
        loss: x.loss, transferIn: x.transferIn, transferOut: x.transferOut, attributedSold: x.attributedSold, attributedValuePaise: x.attributedSold * (prices.get(c.bookId) ?? 0) });
    for (const t of r.transfers) xfer.push({ stallId: s.id, version, fromUserId: t.from, toUserId: t.to, bookId: c.bookId, qty: t.qty });
  }
  if (allocRows.length) await tx.insert(schema.stallAllocation).values(allocRows);
  if (xfer.length) await tx.insert(schema.stallTransferLine).values(xfer);
  await tx.update(schema.bookStall).set({ allocationVersion: version, updatedAt: new Date() }).where(eq(schema.bookStall.id, s.id));
  await logStall(tx, s.id, actor, takeHome ? "edited_allocation" : "allocated", { version });
  return { version };
}

export async function saveCounts(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireApproved(...ROLES);
  const id = Number(fd.get("stallId"));
  const note = String(fd.get("note") || "").trim().slice(0, 500) || null;
  const res = await db.transaction(async (tx) => {
    const s = await lockStall(tx, id);
    if (!s || s.coordinatorId !== u.id) return fail("Only the coordinator can enter the count.");
    if (s.status !== "closing" && s.status !== "disputed") return fail("Counting is done when selling has stopped.");
    const stock = await stallStock(id, tx);
    const errs: Record<string, string> = {};
    const rows = stock.map((b) => {
      const raw = String(fd.get(`left_${b.book_id}`) ?? "").trim();
      const left = raw === "" ? NaN : Number(raw);
      if (!Number.isInteger(left) || left < 0) errs[`left_${b.book_id}`] = "Enter the count (whole number)";
      else if (left > b.left) errs[`left_${b.book_id}`] = `At most ${b.left} can be left`;
      return { b, left };
    });
    if (Object.keys(errs).length) return fail("Please check the counts.", "Count every book left on the table. It can't be more than given − sold.", errs);
    const lossy = rows.some((r) => r.left < r.b.left);
    if (lossy && !note) return fail("Some copies are missing.", "Please write a short note about the missing or damaged copies.", { note: "Note needed" });
    await tx.delete(schema.stallCount).where(eq(schema.stallCount.stallId, id));
    await tx.insert(schema.stallCount).values(rows.map((r) => ({ stallId: id, bookId: r.b.book_id, contributed: r.b.contributed, sold: r.b.sold, remaining: r.left, loss: r.b.left - r.left, note, countedBy: u.id })));
    await tx.update(schema.bookStall).set({ closingNote: note }).where(eq(schema.bookStall.id, id));
    const a = await saveAllocation(tx, { ...s }, u.id);
    if ("error" in a) return fail(a.error ?? "Could not share the books.");
    if (s.status === "disputed") await setStatus(tx, s, "closing", u.id);
    return ok("Counted. Each owner now confirms what they take home.");
  });
  if (res.status === "success") await notifyOwners(id, "Please confirm the stall closing", "Check the books you take home and confirm.");
  refresh(id);
  return res;
}

export async function editAllocation(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireApproved(...ROLES);
  const id = Number(fd.get("stallId"));
  const res = await db.transaction(async (tx) => {
    const s = await lockStall(tx, id);
    if (!s || s.coordinatorId !== u.id) return fail("Only the coordinator can change the take-home copies.");
    if (s.status !== "closing" && s.status !== "disputed") return fail("Take-home copies can be changed only while closing.");
    const th = new Map<string, Map<number, number>>();
    for (const [k, v] of fd.entries()) {
      const m = /^th_([^_]+)_(\d+)$/.exec(k);
      if (!m) continue;
      const q = Number(v);
      if (!Number.isInteger(q) || q < 0) return fail("Take-home copies must be whole numbers.", undefined, { [k]: "Whole number" });
      if (!th.has(m[1])) th.set(m[1], new Map());
      th.get(m[1])!.set(Number(m[2]), q);
    }
    const a = await saveAllocation(tx, s, u.id, th);
    if ("error" in a) return fail(a.error ?? "Could not save.", "Change the numbers so each book's take-home copies add up to the count.");
    if (s.status === "disputed") await setStatus(tx, s, "closing", u.id);
    return ok("Saved. Owners must confirm again (the change cancels earlier confirmations).");
  });
  if (res.status === "success") await notifyOwners(id, "Stall closing changed — please confirm again", "The take-home copies were changed.");
  refresh(id);
  return res;
}

async function notifyOwners(stallId: number, title: string, body: string) {
  const owners = await db.selectDistinct({ id: schema.stallContribution.userId }).from(schema.stallContribution)
    .where(and(eq(schema.stallContribution.stallId, stallId), eq(schema.stallContribution.status, "confirmed")));
  await notify(owners.map((o) => o.id), title, body, path(stallId));
}

export async function confirmAllocation(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireApproved(...ROLES);
  const id = Number(fd.get("stallId"));
  const version = Number(fd.get("version"));
  const dispute = fd.get("decision") === "dispute";
  const reason = String(fd.get("reason") || "").trim().slice(0, 300) || null;
  if (dispute && !reason) return fail("Please write what is wrong.", undefined, { reason: "Reason needed" });
  const res = await db.transaction(async (tx) => {
    const s = await lockStall(tx, id);
    if (!s || s.status !== "closing") return fail(s?.status === "disputed" ? "The closing is disputed — the coordinator must fix it first." : "Nothing to confirm now.");
    if (version !== s.allocationVersion) return fail("The take-home copies were changed. Please look again and confirm.");
    const [mine] = await tx.select({ id: schema.stallAllocation.id }).from(schema.stallAllocation)
      .where(and(eq(schema.stallAllocation.stallId, id), eq(schema.stallAllocation.version, version), eq(schema.stallAllocation.userId, u.id)));
    if (!mine) return fail("Only owners who gave books confirm the closing.");
    await tx.insert(schema.stallConfirmation).values({ stallId: id, version, userId: u.id, decision: dispute ? "disputed" : "confirmed", reason })
      .onConflictDoUpdate({ target: [schema.stallConfirmation.stallId, schema.stallConfirmation.version, schema.stallConfirmation.userId], set: { decision: dispute ? "disputed" : "confirmed", reason, createdAt: new Date() } });
    if (dispute) {
      await setStatus(tx, s, "disputed", u.id, { reason });
      return ok("Your concern is sent to the coordinator.");
    }
    // A Sector Sevak who is an owner approves for their own Dham by confirming.
    if (u.role === "manager" && u.dhamId != null) {
      const dhams = await participatingDhams(id, tx);
      if (dhams.includes(u.dhamId)) await tx.insert(schema.stallApproval).values({ stallId: id, version, dhamId: u.dhamId, approvedBy: u.id }).onConflictDoNothing();
    }
    const owners = await tx.selectDistinct({ id: schema.stallAllocation.userId }).from(schema.stallAllocation).where(and(eq(schema.stallAllocation.stallId, id), eq(schema.stallAllocation.version, version)));
    const conf = await tx.select({ id: schema.stallConfirmation.userId }).from(schema.stallConfirmation)
      .where(and(eq(schema.stallConfirmation.stallId, id), eq(schema.stallConfirmation.version, version), eq(schema.stallConfirmation.decision, "confirmed")));
    const done = owners.every((o) => conf.some((c) => c.id === o.id));
    if (!done) return ok("Confirmed 🙏", "Waiting for the other owners.");
    await setStatus(tx, s, "pending_approval", u.id);
    return await tryPost(tx, { ...s, status: "pending_approval" }, u.id, "All owners confirmed.");
  });
  if (res.status === "success") {
    const s = await loadStall(id);
    if (s?.status === "pending_approval") {
      const dhams = await participatingDhams(id);
      for (const d of dhams) await notify(await dhamManagers(d), `Approve stall closing: ${s.name}`, "All owners confirmed the closing.", path(id));
    } else if (s?.coordinatorId && dispute) await notify([s.coordinatorId], `Closing disputed: ${s.name}`, reason ?? undefined, path(id));
  }
  refresh(id);
  return res;
}

/* ---------------- Approval and posting ---------------- */

export async function approveClosing(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireApproved("manager", "admin");
  const id = Number(fd.get("stallId"));
  const res = await db.transaction(async (tx) => {
    const s = await lockStall(tx, id);
    if (!s || s.status !== "pending_approval") return fail("This closing is not waiting for approval.");
    const dhams = await participatingDhams(id, tx);
    const mine = u.role === "admin" ? dhams : dhams.filter((d) => d === u.dhamId);
    if (!mine.length) return fail("Only a Sector Sevak of a participating Dham can approve.");
    await tx.insert(schema.stallApproval).values(mine.map((d) => ({ stallId: id, version: s.allocationVersion, dhamId: d, approvedBy: u.id }))).onConflictDoNothing();
    await logStall(tx, id, u.id, "approved_closing", { dhams: mine });
    return await tryPost(tx, s, u.id, "Approved.");
  });
  refresh(id);
  return res;
}

/** When every participating Dham approved the current version, post the books to the ledger. */
async function tryPost(tx: Tx, s: Stall, actor: string, msg: string): Promise<ActionState> {
  const dhams = await participatingDhams(s.id, tx);
  const appr = await tx.select({ d: schema.stallApproval.dhamId }).from(schema.stallApproval)
    .where(and(eq(schema.stallApproval.stallId, s.id), eq(schema.stallApproval.version, s.allocationVersion)));
  const missing = dhams.filter((d) => !appr.some((a) => a.d === d));
  if (missing.length) return ok(msg, `Waiting for approval from ${missing.length} Dham${missing.length === 1 ? "" : "s"}.`);
  const alloc = await tx.select().from(schema.stallAllocation).where(and(eq(schema.stallAllocation.stallId, s.id), eq(schema.stallAllocation.version, s.allocationVersion)));
  const xfer = await tx.select().from(schema.stallTransferLine).where(and(eq(schema.stallTransferLine.stallId, s.id), eq(schema.stallTransferLine.version, s.allocationVersion)));
  const users = await tx.select({ id: schema.user.id, dhamId: schema.user.dhamId }).from(schema.user).where(inArray(schema.user.id, [...new Set(alloc.map((a) => a.userId))]));
  const dhamOf = new Map(users.map((x) => [x.id, x.dhamId]));
  const holders = [...new Set(alloc.map((a) => H.devotee(a.userId)))];
  await lockHolders(tx, holders);
  // Owners must still physically hold what leaves them (their stall copies were reserved, so this should always pass).
  for (const h of holders) {
    const hold = await holderStock(h, tx);
    const uid = h.slice(8);
    for (const a of alloc.filter((x) => x.userId === uid)) {
      const out = a.attributedSold + a.loss + a.transferOut;
      if (out > (hold.get(a.bookId) ?? 0)) return fail("An owner no longer has enough copies to post this closing.", "Ask the Sector Sevak to check that owner's stock.");
    }
  }
  const date = todayIST();
  const base = (uid: string) => ({ dhamId: dhamOf.get(uid) ?? s.organizingDhamId, devoteeId: uid, movementDate: date, createdBy: actor, stallId: s.id, reference: ref(s.id) });
  const moves: (typeof schema.stockMovement.$inferInsert)[] = [];
  for (const a of alloc) {
    if (a.attributedSold) moves.push({ ...base(a.userId), kind: "sold", bookId: a.bookId, qty: a.attributedSold, fromHolder: H.devotee(a.userId), toHolder: "sold", note: `Shared Book Stall ${ref(s.id)}` });
    if (a.loss) moves.push({ ...base(a.userId), kind: "damaged", bookId: a.bookId, qty: a.loss, fromHolder: H.devotee(a.userId), toHolder: "damaged", note: `Missing at Shared Book Stall ${ref(s.id)}` });
  }
  for (const t of xfer)
    moves.push({ ...base(t.fromUserId), kind: "stall_transfer", bookId: t.bookId, qty: t.qty, fromHolder: H.devotee(t.fromUserId), toHolder: H.devotee(t.toUserId), note: `Taken home at Shared Book Stall ${ref(s.id)}` });
  if (moves.length) await insertMovements(tx, moves);
  const [{ total }] = (await tx.execute(sql`select coalesce(sum(total_paise),0)::int as total from stall_sale where stall_id = ${s.id}`)) as unknown as { total: number }[];
  await tx.update(schema.bookStall).set({ postedAt: new Date(), updatedAt: new Date() }).where(eq(schema.bookStall.id, s.id));
  await setStatus(tx, s, Number(total) > 0 ? "pending_settlement" : "closed", actor, { posted: moves.length });
  return ok(`${msg} Books updated for every owner ✓`, Number(total) > 0 ? "Now everyone who received money hands it over to their Sector Sevak (Submit Money → choose this stall)." : undefined);
}

export async function checkSettlement(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireApproved(...ROLES);
  const id = Number(fd.get("stallId"));
  const s = await loadStall(id);
  if (!s || !(await stallAccess(u, s)).view) return fail("Stall not found.");
  await settleIfDone(id, u.id);
  const after = await loadStall(id);
  refresh(id);
  return after?.status === "closed" ? ok("All money received — the stall is closed 🙏") : ok("Some money is still to be handed over.");
}


