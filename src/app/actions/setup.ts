"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db, schema } from "@/db";
import { fail, fromZod, ok, type ActionState } from "@/lib/action";
import { requireUser } from "@/lib/session";
import { logActivity, notify } from "@/lib/activity";
import { hashPassword } from "@/lib/auth";
import { inr, toPaise } from "@/lib/format";
import { APP_NAME } from "@/lib/brand";

const s = (min = 1, msg = "This field is required.") => z.string().trim().min(min, msg);
const opt = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : null));

/* ---------------- Organisation ---------------- */

export async function saveOrganization(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser("admin");
  const p = z
    .object({ name: s(2, "Please enter the organisation name."), city: opt, contactPhone: opt })
    .safeParse(Object.fromEntries(fd));
  if (!p.success) return fromZod(p.error);
  const [existing] = await db.select().from(schema.organization).limit(1);
  if (existing) await db.update(schema.organization).set(p.data).where(eq(schema.organization.id, existing.id));
  else await db.insert(schema.organization).values(p.data);
  await logActivity(u.id, `${u.name} updated the organisation details`);
  revalidatePath("/", "layout");
  return ok("Organisation details saved.", "Next, add the Dhams where books will be distributed.", { label: "Add Dhams", href: "/dhams" });
}

/* ---------------- Dhams ---------------- */

export async function addDham(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser("admin");
  const p = z
    .object({ name: s(2, "Please enter the Dham name."), city: opt, address: opt })
    .safeParse(Object.fromEntries(fd));
  if (!p.success) return fromZod(p.error);
  const [d] = await db.insert(schema.dham).values(p.data).returning();
  await logActivity(u.id, `${u.name} added the Dham "${d.name}"`, { dhamId: d.id, entity: "dham", entityId: d.id });
  revalidatePath("/dhams");
  return ok(`"${d.name}" has been added.`, "You can now add a Dham Manager for it and send books to it.", {
    label: "Add a Manager for this Dham",
    href: "/people?role=manager",
  });
}

export async function toggleDham(fd: FormData) {
  const u = await requireUser("admin");
  const id = Number(fd.get("id"));
  const [d] = await db.select().from(schema.dham).where(eq(schema.dham.id, id));
  if (!d) return;
  await db.update(schema.dham).set({ isActive: !d.isActive }).where(eq(schema.dham.id, id));
  await logActivity(u.id, `${u.name} marked "${d.name}" as ${d.isActive ? "inactive" : "active"}`, { dhamId: id });
  revalidatePath("/dhams");
}

export async function updateDham(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser("admin");
  const p = z
    .object({ id: z.coerce.number().int().positive(), name: s(2, "Please enter the Dham name."), city: opt, address: opt })
    .safeParse(Object.fromEntries(fd));
  if (!p.success) return fromZod(p.error);
  const { id, ...rest } = p.data;
  await db.update(schema.dham).set(rest).where(eq(schema.dham.id, id));
  await logActivity(u.id, `${u.name} updated the Dham "${rest.name}"`, { dhamId: id });
  revalidatePath("/dhams");
  return ok("Changes saved.");
}

/* ---------------- Books & prices ---------------- */

const BookSchema = z.object({
  title: s(2, "Please enter the book name."),
  sku: z
    .string()
    .trim()
    .min(2, "Please enter a short Book Code, e.g. BG-EN.")
    .max(30, "Book Code is too long.")
    .transform((v) => v.toUpperCase()),
  language: s(2, "Please enter the language."),
  price: z
    .string()
    .trim()
    .min(1, "Please enter the price.")
    .refine((v) => toPaise(v) > 0, "Price must be more than ₹0."),
  coverUrl: opt,
  size: z.enum(["big", "small"], { errorMap: () => ({ message: "Please choose Big book or Small book." }) }),
});

export async function addBook(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser("admin");
  const p = BookSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return fromZod(p.error);
  const [dup] = await db.select().from(schema.book).where(eq(schema.book.sku, p.data.sku));
  if (dup) return fail("This Book Code is already used.", `"${dup.title}" already has the code ${dup.sku}. Please choose a different code.`, { sku: "Already used" });
  const pricePaise = toPaise(p.data.price);
  const [b] = await db
    .insert(schema.book)
    .values({ title: p.data.title, sku: p.data.sku, language: p.data.language, coverUrl: p.data.coverUrl, size: p.data.size, pricePaise })
    .onConflictDoNothing()
    .returning();
  if (!b) return fail("This Book Code is already used.", "Someone may have just added it. Please choose a different code.", { sku: "Already used" });
  await db.insert(schema.bookPriceHistory).values({ bookId: b.id, newPricePaise: pricePaise, changedBy: u.id });
  await logActivity(u.id, `${u.name} added the ${b.size === "big" ? "big" : "small"} book "${b.title}" at ${inr(pricePaise)}`, { entity: "book", entityId: b.id });
  revalidatePath("/books");
  return ok(`"${b.title}" has been added to the book list.`, "When copies arrive, use Receive Books to add them to stock.", {
    label: "Receive Books",
    href: "/stock/receive",
  });
}

