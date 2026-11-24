"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { auth, hashPassword } from "@/lib/auth";
import { fail, fromZod, ok, type ActionState } from "@/lib/action";
import { requireUser } from "@/lib/session";
import { dhamManagers, logActivity, notify } from "@/lib/activity";
import { canManageAccess, clientIp, INVITE_DAYS, inviteContext, ipHash, newToken, RATE } from "@/lib/registration";

/* ---------------- Invites (Sector Sevak / Chakra Sevak) ---------------- */

export async function createInvite(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser("manager", "admin");
  // A Sector Sevak's link is always for their own Dham — the Dham is never taken from the form for them.
  const dhamId = u.role === "admin" ? Number(fd.get("dhamId")) : u.dhamId;
  if (!dhamId) return fail("Please choose the Dham.", undefined, { dhamId: "Choose a Dham" });
  const [d] = await db.select().from(schema.dham).where(eq(schema.dham.id, dhamId));
  if (!d || !d.isActive) return fail("Please choose an active Dham.");
  const days = Number(fd.get("days") || 90);
  if (!(INVITE_DAYS as readonly number[]).includes(days)) return fail("Please choose how long the link works.");
  const expiresAt = new Date(Date.now() + days * 86_400_000);
  await db.insert(schema.registrationInvite).values({ token: newToken(), dhamId, createdBy: u.id, expiresAt });
  await logActivity(u.id, `${u.name} created a registration QR / link for ${d.name} (valid ${days} days)`, { dhamId });
  revalidatePath("/people/registration");
  return ok("Registration link ready 🙏", "Download the QR as PDF and print it, or share the link.");
}

export async function revokeInvite(fd: FormData) {
  const u = await requireUser("manager", "admin");
  const id = Number(fd.get("id"));
  const [inv] = await db.select().from(schema.registrationInvite).where(eq(schema.registrationInvite.id, id));
  if (!inv || (u.role !== "admin" && inv.dhamId !== u.dhamId)) return;
  await db.update(schema.registrationInvite).set({ revokedAt: new Date(), revokedBy: u.id }).where(eq(schema.registrationInvite.id, id));
  await logActivity(u.id, `${u.name} turned off a registration QR / link`, { dhamId: inv.dhamId });
  revalidatePath("/people/registration");
}

/* ---------------- Self-registration (public) ---------------- */

const RegSchema = z
  .object({
    name: z.string().trim().min(2, "Please write your full name.").max(80, "Name is too long."),
    phone: z
      .string()
      .trim()
      .transform((v) => v.replace(/[^\d]/g, "").replace(/^(91|0)(?=\d{10}$)/, ""))
      .refine((v) => /^[6-9]\d{9}$/.test(v), "Please enter a valid 10-digit mobile number."),
    password: z.string().min(6, "Password must have at least 6 characters.").max(72, "Password is too long."),
    confirm: z.string(),
    consent: z.literal("on", { errorMap: () => ({ message: "Please agree to continue." }) }),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "The two passwords are not the same." });

export async function registerDevotee(_: ActionState, fd: FormData): Promise<ActionState> {
  const token = String(fd.get("token") || "");
  const ctx = await inviteContext(token);
  if (ctx.state !== "ok")
    return fail("This registration link is not valid any more.", "Please ask your Sector Sevak for a new QR code or link.");
  const ip = ipHash(await clientIp());
  const hourAgo = new Date(Date.now() - 3_600_000);
  const [{ byIp }] = (await db.execute(
    sql`select count(*)::int as "byIp" from registration_attempt where ip_hash = ${ip} and created_at > now() - interval '1 hour'`,
  )) as unknown as { byIp: number }[];
  const [{ byInvite }] = (await db.execute(
    sql`select count(*)::int as "byInvite" from registration_attempt where invite_id = ${ctx.invite.id} and created_at > now() - interval '1 hour'`,
  )) as unknown as { byInvite: number }[];
  if (byIp >= RATE.perIpHour || byInvite >= RATE.perInviteHour)
    return fail("Too many sign-ups from here right now.", "Please wait an hour and try again, or ask your Sector Sevak to add you.");
  await db.insert(schema.registrationAttempt).values({ inviteId: ctx.invite.id, ipHash: ip });

  const p = RegSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return fromZod(p.error);
  const d = p.data;
  // One account per mobile number: never attach this sign-up to an existing account, never move someone's Dham.
  const [existing] = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.phone, d.phone));
  if (existing)
    return fail(
      "This mobile number already has an account.",
      "Please log in with it. If you forgot the password, ask your Sector Sevak to reset it.",
      { phone: "Already registered — please log in" },
    );
  const id = randomUUID();
  const email = `m${d.phone}@users.gaurangadham.local`;
  const password = await hashPassword(d.password);
  try {
    await db.transaction(async (tx) => {
      await tx.insert(schema.user).values({
        id,
        name: d.name,
        email,
        emailVerified: false, // the mobile number is self-declared; Sevak approval is authorisation, not verification
        role: "devotee",
        dhamId: ctx.dham.id, // from the invite on the server — never from the form
        phone: d.phone,
        approvalStatus: "pending",
        canDistributeBooks: false,
        canViewDhamSales: false,
        registeredVia: ctx.invite.id,
        addedBy: ctx.invite.createdBy,
      });
      await tx.insert(schema.account).values({ id: randomUUID(), accountId: id, providerId: "credential", userId: id, password });
    });
  } catch {
    return fail("This mobile number already has an account.", "Please log in with it.", { phone: "Already registered" });
  }
  await db
    .update(schema.registrationAttempt)
    .set({ ok: true })
    .where(and(eq(schema.registrationAttempt.ipHash, ip), eq(schema.registrationAttempt.inviteId, ctx.invite.id), gt(schema.registrationAttempt.createdAt, hourAgo)));
  await logActivity(id, `${d.name} registered with the ${ctx.dham.name} QR — awaiting Sector Sevak approval`, { dhamId: ctx.dham.id });
  await notify(await dhamManagers(ctx.dham.id, true), "New registration request", `${d.name} registered for ${ctx.dham.name}. Please review.`, "/people/requests");
  try {
    await auth.api.signInEmail({ body: { email, password: d.password }, headers: await headers() });
  } catch {
    return ok("Registration done 🙏", "Please log in with your mobile number and password.", { label: "Log in", href: "/login" });
  }
  redirect("/dashboard");
}

