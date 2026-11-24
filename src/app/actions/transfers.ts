"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { fail, ok, type ActionState } from "@/lib/action";
import { requireUser, type AppUser } from "@/lib/session";
import { logActivity, notify, dhamManagers } from "@/lib/activity";
import { holderStock, lockHolders, lockKey } from "@/lib/stock";
import { mayHoldBooks } from "@/lib/access";
import { insertMovements } from "@/lib/lots";
import { num, todayIST } from "@/lib/format";
import {
  approvedOf, availableFor, canApprove, canCancel, canReceive, canSee, canSend, fromHolderOf, holderNames, holderUserId,
  isDevoteeHolder, isSourceManager, ref, remainingOf, toHolderOf, type Transfer, type TransferLine,
} from "@/lib/transfers";

/**
 * Books Transfer actions. Every step re-reads the transfer inside a transaction holding a lock
 * on it, checks the status it expects and moves on — so a double tap, a retry or two people at
 * once can never approve, dispatch or receive twice. Stock moves only at dispatch (sender →
 * transit) and at receipt / reconciliation (transit → receiver / sender / written off).
 */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const T = (id: number) => `transit:${id}`;
const sum = (xs: { title: string; qty: number }[]) => xs.filter((x) => x.qty > 0).map((x) => `${num(x.qty)} × ${x.title}`).join(", ");

function readInts(fd: FormData, prefix: string) {
  const out = new Map<number, number>();
  const errors: Record<string, string> = {};
  for (const [k, v] of fd.entries()) {
    if (!k.startsWith(prefix)) continue;
    const raw = String(v).trim();
    if (!raw) continue;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) errors[k] = "Enter a whole number";
    else out.set(Number(k.slice(prefix.length)), n);
  }
  return { values: out, errors };
}

async function load(id: number, tx: Tx | typeof db = db) {
  const [t] = await tx.select().from(schema.dhamTransfer).where(eq(schema.dhamTransfer.id, id));
  if (!t) return null;
  const lines = await tx.select().from(schema.dhamTransferLine).where(eq(schema.dhamTransferLine.transferId, id));
  return { t, lines };
}

async function titles(bookIds: number[]) {
  const b = bookIds.length ? await db.select({ id: schema.book.id, title: schema.book.title }).from(schema.book).where(inArray(schema.book.id, bookIds)) : [];
  return (id: number) => b.find((x) => x.id === id)?.title ?? "Book";
}

async function event(tx: Tx, transferId: number, status: string, byUser: string, qty?: number | null, note?: string | null) {
  await tx.insert(schema.dhamTransferEvent).values({ transferId, status, byUser, qty: qty ?? null, note: note || null });
}

/** People to tell about a step: both Dhams' Sector Sevaks and any devotee involved. */
async function people(t: Transfer, side: "source" | "dest" | "both") {
  const ids = new Set<string>();
  if (side !== "dest") {
    for (const m of await dhamManagers(t.fromDhamId)) ids.add(m);
    const d = holderUserId(fromHolderOf(t));
    if (d) ids.add(d);
    if (t.senderId) ids.add(t.senderId);
  }
  if (side !== "source") {
    for (const m of await dhamManagers(t.toDhamId)) ids.add(m);
    const d = holderUserId(toHolderOf(t));
    if (d) ids.add(d);
    ids.add(t.requestedBy);
  }
  return [...ids];
}

/** Holder → its Dham, checking the holder exists and is active. */
async function resolveHolder(h: string): Promise<{ dhamId: number; devoteeId: string | null } | null> {
  if (h.startsWith("dham:")) {
    const id = Number(h.slice(5));
    const [d] = await db.select({ id: schema.dham.id, active: schema.dham.isActive }).from(schema.dham).where(eq(schema.dham.id, id));
    return d && d.active ? { dhamId: id, devoteeId: null } : null;
  }
  if (isDevoteeHolder(h)) {
    const [p] = await db.select({ id: schema.user.id, dhamId: schema.user.dhamId, active: schema.user.isActive, role: schema.user.role }).from(schema.user).where(eq(schema.user.id, h.slice(8)));
    return p && p.active && p.dhamId && (p.role === "devotee" || p.role === "manager") ? { dhamId: p.dhamId, devoteeId: p.id } : null;
  }
  return null;
}