export async function updateBook(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser("admin");
  const p = BookSchema.omit({ price: true })
    .extend({ id: z.coerce.number().int().positive() })
    .safeParse(Object.fromEntries(fd));
  if (!p.success) return fromZod(p.error);
  const { id, ...rest } = p.data;
  const [dup] = await db
    .select()
    .from(schema.book)
    .where(and(eq(schema.book.sku, rest.sku), ne(schema.book.id, id)));
  if (dup) return fail("This Book Code is already used by another book.", undefined, { sku: "Already used" });
  await db.update(schema.book).set(rest).where(eq(schema.book.id, id));
  await logActivity(u.id, `${u.name} updated details of "${rest.title}"`, { entity: "book", entityId: id });
  revalidatePath("/books");
  return ok("Changes saved.");
}

export async function toggleBook(fd: FormData) {
  const u = await requireUser("admin");
  const id = Number(fd.get("id"));
  const [b] = await db.select().from(schema.book).where(eq(schema.book.id, id));
  if (!b) return;
  await db.update(schema.book).set({ isActive: !b.isActive }).where(eq(schema.book.id, id));
  await logActivity(u.id, `${u.name} marked "${b.title}" as ${b.isActive ? "inactive" : "active"}`);
  revalidatePath("/books");
}

/** Update many prices at once. Field names: price_<bookId>. */
export async function updatePrices(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser("admin");
  const books = await db.select().from(schema.book);
  const changes: { id: number; title: string; old: number; next: number }[] = [];
  const errors: Record<string, string> = {};
  for (const b of books) {
    const raw = fd.get(`price_${b.id}`);
    if (raw == null || String(raw).trim() === "") continue;
    const next = toPaise(String(raw));
    if (!(next > 0)) {
      errors[`price_${b.id}`] = "Enter a price above ₹0";
      continue;
    }
    if (next !== b.pricePaise) changes.push({ id: b.id, title: b.title, old: b.pricePaise, next });
  }
  if (Object.keys(errors).length) return fail("Some prices are not valid.", "Please correct the highlighted prices.", errors);
  if (!changes.length) return fail("No prices were changed.", "Type a new price in a box, then press Save New Prices.");
  for (const c of changes) {
    await db.update(schema.book).set({ pricePaise: c.next }).where(eq(schema.book.id, c.id));
    await db.insert(schema.bookPriceHistory).values({ bookId: c.id, oldPricePaise: c.old, newPricePaise: c.next, changedBy: u.id });
    await logActivity(u.id, `${u.name} changed the price of "${c.title}" from ${inr(c.old)} to ${inr(c.next)}`, { entity: "book", entityId: c.id });
  }
  revalidatePath("/books");
  return ok(
    `${changes.length} price${changes.length > 1 ? "s" : ""} updated.`,
    "New prices apply to sales reports from now on. Reports already submitted keep the price at which the books were sold.",
  );
}

/* ---------------- People ---------------- */

const PersonSchema = z
  .object({
    name: s(2, "Please enter the full name."),
    role: z.enum(["manager", "devotee", "admin"]),
    phone: z
      .string()
      .trim()
      .transform((v) => v.replace(/[^\d]/g, "").slice(-10))
      .refine((v) => v.length === 10, "Please enter a 10-digit mobile number."),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .optional()
      .transform((v) => (v ? v : null))
      .refine((v) => !v || z.string().email().safeParse(v).success, "Please enter a valid email address or leave it empty."),
    dhamId: z.coerce.number().int().optional(),
    password: z.string().min(6, "Password must have at least 6 characters."),
  })
  .refine((v) => v.role === "admin" || (v.dhamId && v.dhamId > 0), { path: ["dhamId"], message: "Please choose the Dham." });

