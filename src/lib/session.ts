import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { auth } from "./auth";
import { db, schema } from "@/db";
import type { Role } from "./terms";

export type AppUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  dhamId: number | null;
  phone: string | null;
  onboarded: boolean;
  dhamName: string | null;
};

export const getUser = cache(async (): Promise<AppUser | null> => {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s) return null;
  const [u] = await db.select().from(schema.user).where(eq(schema.user.id, s.user.id));
  if (!u || !u.isActive) return null;
  let dhamName: string | null = null;
  if (u.dhamId) {
    const [d] = await db.select().from(schema.dham).where(eq(schema.dham.id, u.dhamId));
    dhamName = d?.name ?? null;
  }
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    dhamId: u.dhamId,
    phone: u.phone,
    onboarded: u.onboarded,
    dhamName,
  };
});

export async function requireUser(...roles: Role[]): Promise<AppUser> {
  const u = await getUser();
  if (!u) redirect("/login");
  if (roles.length && !roles.includes(u.role)) redirect("/dashboard?denied=1");
  return u;
}

/** Dham the user is allowed to see. Admin: optional filter. Manager/devotee: their own Dham, always. */
export function scopeDham(u: AppUser, requested?: number | null) {
  if (u.role === "admin") return requested ?? null;
  return u.dhamId ?? -1;
}