/** A devotee receiver must be allowed to hold books (approved, Book Distribution on). Returns their name when not. */
async function receiverBlocked(exec: Pick<typeof db, "select">, holder: string): Promise<string | null> {
  if (!isDevoteeHolder(holder)) return null;
  const [p] = await exec.select().from(schema.user).where(eq(schema.user.id, holder.slice(8)));
  return p && !mayHoldBooks(p) ? p.name : null;
}
const BLOCKED = (name: string) => `${name} can't receive books: Book Distribution is not turned on for them.`;

/** Where may this person ask books to be delivered? */
function mayRequestTo(u: AppUser, dst: { dhamId: number; devoteeId: string | null }) {
  if (u.role === "admin") return true;
  if (u.role === "manager") return dst.dhamId === u.dhamId; // own Dham shelf or own devotee
  if (u.role === "devotee") return u.canSeeAvailability && dst.devoteeId === u.id; // eligible devotee, for themself
  return false;
}

const done = (id: number) => {
  revalidatePath("/transfers");
  revalidatePath(`/transfers/${id}`);
  revalidatePath("/stock");
  revalidatePath("/availability");
};

/* 1. REQUEST — nothing moves; only books the source has available (stock − reserved). */
export async function requestTransfer(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser("admin", "manager", "devotee");
  const source = String(fd.get("source") || "");
  const dest = String(fd.get("dest") || (u.role === "devotee" ? `devotee:${u.id}` : u.role === "manager" ? `dham:${u.dhamId}` : ""));
  const note = String(fd.get("note") || "").trim().slice(0, 300) || null;
  if (!source) return fail("Please choose where the books should come from.", undefined, { source: "Choose a source" });
  if (!dest) return fail("Please choose who receives the books.", undefined, { dest: "Choose who receives" });
  if (source === dest) return fail("The source and the receiver are the same.", undefined, { source: "Choose another source" });
  const [src, dst] = await Promise.all([resolveHolder(source), resolveHolder(dest)]);
  if (!src) return fail("That source is not available.", undefined, { source: "Choose another source" });
  if (!dst) return fail("That receiver is not available.", undefined, { dest: "Choose who receives" });
  const blocked = await receiverBlocked(db, dest);
  if (blocked) return fail(BLOCKED(blocked), undefined, { dest: "Choose who receives" });
  if (!mayRequestTo(u, dst)) return fail("You can't request books for that receiver.", u.role === "devotee" ? "Ask your Chakra Sevak for Book Availability access." : undefined);
  // A devotee may only see/ask other devotees' stock when given availability access; a Sector Sevak
  // without access may still ask Dham shelves and their own devotees.
  if (isDevoteeHolder(source) && u.role === "manager" && !u.canSeeAvailability && src.dhamId !== u.dhamId)
    return fail("You can request from another Dham's shelf, not from its devotees.", "A Chakra Sevak can give you Book Availability access.");

  const { values, errors } = readInts(fd, "qty_");
  if (Object.keys(errors).length) return fail("Some quantities are not valid.", "Please enter whole numbers only.", errors);
  const lines = [...values.entries()].filter(([, q]) => q > 0).map(([bookId, qty]) => ({ bookId, qty }));
  if (!lines.length) return fail("Please enter how many copies you need.", "Type a quantity next to at least one book.");

  const avail = await availableFor(source);
  const short: Record<string, string> = {};
  for (const l of lines) {
    const have = avail.get(l.bookId) ?? 0;
    if (l.qty > have) short[`qty_${l.bookId}`] = have > 0 ? `Only ${num(have)} available` : "None available";
  }
  if (Object.keys(short).length) return fail("You asked for more than is available.", "Please reduce the highlighted quantities.", short);

  const id = await db.transaction(async (tx) => {
    const [t] = await tx.insert(schema.dhamTransfer).values({
      fromDhamId: src.dhamId, toDhamId: dst.dhamId, fromHolder: source, toHolder: dest, note, requestedBy: u.id,
      senderId: src.devoteeId, // a devotee source sends their own books
    }).returning({ id: schema.dhamTransfer.id });
    await tx.insert(schema.dhamTransferLine).values(lines.map((l) => ({ transferId: t.id, bookId: l.bookId, requestedQty: l.qty })));
    await event(tx, t.id, "requested", u.id, lines.reduce((a, l) => a + l.qty, 0), note);
    return t.id;
  });
  const x = (await load(id))!;
  const name = await holderNames([source, dest]);
  const title = await titles(lines.map((l) => l.bookId));
  const what = sum(lines.map((l) => ({ title: title(l.bookId), qty: l.qty })));
  await logActivity(u.id, `${u.name} requested ${what} from ${name(source)} for ${name(dest)} (${ref(id)})`, { dhamId: dst.dhamId });
  if (src.devoteeId) {
    // Devotee to devotee: the devotee who has the books decides; their Sector Sevak is kept informed.
    await notify([src.devoteeId], `${name(dest)} is asking for your books (${ref(id)})`, `${what}. Check your copies and approve, change the quantity, or reject.`, `/transfers/${id}`);
    await notify(await dhamManagers(src.dhamId), `Book request ${ref(id)}: ${name(source)} → ${name(dest)}`, `${what}. For your information — ${name(source)} will approve.`, `/transfers/${id}`);
  } else {
    await notify(await dhamManagers(src.dhamId), `Book request ${ref(id)} for ${name(dest)}`, `${what}. Please check and approve.`, `/transfers/${id}`);
  }
  done(x.t.id);
  return ok(
    `Request ${ref(id)} sent.`,
    src.devoteeId ? `${name(source)} will check their copies and approve.` : `The Sector Sevak of ${name(source).replace(/ \(shelf\)$/, "")} will check and approve it.`,
    { label: "See this request", href: `/transfers/${id}` },
  );
}