export async function addPerson(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser("admin", "manager");
  const raw = Object.fromEntries(fd);
  if (u.role === "manager") {
    raw.role = "devotee";
    raw.dhamId = String(u.dhamId);
  }
  const p = PersonSchema.safeParse(raw);
  if (!p.success) return fromZod(p.error);
  const d = p.data;
  const [phoneDup] = await db.select().from(schema.user).where(eq(schema.user.phone, d.phone));
  if (phoneDup) return fail("This mobile number is already registered.", `It belongs to ${phoneDup.name}.`, { phone: "Already registered" });
  const email = d.email ?? `m${d.phone}@users.gaurangadham.local`;
  const [emailDup] = await db.select().from(schema.user).where(eq(schema.user.email, email));
  if (emailDup) return fail("This email is already registered.", `It belongs to ${emailDup.name}.`, { email: "Already registered" });

  const id = randomUUID();
  const password = await hashPassword(d.password);
  try {
    await db.transaction(async (tx) => {
      await tx.insert(schema.user).values({
        id,
        name: d.name,
        email,
        emailVerified: true,
        role: d.role,
        phone: d.phone,
        dhamId: d.role === "admin" ? null : d.dhamId!,
      });
      await tx.insert(schema.account).values({ id: randomUUID(), accountId: id, providerId: "credential", userId: id, password });
    });
  } catch (e) {
    if ((e as { cause?: { code?: string } })?.cause?.code === "23505" || (e as { code?: string })?.code === "23505")
      return fail("This mobile number or email is already registered.", "Someone may have just added this person.", { phone: "Already registered" });
    throw e;
  }
  const roleWord = d.role === "manager" ? "Dham Manager" : d.role === "admin" ? "Admin" : "Devotee";
  await logActivity(u.id, `${u.name} added ${d.name} as ${roleWord}`, { dhamId: d.dhamId ?? null, entity: "user", entityId: id });
  await notify([id], `Welcome to ${APP_NAME} 🙏`, "Your account is ready. Take the short tour to get started.", "/welcome");
  revalidatePath("/people");
  return ok(
    `${d.name} has been added as ${roleWord}.`,
    `They can log in with mobile number ${d.phone} and the password you set. Please share it with them personally.`,
    d.role === "devotee" ? { label: `Assign books to ${d.name.split(" ")[0]}`, href: `/stock/assign-devotees?devotee=${id}` } : undefined,
  );
}

export async function togglePerson(fd: FormData) {
  const u = await requireUser("admin", "manager");
  const id = String(fd.get("id"));
  const [p] = await db.select().from(schema.user).where(eq(schema.user.id, id));
  if (!p || p.id === u.id) return;
  if (u.role === "manager" && (p.dhamId !== u.dhamId || p.role !== "devotee")) return;
  await db.update(schema.user).set({ isActive: !p.isActive }).where(eq(schema.user.id, id));
  if (p.isActive) await db.delete(schema.session).where(eq(schema.session.userId, id));
  await logActivity(u.id, `${u.name} marked ${p.name} as ${p.isActive ? "inactive" : "active"}`, { dhamId: p.dhamId });
  revalidatePath("/people");
}

export async function resetPassword(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser("admin", "manager");
  const p = z
    .object({ id: z.string().min(1), password: z.string().min(6, "Password must have at least 6 characters.") })
    .safeParse(Object.fromEntries(fd));
  if (!p.success) return fromZod(p.error);
  const [target] = await db.select().from(schema.user).where(eq(schema.user.id, p.data.id));
  if (!target) return fail("Person not found.");
  if (u.role === "manager" && (target.dhamId !== u.dhamId || target.role !== "devotee"))
    return fail("You can only reset passwords for devotees of your own Dham.");
  await db
    .update(schema.account)
    .set({ password: await hashPassword(p.data.password) })
    .where(and(eq(schema.account.userId, target.id), eq(schema.account.providerId, "credential")));
  await logActivity(u.id, `${u.name} reset the password of ${target.name}`, { dhamId: target.dhamId });
  return ok(`Password for ${target.name} has been reset.`, "Please share the new password with them personally.");
}

/* ---------------- Distribution Drives ---------------- */

export async function addDrive(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser("admin");
  const p = z
    .object({
      name: s(2, "Please give the drive a name, e.g. Kartik Marathon 2026."),
      description: opt,
      dhamId: z.coerce.number().int().optional().transform((v) => (v ? v : null)),
      startDate: s(10, "Please choose the start date."),
      endDate: opt,
    })
    .refine((v) => !v.endDate || v.endDate >= v.startDate, { path: ["endDate"], message: "End date must be after the start date." })
    .safeParse(Object.fromEntries(fd));
  if (!p.success) return fromZod(p.error);
  const [c] = await db.insert(schema.campaign).values(p.data).returning();
  await logActivity(u.id, `${u.name} created the distribution drive "${c.name}"`, { dhamId: c.dhamId });
  revalidatePath("/drives");
  return ok(`Distribution drive "${c.name}" created.`, "Daily reports during these dates will be counted under this drive.");
}

