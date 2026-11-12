import "server-only";
import { and, desc, eq, gte, isNull, lte, or } from "drizzle-orm";
import { db, schema } from "@/db";

/** The active distribution drive covering this Dham on this date (Dham-specific drives win). */
export async function findCampaign(dhamId: number | null, date: string) {
  const c = schema.campaign;
  const rows = await db
    .select()
    .from(c)
    .where(
      and(
        eq(c.isActive, true),
        lte(c.startDate, date),
        or(isNull(c.endDate), gte(c.endDate, date)),
        dhamId == null ? isNull(c.dhamId) : or(isNull(c.dhamId), eq(c.dhamId, dhamId)),
      ),
    )
    .orderBy(desc(c.dhamId), desc(c.startDate));
  return rows[0] ?? null;
}
