"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { fail, ok, type ActionState } from "@/lib/action";
import { requireUser, type AppUser } from "@/lib/session";
import { logActivity, notify, dhamManagers } from "@/lib/activity";
import { H, holderStock, lockHolders } from "@/lib/stock";
import { num, todayIST } from "@/lib/format";

/**
 * Dham-to-Dham transfers, done by Sector Sevaks:
 * 1. the Dham that needs books asks (requested) → 2. the Dham that has them checks and approves
 * how many it can give (approved) → 3. it sends them (sent: books leave its shelf, "on the way")
 * → 4. the asking Dham confirms they arrived (received: books land on its shelf).
 * Stock only moves at step 3 and 4, through the same ledger as every other movement.
 */
const T = (id: number) => `transit:${id}`;

function readQtys(fd: FormData, prefix = "qty_") {
  const out: { bookId: number; qty: number }[] = [];
  const errors: Record<string, string> = {};
  for (const [k, v] of fd.entries()) {
    if (!k.startsWith(prefix)) continue;
    const raw = String(v).trim();
    if (!raw) continue;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) errors[k] = "Enter a whole number";
    else out.push({ bookId: Number(k.slice(prefix.length)), qty: n });
  }
  return { lines: out, errors };
}

async function load(id: number) {
  const [t] = await db.select().from(schema.dhamTransfer).where(eq(schema.dhamTransfer.id, id));
  if (!t) return null;
  const lines = await db.select().from(schema.dhamTransferLine).where(eq(schema.dhamTransferLine.transferId, id));
  const books = lines.length
    ? await db.select({ id: schema.book.id, title: schema.book.title }).from(schema.book).where(inArray(schema.book.id, lines.map((l) => l.bookId)))
    : [];
  const dhams = await db.select({ id: schema.dham.id, name: schema.dham.name }).from(schema.dham).where(inArray(schema.dham.id, [t.fromDhamId, t.toDhamId]));
  const title = (b: number) => books.find((x) => x.id === b)?.title ?? "Book";
  const dham = (d: number) => dhams.find((x) => x.id === d)?.name ?? "Dham";
  return { t, lines, title, dham };
}

/** Sector Sevak of that Dham, or a Chakra Sevak. */
function actsFor(u: AppUser, dhamId: number) {
  return u.role === "admin" || (u.role === "manager" && u.dhamId === dhamId);
}

const sum = (xs: { title: string; qty: number }[]) => xs.map((x) => `${num(x.qty)} × ${x.title}`).join(", ");

/* 1. Ask another Dham for books — only books that Dham has on its shelf, and no more than it has. */
export async function requestTransfer(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser("admin", "manager");
  const fromDhamId = Number(fd.get("fromDhamId"));
  const toDhamId = u.role === "manager" ? u.dhamId! : Number(fd.get("toDhamId"));
  const note = String(fd.get("note") || "").trim() || null;
  if (!toDhamId) return fail("Please choose the Dham that needs the books.", undefined, { toDhamId: "Choose a Dham" });
  if (!fromDhamId) return fail("Please choose the Dham to ask.", undefined, { fromDhamId: "Choose a Dham" });
  if (fromDhamId === toDhamId) return fail("A Dham cannot ask itself for books.", undefined, { fromDhamId: "Choose another Dham" });
  const { lines: raw, errors } = readQtys(fd);
  const lines = raw.filter((l) => l.qty > 0);
  if (Object.keys(errors).length) return fail("Some quantities are not valid.", "Please enter whole numbers only.", errors);
  if (!lines.length) return fail("Please enter how many copies you need.", "Type a quantity next to at least one book.");

  const shelf = await holderStock(H.dham(fromDhamId));
  const short: Record<string, string> = {};
  for (const l of lines) {
    const have = shelf.get(l.bookId) ?? 0;
    if (l.qty > have) short[`qty_${l.bookId}`] = have ? `That Dham has only ${num(have)}` : "That Dham has none";
  }
  if (Object.keys(short).length) return fail("You asked for more than that Dham has.", "Please reduce the highlighted quantities.", short);

  const id = await db.transaction(async (tx) => {
    const [t] = await tx.insert(schema.dhamTransfer).values({ fromDhamId, toDhamId, note, requestedBy: u.id }).returning({ id: schema.dhamTransfer.id });
    await tx.insert(schema.dhamTransferLine).values(lines.map((l) => ({ transferId: t.id, bookId: l.bookId, requestedQty: l.qty })));
    return t.id;
  });
  const x = (await load(id))!;
  const named = lines.map((l) => ({ title: x.title(l.bookId), qty: l.qty }));
  await logActivity(u.id, `${u.name} asked ${x.dham(fromDhamId)} for ${sum(named)} (transfer #${id})`, { dhamId: toDhamId });
  await notify(await dhamManagers(fromDhamId), `${x.dham(toDhamId)} is asking for books`, sum(named), `/transfers/${id}`);
  revalidatePath("/transfers");
  return ok(`Request sent to ${x.dham(fromDhamId)}.`, "Their Sector Sevak will check and approve it. You will get a notification.", { label: "See this request", href: `/transfers/${id}` });
}