export async function toggleDrive(fd: FormData) {
  const u = await requireUser("admin");
  const id = Number(fd.get("id"));
  const [c] = await db.select().from(schema.campaign).where(eq(schema.campaign.id, id));
  if (!c) return;
  await db.update(schema.campaign).set({ isActive: !c.isActive }).where(eq(schema.campaign.id, id));
  await logActivity(u.id, `${u.name} marked drive "${c.name}" as ${c.isActive ? "inactive" : "active"}`);
  revalidatePath("/drives");
}

/* ---------------- Notifications ---------------- */

export async function markAllRead() {
  const u = await requireUser();
  await db.update(schema.notification).set({ isRead: true }).where(eq(schema.notification.userId, u.id));
  revalidatePath("/", "layout");
}

/* ================================================================== */
/* Delete & edit                                                       */
/* A record that already has history (sales, stock, money) can't be     */
/* deleted — it would break the books. Mark it inactive instead.        */
/* ================================================================== */

const cnt = async (q: ReturnType<typeof sql>) => Number(((await db.execute(q)) as unknown as { n: number }[])[0]?.n ?? 0);

export async function deleteDham(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser("admin");
  const id = Number(fd.get("id"));
  const [d] = await db.select().from(schema.dham).where(eq(schema.dham.id, id));
  if (!d) return fail("This Dham was already deleted.");
  const used =
    (await cnt(sql`select count(*)::int n from "user" where dham_id = ${id}`)) +
    (await cnt(sql`select count(*)::int n from stock_movement where dham_id = ${id}`)) +
    (await cnt(sql`select count(*)::int n from daily_report where dham_id = ${id}`));
  if (used) return fail(`"${d.name}" has people or history, so it can't be deleted.`, "Use “Mark as Inactive” instead — its history stays safe.");
  await db.update(schema.campaign).set({ dhamId: null }).where(eq(schema.campaign.dhamId, id));
  await db.delete(schema.dham).where(eq(schema.dham.id, id));
  await logActivity(u.id, `${u.name} deleted the Dham "${d.name}"`);
  revalidatePath("/dhams");
  return ok(`"${d.name}" deleted.`);
}

export async function deleteBook(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser("admin");
  const id = Number(fd.get("id"));
  const [b] = await db.select().from(schema.book).where(eq(schema.book.id, id));
  if (!b) return fail("This book was already deleted.");
  const used =
    (await cnt(sql`select count(*)::int n from stock_movement where book_id = ${id}`)) +
    (await cnt(sql`select count(*)::int n from daily_report_line where book_id = ${id}`));
  if (used) return fail(`"${b.title}" has stock or sales history, so it can't be deleted.`, "Use “Mark as Inactive” to hide it from new receipts and sales.");
  await db.delete(schema.bookPriceHistory).where(eq(schema.bookPriceHistory.bookId, id));
  await db.delete(schema.book).where(eq(schema.book.id, id));
  await logActivity(u.id, `${u.name} deleted the book "${b.title}" (${b.language})`);
  revalidatePath("/books");
  return ok(`"${b.title}" deleted.`);
}

export async function deletePerson(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser("admin", "manager");
  const id = String(fd.get("id"));
  const [p] = await db.select().from(schema.user).where(eq(schema.user.id, id));
  if (!p) return fail("This person was already deleted.");
  if (p.id === u.id) return fail("You can't delete your own account.");
  if (u.role === "manager" && (p.dhamId !== u.dhamId || p.role !== "devotee")) return fail("You can only delete devotees of your own Dham.");
  const used =
    (await cnt(sql`select count(*)::int n from daily_report where devotee_id = ${id}`)) +
    (await cnt(sql`select count(*)::int n from stock_movement where devotee_id = ${id} or created_by = ${id}`)) +
    (await cnt(sql`select count(*)::int n from money_submission where devotee_id = ${id}`));
  if (used) return fail(`${p.name} has books, sales or money history, so the account can't be deleted.`, "Use “Mark as Inactive” — they can't log in, and their history stays correct.");
  await db.delete(schema.notification).where(eq(schema.notification.userId, id));
  await db.delete(schema.user).where(eq(schema.user.id, id)); // sessions & login cascade
  await logActivity(u.id, `${u.name} deleted the account of ${p.name}`, { dhamId: p.dhamId });
  revalidatePath("/people");
  return ok(`${p.name}'s account deleted.`);
}