/* 2. APPROVE (fully or partly — the approved copies are reserved) or REJECT.
   By the devotee who holds the books, or for a Dham shelf by its Sector Sevak. */
export async function approveTransfer(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser("admin", "manager", "devotee");
  const id = Number(fd.get("id"));
  const reply = String(fd.get("reply") || "").trim().slice(0, 300) || null;
  const decline = fd.get("decision") === "decline";
  const { values, errors } = readInts(fd, "approve_");
  if (Object.keys(errors).length) return fail("Some quantities are not valid.", "Please enter whole numbers only.", errors);
  const senderId = String(fd.get("senderId") || "") || null;

  const res = await db.transaction(async (tx) => {
    await lockKey(tx, `transfer:${id}`);
    const x = await load(id, tx);
    if (!x) return { err: "This request was not found." };
    const { t, lines } = x;
    if (!decline) {
      const blocked = await receiverBlocked(tx, toHolderOf(t));
      if (blocked) return { err: BLOCKED(blocked) };
    }
    if (!canApprove(u, t)) return { err: "Only the person who has these books (or their Sector Sevak) can approve this." };
    if (t.status !== "requested") return { err: "This request was already answered." };
    if (decline) {
      await tx.update(schema.dhamTransfer).set({ status: "declined", reply, closedBy: u.id, closedAt: new Date() }).where(eq(schema.dhamTransfer.id, id));
      await event(tx, id, "declined", u.id, null, reply);
      return { t, declined: true as const };
    }
    const src = fromHolderOf(t);
    await lockHolders(tx, [src]);
    const avail = await availableFor(src, tx, id);
    const short: Record<string, string> = {};
    const plan = lines.map((l) => {
      const q = values.get(l.bookId) ?? l.requestedQty;
      const have = avail.get(l.bookId) ?? 0;
      if (q > l.requestedQty) short[`approve_${l.bookId}`] = `They asked for ${num(l.requestedQty)}`;
      else if (q > have) short[`approve_${l.bookId}`] = `Only ${num(Math.max(have, 0))} available`;
      return { line: l, qty: q };
    });
    if (Object.keys(short).length) return { short };
    if (!plan.some((p) => p.qty > 0)) return { err: "Nothing approved.", detail: "Approve at least one copy, or reject the request." };
    let sender = t.senderId;
    if (!isDevoteeHolder(src) && senderId) {
      const [p] = await tx.select().from(schema.user).where(eq(schema.user.id, senderId));
      if (!p || !p.isActive || p.dhamId !== t.fromDhamId || (p.role !== "devotee" && p.role !== "manager")) return { err: "Please choose a sender from your own Dham." };
      sender = senderId;
    }
    for (const p of plan) await tx.update(schema.dhamTransferLine).set({ approvedQty: p.qty }).where(eq(schema.dhamTransferLine.id, p.line.id));
    // The sender approving their own books has accepted to send them too — one step less.
    const selfSend = !!sender && sender === u.id;
    await tx.update(schema.dhamTransfer).set({
      status: selfSend ? "accepted" : "approved", reply, senderId: sender, approvedBy: u.id, approvedAt: new Date(),
      ...(selfSend ? { acceptedBy: u.id, acceptedAt: new Date() } : {}),
    }).where(eq(schema.dhamTransfer.id, id));
    const total = plan.reduce((a, p) => a + p.qty, 0);
    const partial = plan.some((p) => p.qty < p.line.requestedQty);
    await event(tx, id, partial ? "partially_approved" : "approved", u.id, total, reply);
    if (selfSend) await event(tx, id, "accepted", u.id, total);
    return { t: { ...t, senderId: sender }, plan };
  });
  if ("short" in res && res.short) return fail("Please check the quantities.", "You can approve up to what was asked and what is available.", res.short);
  if ("err" in res && res.err) return fail(res.err, "detail" in res ? res.detail : undefined);
  const t = res.t!;
  if ("declined" in res) {
    await logActivity(u.id, `${u.name} rejected ${ref(id)}`, { dhamId: t.fromDhamId });
    await notify(await people(t, "dest"), `Book request ${ref(id)} was rejected`, reply ?? undefined, `/transfers/${id}`);
    done(id);
    return ok("Request rejected.", "The requester has been told.");
  }
  const title = await titles(res.plan!.map((p) => p.line.bookId));
  const what = sum(res.plan!.map((p) => ({ title: title(p.line.bookId), qty: p.qty })));
  await logActivity(u.id, `${u.name} approved ${ref(id)}: ${what}`, { dhamId: t.fromDhamId });
  await notify(await people(t, "both"), `Book request ${ref(id)} approved`, `${what}. ${t.senderId ? "The sender will accept and send." : "The books will be sent soon."}`, `/transfers/${id}`);
  done(id);
  return ok(
    "Approved — these copies are now reserved.",
    t.senderId === u.id ? "Now pack them and tap “Send books” with the quantities you send." : t.senderId ? "The sender has been asked to accept and send them." : "Tap “Send books” when they leave your Dham.",
  );
}