/* ---------------- Review (approve / reject) ---------------- */

async function audit(userId: string, actorId: string, permission: "approval" | "book_distribution" | "dham_sales_view", oldValue: string | null, newValue: string, reason?: string | null) {
  await db.insert(schema.accessAudit).values({ userId, actorId, permission, oldValue, newValue, reason: reason || null });
}

export async function reviewRegistrations(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser("manager", "admin");
  const ids = fd.getAll("ids").map(String).filter(Boolean).slice(0, 200);
  const decision = fd.get("decision") === "reject" ? "rejected" : "approved";
  const reason = String(fd.get("reason") || "").trim() || null;
  const grantDistribute = fd.get("grantDistribute") === "on";
  const grantDhamSales = fd.get("grantDhamSales") === "on";
  if (!ids.length) return fail("Please choose at least one person.");
  if (decision === "rejected" && (!reason || reason.length < 3)) return fail("Please write the reason for not approving.", undefined, { reason: "Reason needed" });
  const people = await db.select().from(schema.user).where(inArray(schema.user.id, ids));
  const allowed = people.filter((p) => p.approvalStatus === "pending" && canManageAccess(u, p));
  if (!allowed.length) return fail("These requests were already reviewed, or are not in your Dham.");
  for (const p of allowed) {
    // Only rows still pending are changed: two Sevaks reviewing at once can't both decide.
    const done = await db
      .update(schema.user)
      .set({
        approvalStatus: decision,
        reviewedBy: u.id,
        reviewedAt: new Date(),
        reviewNote: reason,
        ...(decision === "approved" ? { canDistributeBooks: grantDistribute, canViewDhamSales: grantDhamSales } : {}),
      })
      .where(and(eq(schema.user.id, p.id), eq(schema.user.approvalStatus, "pending")))
      .returning({ id: schema.user.id });
    if (!done.length) continue;
    await audit(p.id, u.id, "approval", "pending", decision, reason);
    if (decision === "approved") {
      if (grantDistribute) await audit(p.id, u.id, "book_distribution", "off", "on", "Given at approval");
      if (grantDhamSales) await audit(p.id, u.id, "dham_sales_view", "off", "on", "Given at approval");
      await notify([p.id], "Your registration is approved 🙏", grantDistribute ? "You can now start book distribution." : "Your Sector Sevak will turn on what you need.", "/dashboard");
    } else {
      await notify([p.id], "Your registration was not approved", reason ?? undefined, "/dashboard");
    }
    await logActivity(u.id, `${u.name} ${decision === "approved" ? "approved" : "did not approve"} the registration of ${p.name}`, { dhamId: p.dhamId });
  }
  revalidatePath("/people/requests");
  revalidatePath("/people");
  const n = allowed.length;
  return ok(decision === "approved" ? `${n} ${n === 1 ? "person" : "people"} approved.` : `${n} ${n === 1 ? "request" : "requests"} not approved.`);
}

/* ---------------- Access toggles (after approval) ---------------- */

export async function setAccess(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser("manager", "admin");
  const id = String(fd.get("id") || "");
  const permission = fd.get("permission") === "dham_sales_view" ? "dham_sales_view" : fd.get("permission") === "book_distribution" ? "book_distribution" : null;
  const value = fd.get("value") === "on";
  const reason = String(fd.get("reason") || "").trim() || null;
  if (!permission) return fail("Unknown access.");
  const [p] = await db.select().from(schema.user).where(eq(schema.user.id, id));
  if (!p || !canManageAccess(u, p)) return fail("You can change access only for devotees of your own Dham.");
  if (p.approvalStatus !== "approved") return fail("Approve the registration first.");
  const col = permission === "book_distribution" ? "canDistributeBooks" : "canViewDhamSales";
  const old = p[col];
  if (old === value) return ok("No change.");
  const changed = await db.update(schema.user).set({ [col]: value })
    .where(and(eq(schema.user.id, id), eq(schema.user[col], old))).returning({ id: schema.user.id });
  if (!changed.length) return fail("Someone else just changed this. Please refresh and try again.");
  await audit(id, u.id, permission, old ? "on" : "off", value ? "on" : "off", reason);
  const label = permission === "book_distribution" ? "Book Distribution" : "Dham Sales View";
  await logActivity(u.id, `${u.name} turned ${value ? "on" : "off"} ${label} for ${p.name}`, { dhamId: p.dhamId });
  await notify([id], `${label} ${value ? "turned on" : "turned off"}`, value ? "You can use it now." : undefined, "/dashboard");
  revalidatePath("/people");
  revalidatePath(`/people/requests`);
  return ok(`${label} ${value ? "enabled" : "disabled"} for ${p.name}.`);
}