const EditPerson = z.object({
  id: z.string().min(1),
  name: s(2, "Please enter the full name."),
  phone: z
    .string()
    .trim()
    .transform((v) => v.replace(/[^\d]/g, "").slice(-10))
    .refine((v) => v.length === 10, "Please enter a 10-digit mobile number."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => !v || z.string().email().safeParse(v).success, "Please enter a valid email or leave it empty."),
  dhamId: z.coerce.number().int().optional(),
  role: z.enum(["manager", "devotee", "admin"]).optional(),
});

export async function updatePerson(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser("admin", "manager");
  const p = EditPerson.safeParse(Object.fromEntries(fd));
  if (!p.success) return fromZod(p.error);
  const d = p.data;
  const [cur] = await db.select().from(schema.user).where(eq(schema.user.id, d.id));
  if (!cur) return fail("Person not found.");
  if (u.role === "manager" && (cur.dhamId !== u.dhamId || cur.role !== "devotee")) return fail("You can only edit devotees of your own Dham.");
  const [dup] = await db.select().from(schema.user).where(and(eq(schema.user.phone, d.phone), ne(schema.user.id, d.id)));
  if (dup) return fail("This mobile number belongs to someone else.", `It is ${dup.name}'s number.`, { phone: "Already registered" });
  const email = d.email ?? (cur.email.endsWith("@users.gaurangadham.local") ? `m${d.phone}@users.gaurangadham.local` : cur.email);
  const [dupE] = await db.select().from(schema.user).where(and(eq(schema.user.email, email), ne(schema.user.id, d.id)));
  if (dupE) return fail("This email belongs to someone else.", undefined, { email: "Already registered" });
  const role = u.role === "admin" && d.role ? d.role : cur.role;
  const dhamId = role === "admin" ? null : u.role === "admin" && d.dhamId ? d.dhamId : cur.dhamId;
  if (role !== "admin" && !dhamId) return fail("Please choose the Dham.", undefined, { dhamId: "Please choose the Dham." });
  if (cur.id === u.id && role !== cur.role) return fail("You can't change your own role.");
  await db.update(schema.user).set({ name: d.name, phone: d.phone, email, role, dhamId, updatedAt: new Date() }).where(eq(schema.user.id, d.id));
  await logActivity(u.id, `${u.name} updated the details of ${d.name}`, { dhamId });
  revalidatePath("/people");
  return ok("Changes saved.", d.phone !== cur.phone ? `${d.name} now logs in with ${d.phone}.` : undefined);
}

export async function deleteDrive(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser("admin");
  const id = Number(fd.get("id"));
  const [c] = await db.select().from(schema.campaign).where(eq(schema.campaign.id, id));
  if (!c) return fail("This drive was already deleted.");
  // Reports and stock stay; they simply stop being tagged with this drive.
  await db.update(schema.dailyReport).set({ campaignId: null }).where(eq(schema.dailyReport.campaignId, id));
  await db.update(schema.stockMovement).set({ campaignId: null }).where(eq(schema.stockMovement.campaignId, id));
  await db.delete(schema.campaign).where(eq(schema.campaign.id, id));
  await logActivity(u.id, `${u.name} deleted the distribution drive "${c.name}"`);
  revalidatePath("/drives");
  return ok(`Drive "${c.name}" deleted.`, "Its reports and stock are kept, just no longer tagged with this drive.");
}

export async function updateDrive(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser("admin");
  const p = z
    .object({
      id: z.coerce.number().int().positive(),
      name: s(2, "Please give the drive a name."),
      description: opt,
      dhamId: z.coerce.number().int().optional().transform((v) => (v ? v : null)),
      startDate: s(10, "Please choose the start date."),
      endDate: opt,
    })
    .refine((v) => !v.endDate || v.endDate >= v.startDate, { path: ["endDate"], message: "End date must be after the start date." })
    .safeParse(Object.fromEntries(fd));
  if (!p.success) return fromZod(p.error);
  const { id, ...rest } = p.data;
  await db.update(schema.campaign).set(rest).where(eq(schema.campaign.id, id));
  await logActivity(u.id, `${u.name} updated the drive "${rest.name}"`);
  revalidatePath("/drives");
  return ok("Changes saved.");
}

/* ---------------- Notifications ---------------- */

export async function deleteNotification(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser();
  await db.delete(schema.notification).where(and(eq(schema.notification.id, Number(fd.get("id"))), eq(schema.notification.userId, u.id)));
  revalidatePath("/", "layout");
  return ok("Deleted.");
}

export async function clearNotifications(_: ActionState): Promise<ActionState> {
  const u = await requireUser();
  await db.delete(schema.notification).where(eq(schema.notification.userId, u.id));
  revalidatePath("/", "layout");
  return ok("All notifications cleared.");
}