/* 3. ACCEPT — the sender agrees to prepare and send. */
export async function acceptTransfer(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser("admin", "manager", "devotee");
  const id = Number(fd.get("id"));
  const res = await db.transaction(async (tx) => {
    await lockKey(tx, `transfer:${id}`);
    const x = await load(id, tx);
    if (!x) return { err: "This transfer was not found." };
    if (!canSend(u, x.t)) return { err: "Only the sender can accept this." };
    if (x.t.status !== "approved") return { err: x.t.status === "accepted" ? "Already accepted." : "This transfer is not waiting for the sender." };
    await tx.update(schema.dhamTransfer).set({ status: "accepted", acceptedBy: u.id, acceptedAt: new Date() }).where(eq(schema.dhamTransfer.id, id));
    await event(tx, id, "accepted", u.id, x.lines.reduce((a, l) => a + approvedOf(l), 0));
    return { t: x.t };
  });
  if (res.err) return fail(res.err);
  await notify(await people(res.t!, "both"), `${ref(id)} accepted by the sender`, "The books are being prepared.", `/transfers/${id}`);
  done(id);
  return ok("Accepted.", "Prepare the books, then tap “Send books” with the quantities you actually send.");
}

/* 4. DISPATCH — at most the approved quantity; stock leaves the sender and is "on the way". */
export async function dispatchTransfer(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser("admin", "manager", "devotee");
  const id = Number(fd.get("id"));
  const note = String(fd.get("note") || "").trim().slice(0, 300) || null;
  const { values, errors } = readInts(fd, "send_");
  if (Object.keys(errors).length) return fail("Some quantities are not valid.", "Please enter whole numbers only.", errors);
  const date = todayIST();
  const res = await db.transaction(async (tx) => {
    await lockKey(tx, `transfer:${id}`);
    const x = await load(id, tx);
    if (!x) return { err: "This transfer was not found." };
    const { t, lines } = x;
    if (!canSend(u, t)) return { err: "Only the sender can send these books." };
    const blocked = await receiverBlocked(tx, toHolderOf(t));
    if (blocked) return { err: BLOCKED(blocked) + " Cancel this transfer, or ask the Sector Sevak to turn it on." };
    if (t.status !== "approved" && t.status !== "accepted") return { err: t.status === "sent" ? "These books were already sent." : "This transfer is not ready to send." };
    const src = fromHolderOf(t);
    await lockHolders(tx, [src]);
    const stock = await holderStock(src, tx);
    const short: Record<string, string> = {};
    const plan = lines.map((l) => {
      const q = values.get(l.bookId) ?? approvedOf(l);
      if (q > approvedOf(l)) short[`send_${l.bookId}`] = `Only ${num(approvedOf(l))} approved`;
      else if (q > (stock.get(l.bookId) ?? 0)) short[`send_${l.bookId}`] = `Only ${num(stock.get(l.bookId) ?? 0)} in hand`;
      return { line: l, qty: q };
    });
    if (Object.keys(short).length) return { short };
    if (!plan.some((p) => p.qty > 0)) return { err: "Nothing to send.", detail: "Enter at least one copy, or ask the requester to cancel." };
    const srcDevotee = holderUserId(src);
    const moves = plan.filter((p) => p.qty > 0).map((p) => ({
      kind: "transfer_out" as const, bookId: p.line.bookId, qty: p.qty, fromHolder: src, toHolder: T(id), dhamId: t.fromDhamId,
      devoteeId: srcDevotee, movementDate: date, reference: `transfer:${id}`, note: `${ref(id)} sent`, createdBy: u.id,
    }));
    await insertMovements(tx, moves);
    for (const p of plan) await tx.update(schema.dhamTransferLine).set({ sentQty: p.qty }).where(eq(schema.dhamTransferLine.id, p.line.id));
    const extra = t.status === "approved" ? { acceptedBy: u.id, acceptedAt: new Date() } : {};
    await tx.update(schema.dhamTransfer).set({ status: "sent", sentBy: u.id, sentAt: new Date(), ...extra }).where(eq(schema.dhamTransfer.id, id));
    if (t.status === "approved") await event(tx, id, "accepted", u.id, plan.reduce((a, p) => a + approvedOf(p.line), 0));
    await event(tx, id, "sent", u.id, plan.reduce((a, p) => a + p.qty, 0), note);
    return { t, plan };
  });
  if ("short" in res && res.short) return fail("Please check the quantities.", "You can send up to the approved quantity and what you have in hand.", res.short);
  if ("err" in res && res.err) return fail(res.err, "detail" in res ? res.detail : undefined);
  const title = await titles(res.plan!.map((p) => p.line.bookId));
  const what = sum(res.plan!.map((p) => ({ title: title(p.line.bookId), qty: p.qty })));
  await logActivity(u.id, `${u.name} sent ${what} (${ref(id)})`, { dhamId: res.t!.fromDhamId });
  await notify(await people(res.t!, "dest"), `Books on the way — ${ref(id)} 🚚`, `${what}. Count them on arrival and confirm what you received.`, `/transfers/${id}`);
  done(id);
  return ok("Books sent.", "They have left your stock. The receiver will confirm what arrives.");
}

