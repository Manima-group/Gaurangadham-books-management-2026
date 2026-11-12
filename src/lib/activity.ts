import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";

/** Record a plain-language line in Activity History. */
export async function logActivity(
  userId: string | null,
  action: string,
  opts: { dhamId?: number | null; entity?: string; entityId?: string | number } = {},
) {
  await db.insert(schema.activityLog).values({
    userId,
    action,
    dhamId: opts.dhamId ?? null,
    entity: opts.entity,
    entityId: opts.entityId != null ? String(opts.entityId) : null,
  });
}

export async function notify(userIds: string[], title: string, body?: string, link?: string) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return;
  await db.insert(schema.notification).values(ids.map((userId) => ({ userId, title, body, link })));
}

/** Managers of a Dham (+ optionally all admins). */
export async function dhamManagers(dhamId: number, includeAdmins = false) {
  const roles = includeAdmins ? (["manager", "admin"] as const) : (["manager"] as const);
  const rows = await db
    .select({ id: schema.user.id, role: schema.user.role, dhamId: schema.user.dhamId })
    .from(schema.user)
    .where(and(eq(schema.user.isActive, true), inArray(schema.user.role, [...roles])));
  return rows.filter((r) => r.role === "admin" || r.dhamId === dhamId).map((r) => r.id);
}

export async function admins() {
  const rows = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(and(eq(schema.user.role, "admin"), eq(schema.user.isActive, true)));
  return rows.map((r) => r.id);
}
