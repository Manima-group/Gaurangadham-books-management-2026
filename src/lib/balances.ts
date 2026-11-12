import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";

/** Money position of every devotee in a Dham (or all Dhams). */
export async function devoteeBalances(dhamId: number | null) {
  const rows = (await db.execute(sql`
    select u.id, u.name, u.phone, u.dham_id, d.name as dham,
      coalesce((select sum(collected_paise) from daily_report r where r.devotee_id = u.id and r.status in ('submitted','approved','changes_required')),0)::bigint as collected,
      coalesce((select sum(amount_paise) from money_submission m where m.devotee_id = u.id and m.status <> 'disputed'),0)::bigint as submitted,
      coalesce((select sum(amount_paise) from money_submission m where m.devotee_id = u.id and m.status = 'received'),0)::bigint as received
    from "user" u left join dham d on d.id = u.dham_id
    where u.role in ('devotee','manager') and u.is_active and (u.role = 'devotee' or exists (select 1 from stock_movement s where s.devotee_id = u.id)) ${dhamId != null ? sql`and u.dham_id = ${dhamId}` : sql``}
    order by u.name`)) as unknown as { id: string; name: string; phone: string | null; dham_id: number; dham: string; collected: number; submitted: number; received: number }[];
  return rows.map((r) => ({
    ...r,
    collected: Number(r.collected),
    submitted: Number(r.submitted),
    received: Number(r.received),
    pending: Math.max(Number(r.collected) - Number(r.submitted), 0),
  }));
}