/* 5. RECEIVE — credit only what actually arrived; the rest stays "on the way" for review. */
export async function receiveTransfer(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser("admin", "manager", "devotee");
  const id = Number(fd.get("id"));
  const note = String(fd.get("note") || "").trim().slice(0, 300) || null;
  const { values, errors } = readInts(fd, "recv_");
  if (Object.keys(errors).length) return fail("Some quantities are not valid.", "Please enter whole numbers only.", errors);
  const issues = new Map<number, string>();
  for (const [k, v] of fd.entries()) if (k.startsWith("issue_") && String(v).trim()) issues.set(Number(k.slice(6)), String(v).trim().slice(0, 200));
  const date = todayIST();
  const res = await db.transaction(async (tx) => {
    await lockKey(tx, `transfer:${id}`);
    const x = await load(id, tx);
    if (!x) return { err: "This transfer was not found." };
    const { t, lines } = x;
    if (!canReceive(u, t)) return { err: "Only the receiver can confirm this." };
    if (!["sent", "partially_received", "disputed"].includes(t.status)) return { err: t.status === "completed" || t.status === "received" ? "Already received." : "These books have not been sent yet." };
    await lockHolders(tx, [T(id)]);
    const short: Record<string, string> = {};
    const plan = lines.map((l) => {
      const left = remainingOf(t, l);
      const q = values.get(l.bookId) ?? 0;
      if (q > left) short[`recv_${l.bookId}`] = `Only ${num(left)} still on the way`;
      return { line: l, qty: q, left };
    });
    if (Object.keys(short).length) return { short };
    const got = plan.reduce((a, p) => a + p.qty, 0);
    if (!got && !issues.size) return { err: "Enter how many copies arrived.", detail: "If nothing arrived, write what happened next to the book." };
    const dst = toHolderOf(t);
    const moves = plan.filter((p) => p.qty > 0).map((p) => ({
      kind: "transfer_in" as const, bookId: p.line.bookId, qty: p.qty, fromHolder: T(id), toHolder: dst, dhamId: t.toDhamId,
      devoteeId: holderUserId(dst), movementDate: date, reference: `transfer:${id}`, note: `${ref(id)} received`, createdBy: u.id,
    }));
    if (moves.length) await insertMovements(tx, moves);
    for (const p of plan)
      await tx.update(schema.dhamTransferLine).set({ receivedQty: p.line.receivedQty + p.qty, issue: issues.get(p.line.bookId) ?? p.line.issue }).where(eq(schema.dhamTransferLine.id, p.line.id));
    const left = plan.reduce((a, p) => a + p.left - p.qty, 0);
    const status = left === 0 ? "completed" : issues.size ? "disputed" : "partially_received";
    await tx.update(schema.dhamTransfer).set({ status, receivedBy: u.id, receivedAt: new Date(), ...(status === "completed" ? { closedBy: u.id, closedAt: new Date() } : {}) }).where(eq(schema.dhamTransfer.id, id));
    const issueNote = [...issues.values()].join("; ");
    await event(tx, id, left === 0 ? "received" : status, u.id, got, [note, issueNote].filter(Boolean).join(" — ") || null);
    if (left === 0) await event(tx, id, "completed", u.id, null, "All dispatched copies accounted for");
    return { t, plan, status, left };
  });
  if ("short" in res && res.short) return fail("Please check the quantities.", "You can confirm up to what is still on the way.", res.short);
  if ("err" in res && res.err) return fail(res.err, "detail" in res ? res.detail : undefined);
  const title = await titles(res.plan!.map((p) => p.line.bookId));
  const what = sum(res.plan!.map((p) => ({ title: title(p.line.bookId), qty: p.qty })));
  await logActivity(u.id, `${u.name} received ${what || "nothing"} (${ref(id)})${res.left ? `, ${res.left} still on the way` : ""}`, { dhamId: res.t!.toDhamId });
  await notify(
    await people(res.t!, "source"),
    res.status === "completed" ? `${ref(id)} received in full ✅` : `${ref(id)}: ${num(res.left!)} copies not yet received`,
    res.status === "completed" ? what : `${what ? `Received: ${what}. ` : ""}Please check and reconcile the rest.`,
    `/transfers/${id}`,
  );
  done(id);
  return res.status === "completed"
    ? ok("Books received. 🙏 Transfer completed.", `${what} added to your stock.`)
    : ok(`Received ${what || "no copies"}.`, `${num(res.left!)} copies are still marked “on the way”. Confirm them when they arrive, or the sender's Sector Sevak will reconcile them.`);
}

