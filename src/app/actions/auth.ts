"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { eq, or } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { fail, type ActionState } from "@/lib/action";
import { requireUser } from "@/lib/session";
import { logActivity } from "@/lib/activity";

const LoginSchema = z.object({
  identifier: z.string().trim().min(1, "Please enter your mobile number or email."),
  password: z.string().min(1, "Please enter your password."),
});

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = LoginSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) {
    const fe: Record<string, string> = {};
    parsed.error.issues.forEach((i) => (fe[String(i.path[0])] = i.message));
    return fail("Please fill in both fields.", undefined, fe);
  }
  const id = parsed.data.identifier.toLowerCase();
  const phone = id.replace(/[^\d]/g, "").slice(-10);
  const [u] = await db
    .select()
    .from(schema.user)
    .where(or(eq(schema.user.email, id), phone.length === 10 ? eq(schema.user.phone, phone) : eq(schema.user.email, id)));

  const wrong = fail(
    "The mobile number / email or password is not correct.",
    "Please check and try again. If you have forgotten your password, ask your Dham Manager or Admin to reset it.",
  );
  if (!u) return wrong;
  if (!u.isActive)
    return fail("Your account is marked as inactive.", "Please contact your Dham Manager or Admin to activate it again.");

  try {
    await auth.api.signInEmail({ body: { email: u.email, password: parsed.data.password }, headers: await headers() });
  } catch {
    return wrong;
  }
  await logActivity(u.id, `${u.name} logged in`, { dhamId: u.dhamId });
  redirect(u.onboarded ? "/dashboard" : "/welcome");
}

export async function logoutAction() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}

export async function finishOnboarding() {
  const u = await requireUser();
  await db.update(schema.user).set({ onboarded: true }).where(eq(schema.user.id, u.id));
  redirect("/dashboard");
}

const PwSchema = z
  .object({
    current: z.string().min(1, "Please enter your current password."),
    next: z.string().min(6, "New password must have at least 6 characters."),
    confirm: z.string(),
  })
  .refine((v) => v.next === v.confirm, { path: ["confirm"], message: "The two new passwords do not match." });

export async function changePasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireUser();
  const p = PwSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) {
    const fe: Record<string, string> = {};
    p.error.issues.forEach((i) => (fe[String(i.path[0])] = i.message));
    return fail("Please check the highlighted fields.", undefined, fe);
  }
  try {
    await auth.api.changePassword({
      body: { currentPassword: p.data.current, newPassword: p.data.next, revokeOtherSessions: false },
      headers: await headers(),
    });
  } catch {
    return fail("Your current password is not correct.", "Please type it again carefully.", { current: "Not correct" });
  }
  return { status: "success", message: "Your password has been changed.", detail: "Use the new password next time you log in.", at: Date.now() };
}
