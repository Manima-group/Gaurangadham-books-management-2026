import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { addDays, todayIST } from "./format";

/**
 * "Distributed" = books a devotee reported as sold to the public, in reports that were
 * sent (being reviewed) or approved. Rejected / not-sent reports are not counted.
 */
export type Period = "today" | "week" | "month" | "all";
export const PERIOD_LABEL: Record<Period, string> = { today: "Today", week: "Last 7 days", month: "This month", all: "All time" };

export function periodRange(p: Period): { from?: string; to: string } {
  const t = todayIST();
  if (p === "today") return { from: t, to: t };
  if (p === "week") return { from: addDays(t, -6), to: t };
  if (p === "month") return { from: t.slice(0, 8) + "01", to: t };
  return { to: t };
}

type Row = Record<string, unknown>;
const rows = async <T = Row>(q: SQL) => (await db.execute(q)) as unknown as T[];
const n = (v: unknown) => Number(v ?? 0);

function where(f: { dhamId?: number | null; devoteeId?: string; from?: string; to?: string; size?: string }) {
  const c: SQL[] = [sql`r.status in ('submitted','approved')`];
  if (f.dhamId != null) c.push(sql`r.dham_id = ${f.dhamId}`);
  if (f.devoteeId) c.push(sql`r.devotee_id = ${f.devoteeId}`);
  if (f.from) c.push(sql`r.report_date >= ${f.from}`);
  if (f.to) c.push(sql`r.report_date <= ${f.to}`);
  if (f.size === "big" || f.size === "small") c.push(sql`b.size = ${f.size}`);
  return sql.join(c, sql` and `);
}

/** One row per active Dham: big/small books distributed today and in total, plus the chosen period. */
export async function dhamWise(period: Period = "today") {
  const today = todayIST();
  const { from, to } = periodRange(period);
  const r = await rows<{
    id: number; name: string; devotees: number;
    t_big: number; t_small: number; t_amt: number; t_people: number;
    a_big: number; a_small: number; a_amt: number;
    p_big: number; p_small: number; p_amt: number; p_people: number;
  }>(sql`
    with s as (
      select r.dham_id, r.devotee_id, r.report_date, b.size, l.sold_qty, l.amount_paise
      from daily_report_line l
      join daily_report r on r.id = l.report_id
      join book b on b.id = l.book_id
      where r.status in ('submitted','approved') and l.sold_qty > 0
    )
    select d.id, d.name,
      (select count(*) from "user" u where u.dham_id = d.id and u.role = 'devotee' and u.is_active)::int as devotees,
      coalesce(sum(s.sold_qty) filter (where s.report_date = ${today} and s.size = 'big'),0)::int as t_big,
      coalesce(sum(s.sold_qty) filter (where s.report_date = ${today} and s.size = 'small'),0)::int as t_small,
      coalesce(sum(s.amount_paise) filter (where s.report_date = ${today}),0)::bigint as t_amt,
      count(distinct s.devotee_id) filter (where s.report_date = ${today})::int as t_people,
      coalesce(sum(s.sold_qty) filter (where s.size = 'big'),0)::int as a_big,
      coalesce(sum(s.sold_qty) filter (where s.size = 'small'),0)::int as a_small,
      coalesce(sum(s.amount_paise),0)::bigint as a_amt,
      coalesce(sum(s.sold_qty) filter (where s.size = 'big' and ${from ? sql`s.report_date >= ${from}` : sql`true`} and s.report_date <= ${to}),0)::int as p_big,
      coalesce(sum(s.sold_qty) filter (where s.size = 'small' and ${from ? sql`s.report_date >= ${from}` : sql`true`} and s.report_date <= ${to}),0)::int as p_small,
      coalesce(sum(s.amount_paise) filter (where ${from ? sql`s.report_date >= ${from}` : sql`true`} and s.report_date <= ${to}),0)::bigint as p_amt,
      count(distinct s.devotee_id) filter (where ${from ? sql`s.report_date >= ${from}` : sql`true`} and s.report_date <= ${to})::int as p_people
    from dham d left join s on s.dham_id = d.id
    where d.is_active
    group by d.id, d.name order by d.name`);
  return r.map((x) => ({
    id: x.id,
    name: x.name,
    devotees: n(x.devotees),
    today: { big: n(x.t_big), small: n(x.t_small), total: n(x.t_big) + n(x.t_small), amount: n(x.t_amt), people: n(x.t_people) },
    all: { big: n(x.a_big), small: n(x.a_small), total: n(x.a_big) + n(x.a_small), amount: n(x.a_amt) },
    period: { big: n(x.p_big), small: n(x.p_small), total: n(x.p_big) + n(x.p_small), amount: n(x.p_amt), people: n(x.p_people) },
  }));
}

/** Who distributed how many books in a Dham, for a period and optional book size. */
export async function devoteeWise(dhamId: number, period: Period, size?: string) {
  const { from, to } = periodRange(period);
  const w = where({ dhamId, from, to, size });
  const r = await rows<{ id: string; name: string; phone: string | null; big: number; small: number; amt: number; days: number; last: string | null }>(sql`
    select u.id, u.name, u.phone,
      coalesce(x.big,0)::int as big, coalesce(x.small,0)::int as small, coalesce(x.amt,0)::bigint as amt,
      coalesce(x.days,0)::int as days, x.last
    from "user" u
    left join (
      select r.devotee_id,
        sum(l.sold_qty) filter (where b.size = 'big') as big,
        sum(l.sold_qty) filter (where b.size = 'small') as small,
        sum(l.amount_paise) as amt,
        count(distinct r.report_date) filter (where l.sold_qty > 0) as days,
        to_char(max(r.report_date) filter (where l.sold_qty > 0),'YYYY-MM-DD') as last
      from daily_report_line l join daily_report r on r.id = l.report_id join book b on b.id = l.book_id
      where ${w}
      group by r.devotee_id
    ) x on x.devotee_id = u.id
    where u.dham_id = ${dhamId} and ((u.role = 'devotee' and u.is_active) or x.devotee_id is not null)
    order by (coalesce(x.big,0) + coalesce(x.small,0)) desc, u.name`);
  return r.map((x) => ({ id: x.id, name: x.name, phone: x.phone, big: n(x.big), small: n(x.small), total: n(x.big) + n(x.small), amount: n(x.amt), days: n(x.days), last: x.last }));
}

/** Book-by-book breakdown for a Dham (or one devotee) in a period. */
export async function bookWise(dhamId: number | null, period: Period, size?: string, devoteeId?: string) {
  const { from, to } = periodRange(period);
  const w = where({ dhamId, from, to, size, devoteeId });
  const r = await rows<{ id: number; title: string; language: string; size: string; qty: number; amt: number }>(sql`
    select b.id, b.title, b.language, b.size, sum(l.sold_qty)::int as qty, sum(l.amount_paise)::bigint as amt
    from daily_report_line l join daily_report r on r.id = l.report_id join book b on b.id = l.book_id
    where ${w} and l.sold_qty > 0
    group by b.id order by qty desc`);
  return r.map((x) => ({ ...x, qty: n(x.qty), amt: n(x.amt) }));
}
