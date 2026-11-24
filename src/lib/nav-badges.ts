import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { AppUser } from "./session";

const one = async (q: ReturnType<typeof sql>) => Number(((await db.execute(q)) as unknown as { n: number }[])[0]?.n ?? 0);

/** Small red counts in the menu: things waiting for this person. One cheap query each. */
export async function navBadges(u: AppUser): Promise<Record<string, number>> {
  if (u.approvalStatus !== "approved") return {};
  const me = u.id;
  const dham = u.dhamId ?? -1;
  // Transfers waiting for this person, mirroring needsMe() in lib/transfers.
  const transfers =
    u.role === "manager"
      ? sql`select count(*)::int as n from dham_transfer t where
          (t.status = 'requested' and t.from_dham_id = ${dham} and coalesce(t.from_holder, 'dham:' || t.from_dham_id) like 'dham:%')
          or (t.status in ('approved','accepted') and t.from_dham_id = ${dham} and t.sender_id is null and coalesce(t.from_holder, 'dham:' || t.from_dham_id) like 'dham:%')
          or (t.status in ('sent','partially_received','disputed') and t.to_dham_id = ${dham})`
      : u.role === "devotee"
        ? sql`select count(*)::int as n from dham_transfer t where
          (t.status = 'requested' and t.from_holder = ${"devotee:" + me})
          or (t.status in ('approved','accepted') and (t.sender_id = ${me} or t.from_holder = ${"devotee:" + me}))
          or (t.status in ('sent','partially_received','disputed') and t.to_holder = ${"devotee:" + me})`
        : null;
  const [reports, money, tr, dups] = await Promise.all([
    u.role === "admin" || u.role === "manager"
      ? one(sql`select count(*)::int as n from daily_report where status = 'submitted' ${u.role === "manager" ? sql`and dham_id = ${dham}` : sql``}`)
      : 0,
    u.role === "manager" ? one(sql`select count(*)::int as n from money_submission where status = 'submitted' and dham_id = ${dham}`) : 0,
    transfers ? one(transfers) : 0,
    u.role === "admin" || u.role === "manager"
      ? one(sql`select count(*)::int as n from outreach_contact where dup_status = 'possible' ${u.role === "manager" ? sql`and dham_id = ${dham}` : sql``}`)
      : 0,
  ]);
  return { "/reports": reports, "/money": money, "/transfers": tr, "/contacts": dups };
}
