"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { fail, fromZod, ok, type ActionState } from "@/lib/action";
import { requireUser, requireOutreach } from "@/lib/session";
import { canDeleteContact, canEditContact, canManageContacts, canSeeContact, INTERESTS, normalizeMobile } from "@/lib/outreach";
import { notify } from "@/lib/activity";
import { CONTACT_RATE } from "@/lib/access";

/**
 * Outreach contact actions. Only Contact Collection Sevaks, Sector Sevaks and Chakra Sevaks.
 * Audit rows record who did what to which record — never the name or number itself.
 */
const KEYS = INTERESTS.map((i) => i.key) as [string, ...string[]];
const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : null));

const ContactSchema = z
  .object({
    fullName: z.string().trim().min(2, "Please enter the name.").max(80),
    mobile: z.string().transform((v, ctx) => {
      const m = normalizeMobile(v);
      if (!m) ctx.addIssue({ code: "custom", message: "Please enter a valid 10-digit Indian mobile number." });
      return m ?? "";
    }),
    altMobile: z.string().optional().transform((v, ctx) => {
      if (!v?.trim()) return null;
      const m = normalizeMobile(v);
      if (!m) ctx.addIssue({ code: "custom", message: "Please enter a valid 10-digit mobile number or leave it empty." });
      return m;
    }),
    area: z.string().trim().min(2, "Please enter the address or area.").max(120),
    interests: z.array(z.enum(KEYS)).min(1, "Choose at least one activity."),
    consent: z.literal("on", { errorMap: () => ({ message: "Please confirm they agreed to be contacted." }) }),
    email: z.string().trim().toLowerCase().optional().transform((v) => (v ? v : null))
      .refine((v) => !v || z.string().email().safeParse(v).success, "Please enter a valid email or leave it empty."),
    city: opt(60), ageGroup: opt(60), language: opt(40), contactTime: opt(60), location: opt(120), remarks: opt(300), childName: opt(40),
    eventId: z.coerce.number().int().optional(),
  })
  .refine((v) => !v.interests.includes("childrens_club") || !!v.fullName, { path: ["fullName"], message: "Enter the parent / guardian's name." });

function read(fd: FormData) {
  return ContactSchema.safeParse({
    fullName: fd.get("fullName") ?? "", mobile: fd.get("mobile") ?? "", altMobile: fd.get("altMobile") ?? "", area: fd.get("area") ?? "",
    interests: fd.getAll("interests").map(String), consent: fd.get("consent") ?? "", email: fd.get("email") ?? "",
    city: fd.get("city") ?? "", ageGroup: fd.get("ageGroup") ?? "", language: fd.get("language") ?? "", contactTime: fd.get("contactTime") ?? "",
    location: fd.get("location") ?? "", remarks: fd.get("remarks") ?? "", childName: fd.get("childName") ?? "",
    eventId: fd.get("eventId") ? fd.get("eventId") : undefined,
  });
}

async function audit(contactId: number, userId: string, action: string) {
  await db.insert(schema.outreachContactAudit).values({ contactId, userId, action });
}

/** Add a contact. A repeated tap (same form key) is saved once. A number already on file is flagged for review. */
export async function addContact(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireOutreach("contact", "devotee", "manager", "admin");
  const parsed = read(fd);
  if (!parsed.success) return fromZod(parsed.error, "Please check the highlighted fields.");
  const d = parsed.data;
  const clientKey = String(fd.get("clientKey") || "").slice(0, 64) || null;
  if (d.eventId) {
    const [e] = await db.select().from(schema.outreachEvent).where(eq(schema.outreachEvent.id, d.eventId));
    if (!e || (e.dhamId != null && u.role !== "admin" && e.dhamId !== u.dhamId)) return fail("Please choose an event from the list.");
  }
  const result = await db.transaction(async (tx) => {
    if (clientKey) {
      const [again] = await tx.select({ id: schema.outreachContact.id }).from(schema.outreachContact)
        .where(and(eq(schema.outreachContact.collectorId, u.id), eq(schema.outreachContact.clientKey, clientKey)));
      if (again) return { id: again.id, repeat: true, possible: false };
    }
    // Spam guard: a per-person hourly limit, stricter while a QR registration still awaits approval.
    if (u.role !== "admin" && u.role !== "manager") {
      const limit = u.approvalStatus === "approved" ? CONTACT_RATE.perHour : CONTACT_RATE.pendingPerHour;
      // created_at is written by the app in UTC; the DB session runs in IST, so compare against a UTC cutoff (not now()).
      const since = new Date(Date.now() - 3_600_000).toISOString().replace("T", " ").replace("Z", "");
      const [{ n }] = (await tx.execute(sql`select count(*)::int as n from outreach_contact where collector_id = ${u.id} and created_at > ${since}::timestamp`)) as unknown as { n: number }[];
      if (Number(n) >= limit) return { id: 0, repeat: false, possible: false, limited: true };
    }
    const [dup] = await tx.select({ id: schema.outreachContact.id }).from(schema.outreachContact).where(eq(schema.outreachContact.mobile, d.mobile)).limit(1);
    const now = new Date();
    const [row] = await tx.insert(schema.outreachContact).values({
      collectorId: u.id, dhamId: u.dhamId, eventId: d.eventId ?? null,
      fullName: d.fullName, mobile: d.mobile, altMobile: d.altMobile, email: d.email, area: d.area, city: d.city,
      ageGroup: d.ageGroup, language: d.language, contactTime: d.contactTime, location: d.location, remarks: d.remarks,
      childName: d.interests.includes("childrens_club") ? d.childName : null,
      consent: true, consentAt: now, duplicateOf: dup?.id ?? null, dupStatus: dup ? "possible" : "none", clientKey,
      collectedAt: now, createdAt: now, updatedAt: now,
    }).onConflictDoNothing().returning({ id: schema.outreachContact.id });
    if (!row) return { id: 0, repeat: true, possible: false };
    await tx.insert(schema.outreachContactInterest).values(d.interests.map((interest) => ({ contactId: row.id, interest })));
    await tx.insert(schema.outreachContactAudit).values({ contactId: row.id, userId: u.id, action: dup ? "created (possible duplicate)" : "created" });
    return { id: row.id, repeat: false, possible: !!dup };
  });
  revalidatePath("/contacts");
  revalidatePath("/dashboard");
  if ("limited" in result) return fail("Too many contacts in one hour.", "Please wait a little and add the rest later.");
  if (result.repeat) return ok("Already saved.", "This contact was saved a moment ago — it was not added twice.");
  if (result.possible) {
    // Tell the reviewers, never the details of the other record.
    const reviewers = await db.select({ id: schema.user.id, role: schema.user.role, dhamId: schema.user.dhamId }).from(schema.user)
      .where(and(eq(schema.user.isActive, true), ne(schema.user.role, "devotee"), ne(schema.user.role, "contact")));
    await notify(reviewers.filter((r) => r.role === "admin" || r.dhamId === u.dhamId).map((r) => r.id), "Possible duplicate outreach contact", "A new contact has a mobile number already on file. Please review.", "/contacts?dup=possible");
  }
  return ok(
    result.possible ? "Saved — this number may already be on file." : "Contact saved. 🙏",
    result.possible ? "A Sector Sevak will check it. You don't need to do anything." : "Add the next person, or see My Contacts.",
    { label: "My Contacts", href: "/contacts/mine" },
  );
}

