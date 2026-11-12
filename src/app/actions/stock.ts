"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { fail, fromZod, ok, type ActionState } from "@/lib/action";
import { requireUser } from "@/lib/session";
import { logActivity, notify, dhamManagers } from "@/lib/activity";
import { H, holderStock, lockHolders, pendingReportedQty } from "@/lib/stock";
import { findCampaign } from "@/lib/campaign";
import { reverseMovements } from "@/lib/ledger";
import { num, todayIST } from "@/lib/format";

const dateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Please choose a date.")
  .refine((v) => v <= todayIST(), "The date cannot be in the future.");

/** Reads qty_<bookId> fields into a list of positive quantities. */
function readQtys(fd: FormData) {
  const out: { bookId: number; qty: number }[] = [];
  const errors: Record<string, string> = {};
  for (const [k, v] of fd.entries()) {
    if (!k.startsWith("qty_")) continue;
    const raw = String(v).trim();
    if (!raw) continue;
    const n = Number(raw);
    const bookId = Number(k.slice(4));
    if (!Number.isInteger(n) || n < 0) errors[k] = "Enter a whole number";
    else if (n > 0) out.push({ bookId, qty: n });
  }
  return { lines: out, errors };
}

function summary(lines: { title: string; qty: number }[]) {
  return lines.map((l) => `${num(l.qty)} × ${l.title}`).join(", ");
}

/* ---------------- STEP 2: Receive Books ---------------- */

export async function receiveBooks(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser("admin", "manager");
  const p = z
    .object({
      bookId: z.coerce.number({ invalid_type_error: "Please choose a book." }).int().positive("Please choose a book."),
      qty: z.coerce.number({ invalid_type_error: "Enter how many copies arrived." }).int("Enter a whole number.").positive("Enter how many copies arrived."),
      date: dateField,
      destination: z.string().default("central"),
      reference: z.string().trim().optional(),
      note: z.string().trim().optional(),
    })
    .safeParse(Object.fromEntries(fd));
  if (!p.success) return fromZod(p.error);
  const d = p.data;

  let dhamId: number | null = null;
  if (u.role === "manager") dhamId = u.dhamId;
  else if (d.destination !== "central") dhamId = Number(d.destination);

  const [b] = await db.select().from(schema.book).where(eq(schema.book.id, d.bookId));
  if (!b) return fail("Please choose a book from the list.");
  let placeName = "the Central Store";
  if (dhamId) {
    const [dh] = await db.select().from(schema.dham).where(eq(schema.dham.id, dhamId));
    if (!dh) return fail("Please choose where the books arrived.");
    placeName = dh.name;
  }
  const campaign = await findCampaign(dhamId, d.date);
  await db.insert(schema.stockMovement).values({
    kind: "received",
    bookId: b.id,
    qty: d.qty,
    fromHolder: "external",
    toHolder: dhamId ? H.dham(dhamId) : H.central,
    dhamId,
    campaignId: campaign?.id,
    movementDate: d.date,
    reference: d.reference || null,
    note: d.note || null,
    createdBy: u.id,
  });
  await logActivity(u.id, `${u.name} received ${num(d.qty)} copies of "${b.title}" at ${placeName}`, { dhamId });
  revalidatePath("/stock");
  const stock = await holderStock(dhamId ? H.dham(dhamId) : H.central);
  return ok(
    `Successfully received ${num(d.qty)} copies of ${b.title}.`,
    `${placeName} now has ${num(stock.get(b.id) ?? 0)} copies of ${b.title} available.`,
    dhamId
      ? { label: "Assign these books to devotees", href: "/stock/assign-devotees" }
      : { label: "Send these books to a Dham", href: "/stock/assign-dham" },
  );
}

/* ---------------- STEP 3: Assign Books to Dham ---------------- */