/* 2. The Dham that has the books approves (how many it can give) or declines. */
export async function approveTransfer(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser("admin", "manager");
  const id = Number(fd.get("id"));
  const x = await load(id);
  if (!x) return fail("This request was not found.");
  const { t } = x;
  if (!actsFor(u, t.fromDhamId)) return fail("Only the Sector Sevak of the sending Dham can approve this.");
  if (t.status !== "requested") return fail("This request was already answered.");
  const reply = String(fd.get("reply") || "").trim() || null;

  if (fd.get("decision") === "decline") {
    await db.update(schema.dhamTransfer).set({ status: "declined", reply, closedBy: u.id, closedAt: new Date() }).where(and(eq(schema.dhamTransfer.id, id), eq(schema.dhamTransfer.status, "requested")));
    await logActivity(u.id, `${u.name} declined transfer #${id} for ${x.dham(t.toDhamId)}`, { dhamId: t.fromDhamId });
    await notify(await dhamManagers(t.toDhamId), `${x.dham(t.fromDhamId)} declined your book request`, reply ?? undefined, `/transfers/${id}`);
    revalidatePath("/transfers");
    return ok("Request declined.", `${x.dham(t.toDhamId)} has been told.`);
  }

  const { lines: given, errors } = readQtys(fd, "send_");
  if (Object.keys(errors).length) return fail("Some quantities are not valid.", "Please enter whole numbers only.", errors);
  const shelf = await holderStock(H.dham(t.fromDhamId));
  const short: Record<string, string> = {};
  const plan = x.lines.map((l) => {
    const g = given.find((v) => v.bookId === l.bookId)?.qty ?? l.requestedQty;
    const have = shelf.get(l.bookId) ?? 0;
    if (g > l.requestedQty) short[`send_${l.bookId}`] = `They asked for ${num(l.requestedQty)}`;
    else if (g > have) short[`send_${l.bookId}`] = `Only ${num(have)} on your shelf`;
    return { lineId: l.id, bookId: l.bookId, qty: g };
  });
  if (Object.keys(short).length) return fail("Please check the quantities.", "You can give up to what was asked and what is on your shelf.", short);
  if (!plan.some((p) => p.qty > 0)) return fail("Nothing to give.", "Enter at least one copy, or decline the request.");

  await db.transaction(async (tx) => {
    for (const p of plan) await tx.update(schema.dhamTransferLine).set({ sentQty: p.qty }).where(eq(schema.dhamTransferLine.id, p.lineId));
    await tx.update(schema.dhamTransfer).set({ status: "approved", reply, approvedBy: u.id, approvedAt: new Date() }).where(eq(schema.dhamTransfer.id, id));
  });
  const named = plan.filter((p) => p.qty > 0).map((p) => ({ title: x.title(p.bookId), qty: p.qty }));
  await logActivity(u.id, `${u.name} approved transfer #${id}: ${sum(named)} for ${x.dham(t.toDhamId)}`, { dhamId: t.fromDhamId });
  await notify(await dhamManagers(t.toDhamId), `${x.dham(t.fromDhamId)} approved your book request`, sum(named), `/transfers/${id}`);
  revalidatePath("/transfers");
  return ok("Approved.", "Now pack the books and tap “Send books” when they leave your Dham.");
}

