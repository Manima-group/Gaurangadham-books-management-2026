import "server-only";
import { sql } from "drizzle-orm";
import { db, schema } from "@/db";

export type DevoteeBook = {
  id: number;
  title: string;
  language: string;
  sku: string;
  coverUrl: string | null;
  pricePaise: number;
  size: "big" | "small";
  /** Value of copies reported sold (approved + being reviewed), at the price they were sold at. */
  soldAmount: number;
  given: number;
  sold: number; // approved
  pendingSold: number; // in reports being reviewed
  returned: number;
  damaged: number;
  holding: number; // physically with the devotee as per approved records
  available: number; // holding minus anything already reported but not yet approved
};

/** Every book a devotee has ever been given, with live counts. */
export async function devoteeBooks(devoteeId: string): Promise<DevoteeBook[]> {
  const rows = (await db.execute(sql`
    with m as (
      select book_id,
        sum(qty) filter (where kind = 'assign_devotee')::int as given,
        sum(qty) filter (where kind = 'sold')::int as sold,
        sum(qty) filter (where kind = 'returned')::int as returned,
        sum(qty) filter (where kind = 'damaged')::int as damaged
      from stock_movement where devotee_id = ${devoteeId} and reversed_by is null and kind <> 'correction' group by book_id
    ), p as (
      select l.book_id,
        sum(l.sold_qty)::int as psold,
        sum(l.sold_qty + l.returned_qty + l.damaged_qty)::int as pall
      from daily_report_line l join daily_report r on r.id = l.report_id
      where r.devotee_id = ${devoteeId} and r.status = 'submitted' group by l.book_id
    ), amt as (
      select l.book_id, sum(l.amount_paise)::bigint as amount
      from daily_report_line l join daily_report r on r.id = l.report_id
      where r.devotee_id = ${devoteeId} and r.status in ('submitted','approved') group by l.book_id
    )
    select b.id, b.title, b.language, b.sku, b.cover_url, b.price_paise, b.size, coalesce(amt.amount,0)::bigint as amount,
      coalesce(m.given,0) as given, coalesce(m.sold,0) as sold, coalesce(m.returned,0) as returned,
      coalesce(m.damaged,0) as damaged, coalesce(p.psold,0) as psold, coalesce(p.pall,0) as pall
    from m join book b on b.id = m.book_id left join p on p.book_id = m.book_id left join amt on amt.book_id = m.book_id
    order by b.title, b.language`)) as unknown as {
    id: number; title: string; language: string; sku: string; cover_url: string | null; price_paise: number; size: "big" | "small"; amount: number;
    given: number; sold: number; returned: number; damaged: number; psold: number; pall: number;
  }[];
  return rows.map((r) => {
    const holding = r.given - r.sold - r.returned - r.damaged;
    return {
      id: r.id,
      title: r.title,
      language: r.language,
      sku: r.sku,
      coverUrl: r.cover_url,
      pricePaise: r.price_paise,
      size: r.size,
      soldAmount: Number(r.amount),
      given: r.given,
      sold: r.sold,
      pendingSold: r.psold,
      returned: r.returned,
      damaged: r.damaged,
      holding,
      available: holding - r.pall,
    };
  });
}

export { schema };