export async function updateContact(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireOutreach("contact", "devotee", "manager", "admin");
  const id = Number(fd.get("id"));
  const [c] = await db.select().from(schema.outreachContact).where(eq(schema.outreachContact.id, id));
  if (!c || !canEditContact(u, c)) return fail("This contact was not found.");
  const parsed = read(fd);
  if (!parsed.success) return fromZod(parsed.error, "Please check the highlighted fields.");
  const d = parsed.data;
  await db.transaction(async (tx) => {
    await tx.update(schema.outreachContact).set({
      fullName: d.fullName, mobile: d.mobile, altMobile: d.altMobile, email: d.email, area: d.area, city: d.city, ageGroup: d.ageGroup,
      language: d.language, contactTime: d.contactTime, location: d.location, remarks: d.remarks, eventId: d.eventId ?? c.eventId,
      childName: d.interests.includes("childrens_club") ? d.childName : null, updatedAt: new Date(),
    }).where(eq(schema.outreachContact.id, id));
    await tx.delete(schema.outreachContactInterest).where(eq(schema.outreachContactInterest.contactId, id));
    await tx.insert(schema.outreachContactInterest).values(d.interests.map((interest) => ({ contactId: id, interest })));
    await tx.insert(schema.outreachContactAudit).values({ contactId: id, userId: u.id, action: "edited" });
  });
  revalidatePath("/contacts");
  return ok("Changes saved.");
}

export async function deleteContact(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireOutreach("contact", "devotee", "manager", "admin");
  const id = Number(fd.get("id"));
  const [c] = await db.select().from(schema.outreachContact).where(eq(schema.outreachContact.id, id));
  if (!c || !canSeeContact(u, c)) return fail("This contact was not found.");
  if (!canDeleteContact(u, c)) return fail("You can delete a contact only on the day you added it.", "Ask your Sector Sevak to remove it.");
  await db.transaction(async (tx) => {
    await tx.delete(schema.outreachContactInterest).where(eq(schema.outreachContactInterest.contactId, id));
    await tx.update(schema.outreachContact).set({ duplicateOf: null }).where(eq(schema.outreachContact.duplicateOf, id));
    await tx.delete(schema.outreachContact).where(eq(schema.outreachContact.id, id));
    await tx.insert(schema.outreachContactAudit).values({ contactId: id, userId: u.id, action: "deleted" });
  });
  revalidatePath("/contacts");
  return ok("Contact deleted.");
}

/** Sector Sevak / Chakra Sevak: decide a possible duplicate. */
export async function reviewDuplicate(fd: FormData) {
  const u = await requireUser("manager", "admin");
  const id = Number(fd.get("id"));
  const status = fd.get("status") === "duplicate" ? "duplicate" : "not_duplicate";
  const [c] = await db.select().from(schema.outreachContact).where(eq(schema.outreachContact.id, id));
  if (!c || !canManageContacts(u) || !canSeeContact(u, c)) return;
  await db.update(schema.outreachContact).set({ dupStatus: status, updatedAt: new Date() }).where(eq(schema.outreachContact.id, id));
  await audit(id, u.id, `duplicate review: ${status}`);
  revalidatePath("/contacts");
}

const EventSchema = z.object({ name: z.string().trim().min(3, "Please enter the event name.").max(80) });

/** Sector Sevak (own Dham) / Chakra Sevak (any or all Dhams): add an outreach event to pick in the form. */
export async function addEvent(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser("manager", "admin");
  const p = EventSchema.safeParse({ name: fd.get("name") ?? "" });
  if (!p.success) return fromZod(p.error);
  const dhamId = u.role === "manager" ? u.dhamId : fd.get("dhamId") ? Number(fd.get("dhamId")) : null;
  await db.insert(schema.outreachEvent).values({ name: p.data.name, dhamId, createdBy: u.id });
  revalidatePath("/contacts");
  return ok(`Event “${p.data.name}” added.`, "Contact Collection Sevaks can now pick it when adding contacts.");
}