/* 3. Send: books leave the sending Dham's shelf and are "on the way". */
export async function sendTransfer(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser("admin", "manager");
  const id = Number(fd.get("id"));
  const x = await load(id);
  if (!x) return fail("This request was not found.");
  const { t } = x;
  if (!actsFor(u, t.fromDhamId)) return fail("Only the Sector Sevak of the sending Dham can send these books.");
  if (t.status !== "approved") return fail(t.status === "sent" ? "These books were already sent." : "Approve the request first.");
  const lines = x.lines.filter((l) => (l.sentQty ?? 0) > 0);
  const src = H.dham(t.fromDhamId);
  const date = todayIST();

  const short = await db.transaction(async (tx) => {
    await lockHolders(tx, [src]);
    const [cur] = await tx.select({ status: schema.dhamTransfer.status }).from(schema.dhamTransfer).where(eq(schema.dhamTransfer.id, id));
    if (cur?.status !== "approved") return "These books were already sent.";
    const shelf = await holderStock(src, tx);
    const bad = lines.filter((l) => l.sentQty! > (shelf.get(l.bookId) ?? 0));
    if (bad.length) return `Your shelf now has fewer copies of ${bad.map((l) => x.title(l.bookId)).join(", ")} than approved. Ask a Chakra Sevak or decline.`;
    await tx.insert(schema.stockMovement).values(
      lines.map((l) => ({
        kind: "transfer_out" as const, bookId: l.bookId, qty: l.sentQty!, fromHolder: src, toHolder: T(id),
        dhamId: t.fromDhamId, movementDate: date, reference: `transfer:${id}`, note: `To ${x.dham(t.toDhamId)}`, createdBy: u.id,
      })),
    );
    await tx.update(schema.dhamTransfer).set({ status: "sent", sentBy: u.id, sentAt: new Date() }).where(eq(schema.dhamTransfer.id, id));
    return null;
  });
  if (short) return fail("Could not send.", short);
  const named = lines.map((l) => ({ title: x.title(l.bookId), qty: l.sentQty! }));
  await logActivity(u.id, `${u.name} sent ${sum(named)} to ${x.dham(t.toDhamId)} (transfer #${id})`, { dhamId: t.fromDhamId });
  await notify(await dhamManagers(t.toDhamId), `Books are on the way from ${x.dham(t.fromDhamId)} 🚚`, `${sum(named)}. Tap “Received” when they arrive.`, `/transfers/${id}`);
  revalidatePath("/transfers");
  revalidatePath("/stock");
  return ok("Books sent.", `They left your shelf. ${x.dham(t.toDhamId)} will confirm when they arrive.`);
}

/* 4. Receive: the asking Dham confirms; books land on its shelf. */
export async function receiveTransfer(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser("admin", "manager");
  const id = Number(fd.get("id"));
  const x = await load(id);
  if (!x) return fail("This request was not found.");
  const { t } = x;
  if (!actsFor(u, t.toDhamId)) return fail("Only the Sector Sevak of the receiving Dham can confirm this.");
  if (t.status !== "sent") return fail(t.status === "received" ? "Already received." : "These books have not been sent yet.");
  const lines = x.lines.filter((l) => (l.sentQty ?? 0) > 0);
  const date = todayIST();
  const done = await db.transaction(async (tx) => {
    await lockHolders(tx, [T(id)]);
    const [cur] = await tx.select({ status: schema.dhamTransfer.status }).from(schema.dhamTransfer).where(eq(schema.dhamTransfer.id, id));
    if (cur?.status !== "sent") return false;
    await tx.insert(schema.stockMovement).values(
      lines.map((l) => ({
        kind: "transfer_in" as const, bookId: l.bookId, qty: l.sentQty!, fromHolder: T(id), toHolder: H.dham(t.toDhamId),
        dhamId: t.toDhamId, movementDate: date, reference: `transfer:${id}`, note: `From ${x.dham(t.fromDhamId)}`, createdBy: u.id,
      })),
    );
    await tx.update(schema.dhamTransfer).set({ status: "received", receivedBy: u.id, receivedAt: new Date() }).where(eq(schema.dhamTransfer.id, id));
    return true;
  });
  if (!done) return fail("Already received.");
  const named = lines.map((l) => ({ title: x.title(l.bookId), qty: l.sentQty! }));
  await logActivity(u.id, `${u.name} received ${sum(named)} from ${x.dham(t.fromDhamId)} (transfer #${id})`, { dhamId: t.toDhamId });
  await notify(await dhamManagers(t.fromDhamId), `${x.dham(t.toDhamId)} received your books ✅`, sum(named), `/transfers/${id}`);
  revalidatePath("/transfers");
  revalidatePath("/stock");
  return ok("Books received. 🙏", `${sum(named)} are now on your Dham shelf and can be given to devotees.`, { label: "Assign to devotees", href: "/stock/assign-devotees" });
}

/* The asking Dham can cancel before the books are sent. */
export async function cancelTransfer(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser("admin", "manager");
  const id = Number(fd.get("id"));
  const x = await load(id);
  if (!x) return fail("This request was not found.");
  const { t } = x;
  if (!actsFor(u, t.toDhamId)) return fail("Only the Dham that asked can cancel this request.");
  if (t.status !== "requested" && t.status !== "approved") return fail("This can no longer be cancelled.", "The books are already sent.");
  const r = await db.update(schema.dhamTransfer).set({ status: "cancelled", closedBy: u.id, closedAt: new Date() })
    .where(and(eq(schema.dhamTransfer.id, id), inArray(schema.dhamTransfer.status, ["requested", "approved"]))).returning({ id: schema.dhamTransfer.id });
  if (!r.length) return fail("This can no longer be cancelled.");
  await logActivity(u.id, `${u.name} cancelled transfer #${id}`, { dhamId: t.toDhamId });
  await notify(await dhamManagers(t.fromDhamId), `${x.dham(t.toDhamId)} cancelled their book request`, undefined, `/transfers/${id}`);
  revalidatePath("/transfers");
  return ok("Request cancelled.");
}