/* 6. RECONCILE — copies that never arrived: return to the sender, or (Chakra Sevak) write off. */
export async function reconcileTransfer(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser("admin", "manager");
  const id = Number(fd.get("id"));
  const note = String(fd.get("note") || "").trim().slice(0, 300) || null;
  const ret = readInts(fd, "return_");
  const lost = readInts(fd, "lost_");
  const errors = { ...ret.errors, ...lost.errors };
  if (Object.keys(errors).length) return fail("Some quantities are not valid.", "Please enter whole numbers only.", errors);
  if (u.role !== "admin" && [...lost.values.values()].some((q) => q > 0)) return fail("Only a Chakra Sevak can write off books as lost.");
  if (!note) return fail("Please write what happened.", "A short reason is kept with the transfer.", { note: "Write a reason" });
  const date = todayIST();
  const res = await db.transaction(async (tx) => {
    await lockKey(tx, `transfer:${id}`);
    const x = await load(id, tx);
    if (!x) return { err: "This transfer was not found." };
    const { t, lines } = x;
    if (!isSourceManager(u, t)) return { err: "Only the sending Dham's Sector Sevak or a Chakra Sevak can reconcile." };
    if (!["sent", "partially_received", "disputed"].includes(t.status)) return { err: "Nothing is waiting to be reconciled." };
    await lockHolders(tx, [T(id)]);
    const short: Record<string, string> = {};
    const plan = lines.map((l) => {
      const r = ret.values.get(l.bookId) ?? 0;
      const w = lost.values.get(l.bookId) ?? 0;
      const left = remainingOf(t, l);
      if (r + w > left) short[`return_${l.bookId}`] = `Only ${num(left)} still on the way`;
      return { line: l, r, w, left };
    });
    if (Object.keys(short).length) return { short };
    if (!plan.some((p) => p.r + p.w > 0)) return { err: "Enter how many copies to return or write off." };
    const src = fromHolderOf(t);
    const srcDevotee = holderUserId(src);
    const moves = plan.flatMap((p) => [
      ...(p.r > 0 ? [{ kind: "transfer_return" as const, bookId: p.line.bookId, qty: p.r, fromHolder: T(id), toHolder: src, dhamId: t.fromDhamId, devoteeId: srcDevotee, movementDate: date, reference: `transfer:${id}`, note: `${ref(id)} returned: ${note}`, createdBy: u.id }] : []),
      ...(p.w > 0 ? [{ kind: "transfer_loss" as const, bookId: p.line.bookId, qty: p.w, fromHolder: T(id), toHolder: "damaged", dhamId: t.fromDhamId, devoteeId: null, movementDate: date, reference: `transfer:${id}`, note: `${ref(id)} written off: ${note}`, createdBy: u.id }] : []),
    ]);
    await insertMovements(tx, moves);
    for (const p of plan)
      await tx.update(schema.dhamTransferLine).set({ returnedQty: p.line.returnedQty + p.r, lostQty: p.line.lostQty + p.w }).where(eq(schema.dhamTransferLine.id, p.line.id));
    const left = plan.reduce((a, p) => a + p.left - p.r - p.w, 0);
    if (left === 0) await tx.update(schema.dhamTransfer).set({ status: "completed", closedBy: u.id, closedAt: new Date() }).where(eq(schema.dhamTransfer.id, id));
    await event(tx, id, "reconciled", u.id, plan.reduce((a, p) => a + p.r + p.w, 0), note);
    if (left === 0) await event(tx, id, "completed", u.id, null, "All dispatched copies accounted for");
    return { t, left };
  });
  if ("short" in res && res.short) return fail("Please check the quantities.", undefined, res.short);
  if ("err" in res && res.err) return fail(res.err);
  await logActivity(u.id, `${u.name} reconciled ${ref(id)}: ${note}`, { dhamId: res.t!.fromDhamId });
  await notify(await people(res.t!, "both"), `${ref(id)} reconciled`, note, `/transfers/${id}`);
  done(id);
  return ok(res.left === 0 ? "Reconciled — transfer completed." : "Reconciled.", res.left ? `${num(res.left)} copies are still on the way.` : undefined);
}

