import "server-only";
import { desc, eq, isNull, or } from "drizzle-orm";
import { db, schema } from "@/db";
import type { AppUser } from "@/lib/session";

/** Events this person can pick: their Dham's events and the all-Dham ones (Chakra Sevak: all). */
export async function eventsFor(u: AppUser) {
  const e = schema.outreachEvent;
  return db.select({ id: e.id, name: e.name, dhamId: e.dhamId }).from(e)
    .where(u.role === "admin" ? undefined : or(isNull(e.dhamId), eq(e.dhamId, u.dhamId ?? -1)))
    .orderBy(desc(e.createdAt)).limit(100);
}
