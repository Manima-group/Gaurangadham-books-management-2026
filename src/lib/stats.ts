import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { movementTotals, scopeStock, total } from "./stock";

type Row = Record<string, unknown>;
async function rows<T = Row>(q: SQL): Promise<T[]> {
  return (await db.execute(q)) as unknown as T[];
}

export type Filters = {
  dhamId?: number | null;
  campaignId?: number;
  devoteeId?: string;
  from?: string;
  to?: string;
};

function reportWhere(f: Filters, alias = "r") {
  const a = sql.raw(alias);
  const c: SQL[] = [sql`true`];
  if (f.dhamId != null) c.push(sql`${a}.dham_id = ${f.dhamId}`);
  if (f.campaignId) c.push(sql`${a}.campaign_id = ${f.campaignId}`);
  if (f.devoteeId) c.push(sql`${a}.devotee_id = ${f.devoteeId}`);
  if (f.from) c.push(sql`${a}.report_date >= ${f.from}`);
  if (f.to) c.push(sql`${a}.report_date <= ${f.to}`);
  return sql.join(c, sql` and `);
}

function moneyWhere(f: Filters) {
  const c: SQL[] = [sql`status <> 'disputed'`];
  if (f.dhamId != null) c.push(sql`dham_id = ${f.dhamId}`);
  if (f.devoteeId) c.push(sql`devotee_id = ${f.devoteeId}`);
  if (f.from) c.push(sql`submission_date >= ${f.from}`);
  if (f.to) c.push(sql`submission_date <= ${f.to}`);
  return sql.join(c, sql` and `);
}

/** Money and report figures for a scope. All amounts in paise. */
export async function moneySummary(f: Filters) {
  const [r] = await rows<{
    sales_approved: number;
    sales_pending: number;
    collected: number;
    sold_approved: number;
    sold_pending: number;
    awaiting: number;
    needs_changes: number;
  }>(sql`
    select
      coalesce(sum(sales_paise) filter (where status = 'approved'),0)::bigint as sales_approved,
      coalesce(sum(sales_paise) filter (where status = 'submitted'),0)::bigint as sales_pending,
      coalesce(sum(collected_paise) filter (where status in ('submitted','approved','changes_required')),0)::bigint as collected,
      coalesce(sum(total_sold) filter (where status = 'approved'),0)::int as sold_approved,
      coalesce(sum(total_sold) filter (where status = 'submitted'),0)::int as sold_pending,
      count(*) filter (where status = 'submitted')::int as awaiting,
      count(*) filter (where status = 'changes_required')::int as needs_changes
    from daily_report r where ${reportWhere(f)}`);
  const [m] = await rows<{ submitted: number; received: number; unconfirmed: number }>(sql`
    select coalesce(sum(amount_paise),0)::bigint as submitted,
           coalesce(sum(amount_paise) filter (where status = 'received'),0)::bigint as received,
           count(*) filter (where status = 'submitted')::int as unconfirmed
    from money_submission where ${moneyWhere(f)}`);
  const collected = Number(r.collected);
  const submitted = Number(m.submitted);
  return {
    salesApproved: Number(r.sales_approved),
    salesPending: Number(r.sales_pending),
    collected,
    submitted,
    receivedConfirmed: Number(m.received),
    unconfirmedSubmissions: Number(m.unconfirmed),
    pendingMoney: Math.max(collected - submitted, 0),
    soldApproved: Number(r.sold_approved),
    soldPending: Number(r.sold_pending),
    reportsAwaiting: Number(r.awaiting),
    reportsNeedChanges: Number(r.needs_changes),
  };
}

/** Everything a dashboard needs for a scope. */
export async function overview(f: Filters) {
  const [stock, moves, money] = await Promise.all([
    scopeStock(f.dhamId ?? null),
    movementTotals(f),
    moneySummary(f),
  ]);
  return {
    available: total(stock),
    distributed: moves.assign_devotee - moves.returned,
    ...money,
  };
}

/** Sales value per day for the last `days` days (approved + waiting reports). */
export async function salesByDay(f: Filters, days = 14, endDate: string) {
  const r = await rows<{ d: string; amount: number; qty: number }>(sql`
    select to_char(report_date,'YYYY-MM-DD') as d,
           sum(sales_paise)::bigint as amount, sum(total_sold)::int as qty
    from daily_report r
    where ${reportWhere(f)} and status in ('submitted','approved')
      and report_date > (${endDate}::date - ${days}::int) and report_date <= ${endDate}::date
    group by 1 order by 1`);
  const map = new Map(r.map((x) => [x.d, { amount: Number(x.amount), qty: Number(x.qty) }]));
  const out: { date: string; amount: number; qty: number }[] = [];
  const end = new Date(endDate + "T00:00:00Z");
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({ date: key, ...(map.get(key) ?? { amount: 0, qty: 0 }) });
  }
  return out;
}

/** One row per Dham with health indicators — used for "Which Dhams need attention?". */
export async function dhamHealth(today: string) {
  const r = await rows<{
    id: number;
    name: string;
    is_active: boolean;
    devotees: number;
    reported_today: number;
    awaiting: number;
    collected: number;
    submitted: number;
    sales: number;
  }>(sql`
    select d.id, d.name, d.is_active,
      (select count(*) from "user" u where u.dham_id = d.id and u.role = 'devotee' and u.is_active)::int as devotees,
      (select count(*) from daily_report r where r.dham_id = d.id and r.report_date = ${today} and r.status <> 'draft')::int as reported_today,
      (select count(*) from daily_report r where r.dham_id = d.id and r.status = 'submitted')::int as awaiting,
      (select coalesce(sum(collected_paise),0) from daily_report r where r.dham_id = d.id and r.status in ('submitted','approved','changes_required'))::bigint as collected,
      (select coalesce(sum(amount_paise),0) from money_submission m where m.dham_id = d.id and m.status <> 'disputed')::bigint as submitted,
      (select coalesce(sum(sales_paise),0) from daily_report r where r.dham_id = d.id and r.status = 'approved')::bigint as sales
    from dham d order by d.name`);
  return r.map((x) => {
    const pending = Math.max(Number(x.collected) - Number(x.submitted), 0);
    const reasons: string[] = [];
    if (x.is_active && x.devotees === 0) reasons.push("No devotees added yet");
    if (x.awaiting > 0) reasons.push(`${x.awaiting} report${x.awaiting > 1 ? "s" : ""} waiting for review`);
    if (pending > 0) reasons.push("Money yet to submit");
    if (x.devotees > 0 && x.reported_today < x.devotees)
      reasons.push(`${x.devotees - x.reported_today} devotee(s) have not reported today`);
    return {
      id: x.id,
      name: x.name,
      isActive: x.is_active,
      devotees: x.devotees,
      reportedToday: x.reported_today,
      awaiting: x.awaiting,
      collected: Number(x.collected),
      submitted: Number(x.submitted),
      pending,
      sales: Number(x.sales),
      reasons,
    };
  });
}

/** Per-devotee money position. */
export async function devoteeMoney(devoteeId: string) {
  const m = await moneySummary({ devoteeId });
  return m;
}