export async function assignToDham(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser("admin");
  const dhamId = Number(fd.get("dhamId"));
  const date = String(fd.get("date") || todayIST());
  const note = String(fd.get("note") || "").trim() || null;
  if (!dhamId) return fail("Please choose the Dham.", undefined, { dhamId: "Please choose the Dham." });
  const [dh] = await db.select().from(schema.dham).where(eq(schema.dham.id, dhamId));
  if (!dh) return fail("Please choose the Dham.");
  const { lines, errors } = readQtys(fd);
  if (Object.keys(errors).length) return fail("Some quantities are not valid.", "Please enter whole numbers only.", errors);
  if (!lines.length) return fail("Please enter how many copies to send.", "Type a quantity next to at least one book.");

  const books = await db.select().from(schema.book).where(inArray(schema.book.id, lines.map((l) => l.bookId)));
  const title = (id: number) => books.find((b) => b.id === id)?.title ?? "Book";
  const campaign = await findCampaign(dhamId, date);

  // Check-and-take inside one transaction, holding a lock on the Central Store,
  // so two people sending books at the same moment can never over-allocate.
  const short = await db.transaction(async (tx) => {
    await lockHolders(tx, [H.central]);
    const central = await holderStock(H.central, tx);
    const short: Record<string, string> = {};
    for (const l of lines) {
      const have = central.get(l.bookId) ?? 0;
      if (l.qty > have) short[`qty_${l.bookId}`] = `Only ${num(have)} available in the Central Store`;
    }
    if (Object.keys(short).length) return short;
    await tx.insert(schema.stockMovement).values(
    lines.map((l) => ({
      kind: "assign_dham" as const,
      bookId: l.bookId,
      qty: l.qty,
      fromHolder: H.central,
      toHolder: H.dham(dhamId),
      dhamId,
      campaignId: campaign?.id,
      movementDate: date,
      note,
      createdBy: u.id,
    })),
    );
    return null;
  });
  if (short)
    return fail("You are sending more books than are available.", "Please reduce the highlighted quantities, or receive more books first.", short);
  const named = lines.map((l) => ({ title: title(l.bookId), qty: l.qty }));
  await logActivity(u.id, `${u.name} sent ${summary(named)} to ${dh.name}`, { dhamId });
  await notify(await dhamManagers(dhamId), `New books for ${dh.name}`, summary(named), "/stock");
  revalidatePath("/stock");
  const totalQty = lines.reduce((a, l) => a + l.qty, 0);
  return ok(
    `${num(totalQty)} books assigned to ${dh.name}.`,
    `${summary(named)}. The Dham Manager has been notified and can now give these books to devotees.`,
    { label: "View Book Stock", href: "/stock" },
  );
}

/* ---------------- STEP 4: Assign Books to Devotees ---------------- */

export async function assignToDevotee(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser("admin", "manager");
  const devoteeId = String(fd.get("devoteeId") || "");
  const date = String(fd.get("date") || todayIST());
  const note = String(fd.get("note") || "").trim() || null;
  if (!devoteeId) return fail("Please choose the devotee.", undefined, { devoteeId: "Please choose the devotee." });
  const [dev] = await db
    .select()
    .from(schema.user)
    .where(and(eq(schema.user.id, devoteeId), inArray(schema.user.role, ["devotee", "manager"])));
  if (!dev || !dev.dhamId) return fail("Please choose the devotee.");
  if (u.role === "manager" && dev.dhamId !== u.dhamId) return fail("This devotee belongs to another Dham.");
  const dhamId = dev.dhamId;

  const { lines, errors } = readQtys(fd);
  if (Object.keys(errors).length) return fail("Some quantities are not valid.", "Please enter whole numbers only.", errors);
  if (!lines.length) return fail("Please enter how many copies to give.", "Type a quantity next to at least one book.");

  const books = await db.select().from(schema.book).where(inArray(schema.book.id, lines.map((l) => l.bookId)));
  const title = (id: number) => books.find((b) => b.id === id)?.title ?? "Book";
  const campaign = await findCampaign(dhamId, date);

  // Lock the Dham store while checking and taking, so simultaneous assignments can't over-allocate.
  const short = await db.transaction(async (tx) => {
    await lockHolders(tx, [H.dham(dhamId)]);
    const store = await holderStock(H.dham(dhamId), tx);
    const short: Record<string, string> = {};
    for (const l of lines) {
      const have = store.get(l.bookId) ?? 0;
      if (l.qty > have) short[`qty_${l.bookId}`] = `Only ${num(have)} available in the Dham`;
    }
    if (Object.keys(short).length) return short;
    await tx.insert(schema.stockMovement).values(
    lines.map((l) => ({
      kind: "assign_devotee" as const,
      bookId: l.bookId,
      qty: l.qty,
      fromHolder: H.dham(dhamId),
      toHolder: H.devotee(devoteeId),
      dhamId,
      devoteeId,
      campaignId: campaign?.id,
      movementDate: date,
      note,
      createdBy: u.id,
    })),
    );
    return null;
  });
  if (short) return fail("You are giving more books than the Dham has.", "Please reduce the highlighted quantities.", short);
  const named = lines.map((l) => ({ title: title(l.bookId), qty: l.qty }));
  await logActivity(u.id, `${u.name} gave ${summary(named)} to ${dev.name}`, { dhamId });
  await notify([devoteeId], "New books given to you 📚", summary(named), "/my/books");
  revalidatePath("/stock");
  return ok(
    `Books assigned to ${dev.name}: ${summary(named)}.`,
    `${dev.name.split(" ")[0]} can see these books on their phone right away and record sales for them.`,
    { label: "Assign books to another devotee", href: "/stock/assign-devotees" },
  );
}