/* Withdraw before dispatch (releases any reservation). */
export async function cancelTransfer(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser("admin", "manager", "devotee");
  const id = Number(fd.get("id"));
  const res = await db.transaction(async (tx) => {
    await lockKey(tx, `transfer:${id}`);
    const x = await load(id, tx);
    if (!x || !canSee(u, x.t)) return { err: "This transfer was not found." };
    if (!canCancel(u, x.t)) return { err: "Only the requester can cancel this request." };
    if (!["requested", "approved", "accepted"].includes(x.t.status)) return { err: "This can no longer be cancelled.", detail: "The books are already sent." };
    await tx.update(schema.dhamTransfer).set({ status: "cancelled", closedBy: u.id, closedAt: new Date() }).where(and(eq(schema.dhamTransfer.id, id), inArray(schema.dhamTransfer.status, ["requested", "approved", "accepted"])));
    await event(tx, id, "cancelled", u.id);
    return { t: x.t };
  });
  if (res.err) return fail(res.err, "detail" in res ? res.detail : undefined);
  await logActivity(u.id, `${u.name} cancelled ${ref(id)}`, { dhamId: res.t!.toDhamId });
  await notify(await people(res.t!, "source"), `${ref(id)} was cancelled`, undefined, `/transfers/${id}`);
  done(id);
  return ok("Request cancelled.", "Any reserved copies are free again.");
}

export type { TransferLine };