/* ---------------- Take books back from a devotee ---------------- */

export async function takeBack(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser("admin", "manager");
  const devoteeId = String(fd.get("devoteeId") || "");
  const kind: "damaged" | "returned" = fd.get("kind") === "damaged" ? "damaged" : "returned";
  const note = String(fd.get("note") || "").trim();
  const [dev] = await db.select().from(schema.user).where(eq(schema.user.id, devoteeId));
  if (!dev || !dev.dhamId) return fail("Please choose the devotee.");
  if (u.role === "manager" && dev.dhamId !== u.dhamId) return fail("This devotee belongs to another Dham.");
  if (kind === "damaged" && !note) return fail("Please write what happened to the books.", undefined, { note: "Reason is required for damaged or lost books." });
  const { lines, errors } = readQtys(fd);
  if (Object.keys(errors).length) return fail("Some quantities are not valid.", undefined, errors);
  if (!lines.length) return fail("Please enter a quantity for at least one book.");
  const books = await db.select().from(schema.book).where(inArray(schema.book.id, lines.map((l) => l.bookId)));
  const date = todayIST();
  const short = await db.transaction(async (tx) => {
    await lockHolders(tx, [H.devotee(devoteeId)]);
    const hold = await holderStock(H.devotee(devoteeId), tx);
    const pending = await pendingReportedQty(devoteeId, undefined, tx);
    const short: Record<string, string> = {};
    for (const l of lines) {
      const free = (hold.get(l.bookId) ?? 0) - (pending.get(l.bookId) ?? 0);
      if (l.qty > free) short[`qty_${l.bookId}`] = `Only ${num(Math.max(free, 0))} with the devotee`;
    }
    if (Object.keys(short).length) return short;
    await tx.insert(schema.stockMovement).values(
    lines.map((l) => ({
      kind,
      bookId: l.bookId,
      qty: l.qty,
      fromHolder: H.devotee(devoteeId),
      toHolder: kind === "damaged" ? "damaged" : H.dham(dev.dhamId!),
      dhamId: dev.dhamId,
      devoteeId,
      movementDate: date,
      note: note || null,
      createdBy: u.id,
    })),
    );
    return null;
  });
  if (short) return fail("The devotee does not have that many copies.", "Some copies may be in a report that is still being reviewed.", short);
  const named = lines.map((l) => ({ title: books.find((b) => b.id === l.bookId)?.title ?? "Book", qty: l.qty }));
  const verb = kind === "damaged" ? "recorded as damaged/lost" : "returned to the Dham";
  await logActivity(u.id, `${u.name}: ${summary(named)} from ${dev.name} ${verb}`, { dhamId: dev.dhamId });
  await notify([devoteeId], kind === "damaged" ? "Books marked as damaged/lost" : "Books taken back by your Manager", summary(named), "/my/books");
  revalidatePath("/stock");
  return ok(`${summary(named)} ${verb}.`, "Stock has been updated for both the devotee and the Dham.");
}

/* ---------------- Undo a book movement ---------------- */

export async function undoMovement(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser("admin", "manager");
  const id = Number(fd.get("id"));
  const [m] = await db.select().from(schema.stockMovement).where(eq(schema.stockMovement.id, id));
  if (!m) return fail("This entry was not found.");
  if (m.reversedBy) return fail("This was already undone.");
  if (m.kind === "correction") return fail("An undo can't be undone. Record the books again instead.");
  if (m.reportId) return fail("This came from a daily report.", "Delete that report instead — its stock is reversed with it.");
  if (u.role === "manager" && m.dhamId !== u.dhamId) return fail("This belongs to another Dham.");
  if (u.role === "manager" && m.kind === "assign_dham") return fail("Only the Admin can undo books sent to a Dham.");
  const err = await db.transaction((tx) => reverseMovements(tx, [id], u.id, `Undone by ${u.name}`));
  if (err) return fail("This can't be undone.", err);
  const [b] = await db.select({ title: schema.book.title }).from(schema.book).where(eq(schema.book.id, m.bookId));
  await logActivity(u.id, `${u.name} undid: ${num(m.qty)} × ${b?.title ?? "book"} (${m.kind.replace("_", " ")}, ${m.movementDate})`, { dhamId: m.dhamId });
  revalidatePath("/stock");
  return ok("Undone.", `${num(m.qty)} × ${b?.title ?? "book"} moved back. Both entries stay in the history.`);
}
