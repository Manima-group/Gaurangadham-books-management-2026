import "server-only";
import { notFound } from "next/navigation";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import type { AppUser } from "./session";
import { addDays, todayIST } from "./format";
import { H, holderStock, total } from "./stock";

/**
 * Read-only views for the Dham → Devotee → Books / Sales / History hierarchy.
 *
 * Quantities come from the one stock ledger (stock_movement). An undone movement and the
 * correction that undid it are both left out, which nets to zero — the same rule
 * as devoteeBooks() and movementTotals(), so every role sees the same numbers.
 * Sale prices, amounts and places come from the devotee's daily report lines.
 */

type Row = Record<string, unknown>;
const rows = async <T = Row>(q: SQL) => (await db.execute(q)) as unknown as T[];
const n = (v: unknown) => Number(v ?? 0);
const LIVE = sql`m.reversed_by is null and m.kind <> 'correction'`;

/* ------------------------------------------------------------------ */
/* Access                                                              */
/* ------------------------------------------------------------------ */

/** Admin: any Dham. Manager: only their own. Everyone else: not found. Enforced on the server. */
export function assertDhamAccess(u: AppUser, dhamId: number) {
  if (u.role === "admin") return;
  if (u.role === "manager" && u.dhamId === dhamId) return;
  notFound();
}

export async function devoteeInDham(devoteeId: string, dhamId: number) {
  const [r] = await rows<{ id: string; name: string; phone: string | null; role: string; is_active: boolean }>(sql`
    select id, name, phone, role, is_active from "user" where id = ${devoteeId} and dham_id = ${dhamId} and role in ('devotee','manager')`);
  return r ?? null;
}

/* ------------------------------------------------------------------ */
/* Dates                                                               */
/* ------------------------------------------------------------------ */

export type Preset = "today" | "7d" | "month" | "all" | "custom";
export const PRESET_LABEL: Record<Exclude<Preset, "custom">, string> = { today: "Today", "7d": "Last 7 days", month: "This month", all: "All time" };
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Dates are business days in India time (report_date / movement_date are stored that way). */
export function dateRange(sp: { preset?: string; from?: string; to?: string }) {
  const t = todayIST();
  let from = sp.from && ISO.test(sp.from) ? sp.from : undefined;
  let to = sp.to && ISO.test(sp.to) ? sp.to : undefined;
  let preset: Preset = (sp.preset as Preset) || (from || to ? "custom" : "all");
  if (preset === "today") (from = t), (to = t);
  else if (preset === "7d") (from = addDays(t, -6)), (to = t);
  else if (preset === "month") (from = t.slice(0, 8) + "01"), (to = t);
  else if (preset === "all") (from = undefined), (to = undefined);
  else preset = "custom";
  if (from && to && from > to) [from, to] = [to, from];
  return { preset, from, to };
}

/* ------------------------------------------------------------------ */
/* Level 1 — Dhams                                                     */
/* ------------------------------------------------------------------ */

export type DhamOverview = {
  id: number; name: string; city: string | null; active: boolean; devotees: number;
  received: number; available: number; allocated: number; sold: number; returned: number; damaged: number;
  withDevotees: number; amount: number;
};

export async function dhamOverview(onlyDhamId?: number): Promise<DhamOverview[]> {
  const r = await rows<Row>(sql`
    select d.id, d.name, d.city, d.is_active,
      (select count(*) from "user" u where u.dham_id = d.id and u.role = 'devotee' and u.is_active)::int as devotees,
      coalesce(mv.received,0)::int as received, coalesce(mv.allocated,0)::int as allocated,
      coalesce(mv.sold,0)::int as sold, coalesce(mv.returned,0)::int as returned, coalesce(mv.damaged,0)::int as damaged,
      coalesce(mv.dev_in,0)::int - coalesce(mv.dev_out,0)::int as with_devotees,
      coalesce(sa.amount,0)::bigint as amount
    from dham d
    left join (
      select m.dham_id,
        sum(m.qty) filter (where m.kind in ('received','assign_dham','transfer_in') and m.to_holder = 'dham:' || m.dham_id) as received,
        sum(m.qty) filter (where m.kind = 'assign_devotee') as allocated,
        sum(m.qty) filter (where m.kind = 'sold') as sold,
        sum(m.qty) filter (where m.kind = 'returned') as returned,
        sum(m.qty) filter (where m.kind = 'damaged') as damaged,
        sum(m.qty) filter (where m.to_holder like 'devotee:%') as dev_in,
        sum(m.qty) filter (where m.from_holder like 'devotee:%') as dev_out
      from stock_movement m where ${LIVE} and m.dham_id is not null group by m.dham_id
    ) mv on mv.dham_id = d.id
    left join (
      select r.dham_id, sum(l.amount_paise) as amount
      from daily_report_line l join daily_report r on r.id = l.report_id
      where r.status = 'approved' group by r.dham_id
    ) sa on sa.dham_id = d.id
    where ${onlyDhamId != null ? sql`d.id = ${onlyDhamId}` : sql`true`}
    order by d.is_active desc, d.name`);
  // "Available at the Dham" is read straight from the ledger balance of the Dham's shelf.
  const avail = await Promise.all(r.map((x) => holderStock(H.dham(n(x.id)))));
  return r.map((x, i) => ({
    id: n(x.id), name: String(x.name), city: (x.city as string) ?? null, active: !!x.is_active, devotees: n(x.devotees),
    received: n(x.received), available: total(avail[i]), allocated: n(x.allocated), sold: n(x.sold),
    returned: n(x.returned), damaged: n(x.damaged), withDevotees: n(x.with_devotees), amount: n(x.amount),
  }));
}

/* ------------------------------------------------------------------ */
/* Level 2 — Devotees of a Dham                                        */
/* ------------------------------------------------------------------ */

export const DEVOTEE_SORT = {
  name: { label: "Name", sql: sql`u.name` },
  allocated: { label: "Books given", sql: sql`allocated` },
  sold: { label: "Books sold", sql: sql`sold` },
  remaining: { label: "Books left", sql: sql`remaining` },
  amount: { label: "Sales amount", sql: sql`amount` },
  last: { label: "Last sale", sql: sql`last_sale` },
} as const;
export type DevoteeSort = keyof typeof DEVOTEE_SORT;
export const PAGE_SIZE = 20;

export type DevoteeRow = {
  id: string; name: string; phone: string | null; role: string; active: boolean;
  allocated: number; sold: number; returned: number; damaged: number; remaining: number; amount: number; pendingSold: number; lastSale: string | null;
};

export async function dhamDevotees(
  dhamId: number,
  f: { q?: string; sort?: string; dir?: string; has?: string; page?: number },
): Promise<{ rows: DevoteeRow[]; total: number; page: number; pages: number }> {
  const sort: DevoteeSort = f.sort && f.sort in DEVOTEE_SORT ? (f.sort as DevoteeSort) : "name";
  const desc = f.dir ? f.dir === "desc" : sort !== "name";
  const q = f.q?.trim();
  const page = Math.max(1, f.page || 1);
  const conds: SQL[] = [
    sql`u.dham_id = ${dhamId}`,
    // Devotees, plus managers who also distribute books themselves.
    sql`(u.role = 'devotee' or (u.role = 'manager' and coalesce(x.allocated,0) > 0))`,
  ];
  if (q) {
    const digits = q.replace(/\D/g, "");
    conds.push(digits.length >= 3
      ? sql`(u.name ilike ${"%" + q + "%"} or coalesce(u.phone,'') like ${"%" + digits + "%"})`
      : sql`u.name ilike ${"%" + q + "%"}`);
  }
  if (f.has === "with") conds.push(sql`coalesce(x.remaining,0) > 0`);
  if (f.has === "none") conds.push(sql`coalesce(x.remaining,0) = 0`);
  if (f.has === "inactive") conds.push(sql`not u.is_active`);
  else conds.push(sql`u.is_active`);

  const base = sql`
    from "user" u
    left join (
      select m.devotee_id,
        sum(m.qty) filter (where m.kind = 'assign_devotee') as allocated,
        sum(m.qty) filter (where m.kind = 'sold') as sold,
        sum(m.qty) filter (where m.kind = 'returned') as returned,
        sum(m.qty) filter (where m.kind = 'damaged') as damaged,
        coalesce(sum(m.qty) filter (where m.kind = 'assign_devotee'),0)
          - coalesce(sum(m.qty) filter (where m.kind in ('sold','returned','damaged')),0) as remaining
      from stock_movement m where ${LIVE} and m.devotee_id is not null group by m.devotee_id
    ) x on x.devotee_id = u.id
    left join (
      select r.devotee_id,
        sum(l.amount_paise) filter (where r.status = 'approved') as amount,
        sum(l.sold_qty) filter (where r.status = 'submitted') as pending_sold,
        max(r.report_date) filter (where l.sold_qty > 0 and r.status in ('submitted','approved')) as last_sale
      from daily_report_line l join daily_report r on r.id = l.report_id group by r.devotee_id
    ) s on s.devotee_id = u.id
    where ${sql.join(conds, sql` and `)}`;

  const [{ c }] = await rows<{ c: number }>(sql`select count(*)::int as c ${base}`);
  const pages = Math.max(1, Math.ceil(n(c) / PAGE_SIZE));
  const p = Math.min(page, pages);
  const r = await rows<Row>(sql`
    select u.id, u.name, u.phone, u.role, u.is_active,
      coalesce(x.allocated,0)::int as allocated, coalesce(x.sold,0)::int as sold,
      coalesce(x.returned,0)::int as returned, coalesce(x.damaged,0)::int as damaged,
      coalesce(x.remaining,0)::int as remaining, coalesce(s.amount,0)::bigint as amount,
      coalesce(s.pending_sold,0)::int as pending_sold, to_char(s.last_sale,'YYYY-MM-DD') as last_sale
    ${base}
    order by ${DEVOTEE_SORT[sort].sql} ${desc ? sql`desc nulls last` : sql`asc nulls last`}, u.name
    limit ${PAGE_SIZE} offset ${(p - 1) * PAGE_SIZE}`);
  return {
    total: n(c), page: p, pages,
    rows: r.map((x) => ({
      id: String(x.id), name: String(x.name), phone: (x.phone as string) ?? null, role: String(x.role), active: !!x.is_active,
      allocated: n(x.allocated), sold: n(x.sold), returned: n(x.returned), damaged: n(x.damaged), remaining: n(x.remaining),
      amount: n(x.amount), pendingSold: n(x.pending_sold), lastSale: (x.last_sale as string) ?? null,
    })),
  };
}

/** Book-wise stock for one Dham: what reached the Dham, what is on its shelf, with devotees, sold. */
export async function dhamInventory(dhamId: number) {
  const r = await rows<Row>(sql`
    select b.id, b.title, b.language, b.size,
      coalesce(sum(m.qty) filter (where m.kind in ('received','assign_dham') and m.to_holder = ${H.dham(dhamId)}),0)::int as received,
      coalesce(sum(m.qty) filter (where m.kind = 'assign_devotee'),0)::int as allocated,
      coalesce(sum(m.qty) filter (where m.kind = 'sold'),0)::int as sold,
      coalesce(sum(m.qty) filter (where m.kind = 'returned'),0)::int as returned,
      coalesce(sum(m.qty) filter (where m.kind = 'damaged'),0)::int as damaged,
      (coalesce(sum(m.qty) filter (where m.to_holder like 'devotee:%'),0) - coalesce(sum(m.qty) filter (where m.from_holder like 'devotee:%'),0))::int as with_devotees
    from stock_movement m join book b on b.id = m.book_id
    where ${LIVE} and m.dham_id = ${dhamId}
    group by b.id order by b.title, b.language`);
  const shelf = await holderStock(H.dham(dhamId));
  return r.map((x) => ({
    id: n(x.id), title: String(x.title), language: String(x.language), size: String(x.size),
    received: n(x.received), available: shelf.get(n(x.id)) ?? 0, allocated: n(x.allocated), sold: n(x.sold),
    returned: n(x.returned), damaged: n(x.damaged), withDevotees: n(x.with_devotees),
  }));
}

/* ------------------------------------------------------------------ */
/* Level 3 — One devotee: sales lines and ledger history               */
/* ------------------------------------------------------------------ */

export type SalesFilter = { from?: string; to?: string; book?: number; place?: string; status?: string; page?: number };
export const SALE_STATUSES = ["approved", "submitted", "changes_required", "rejected", "draft"] as const;

export async function devoteeSales(devoteeId: string, f: SalesFilter) {
  const c: SQL[] = [sql`r.devotee_id = ${devoteeId}`, sql`l.sold_qty > 0`];
  if (f.from) c.push(sql`r.report_date >= ${f.from}`);
  if (f.to) c.push(sql`r.report_date <= ${f.to}`);
  if (f.book) c.push(sql`l.book_id = ${f.book}`);
  if (f.place === "__none") c.push(sql`v.id is null`);
  else if (f.place) c.push(sql`v.name = ${f.place}`);
  if (f.status && (SALE_STATUSES as readonly string[]).includes(f.status)) c.push(sql`r.status = ${f.status}`);
  else c.push(sql`r.status <> 'draft'`); // unsent drafts are not sales yet
  const where = sql.join(c, sql` and `);
  const from = sql`from daily_report_line l join daily_report r on r.id = l.report_id join book b on b.id = l.book_id
    left join daily_report_venue v on v.id = l.venue_id where ${where}`;
  const [t] = await rows<Row>(sql`select count(*)::int as c, coalesce(sum(l.sold_qty),0)::int as qty,
    coalesce(sum(l.amount_paise) filter (where r.status = 'approved'),0)::bigint as approved_amt,
    coalesce(sum(l.amount_paise) filter (where r.status = 'submitted'),0)::bigint as pending_amt ${from}`);
  const pages = Math.max(1, Math.ceil(n(t.c) / 50));
  const page = Math.min(Math.max(1, f.page || 1), pages);
  const r = await rows<Row>(sql`
    select l.id, r.id as report_id, to_char(r.report_date,'YYYY-MM-DD') as date, r.status, b.title, b.language,
      l.sold_qty, l.price_paise, l.amount_paise, v.name as place, v.area, v.time_slot
    ${from} order by r.report_date desc, r.id desc, v.sort nulls last, b.title
    limit 50 offset ${(page - 1) * 50}`);
  return {
    total: n(t.c), qty: n(t.qty), approvedAmount: n(t.approved_amt), pendingAmount: n(t.pending_amt), page, pages,
    rows: r.map((x) => ({
      id: n(x.id), reportId: n(x.report_id), date: String(x.date), status: String(x.status),
      book: `${x.title} (${x.language})`, qty: n(x.sold_qty), price: n(x.price_paise), amount: n(x.amount_paise),
      place: (x.place as string) ?? null, area: (x.area as string) ?? null, slot: (x.time_slot as string) ?? null,
    })),
  };
}

export async function devoteePlaces(devoteeId: string) {
  const r = await rows<{ name: string }>(sql`
    select distinct v.name from daily_report_venue v join daily_report r on r.id = v.report_id
    where r.devotee_id = ${devoteeId} order by v.name`);
  return r.map((x) => x.name);
}

export type HistoryFilter = { from?: string; to?: string; book?: number; kind?: string; status?: string; page?: number };
export const HISTORY_KINDS = ["assign_devotee", "sold", "returned", "damaged", "correction"] as const;

export async function devoteeHistory(devoteeId: string, f: HistoryFilter) {
  const c: SQL[] = [sql`m.devotee_id = ${devoteeId}`];
  if (f.from) c.push(sql`m.movement_date >= ${f.from}`);
  if (f.to) c.push(sql`m.movement_date <= ${f.to}`);
  if (f.book) c.push(sql`m.book_id = ${f.book}`);
  if (f.kind && (HISTORY_KINDS as readonly string[]).includes(f.kind)) c.push(sql`m.kind = ${f.kind}`);
  if (f.status === "active") c.push(sql`m.reversed_by is null and m.kind <> 'correction'`);
  if (f.status === "undone") c.push(sql`(m.reversed_by is not null or m.kind = 'correction')`);
  const where = sql.join(c, sql` and `);
  const [t] = await rows<{ c: number }>(sql`select count(*)::int as c from stock_movement m where ${where}`);
  const pages = Math.max(1, Math.ceil(n(t.c) / 50));
  const page = Math.min(Math.max(1, f.page || 1), pages);
  const r = await rows<Row>(sql`
    select m.id, m.kind, m.qty, to_char(m.movement_date,'YYYY-MM-DD') as date, m.created_at, m.reference, m.note,
      m.report_id, m.reversed_by, m.from_holder, m.to_holder, b.title, b.language, coalesce(cu.name,'—') as by_name
    from stock_movement m join book b on b.id = m.book_id left join "user" cu on cu.id = m.created_by
    where ${where} order by m.movement_date desc, m.id desc limit 50 offset ${(page - 1) * 50}`);
  return {
    total: n(t.c), page, pages,
    rows: r.map((x) => ({
      id: n(x.id), kind: String(x.kind), qty: n(x.qty), date: String(x.date), at: x.created_at as Date,
      reference: (x.reference as string) ?? null, note: (x.note as string) ?? null, reportId: x.report_id == null ? null : n(x.report_id),
      undone: x.reversed_by != null, toDevotee: String(x.to_holder).startsWith("devotee:"),
      book: `${x.title} (${x.language})`, by: String(x.by_name),
    })),
  };
}

/** Sale amounts per book for one devotee: approved, and still waiting for approval. */
export async function devoteeAmounts(devoteeId: string) {
  const r = await rows<{ book_id: number; approved: number; pending: number; pending_qty: number }>(sql`
    select l.book_id,
      coalesce(sum(l.amount_paise) filter (where r.status = 'approved'),0)::bigint as approved,
      coalesce(sum(l.amount_paise) filter (where r.status = 'submitted'),0)::bigint as pending,
      coalesce(sum(l.sold_qty) filter (where r.status = 'submitted'),0)::int as pending_qty
    from daily_report_line l join daily_report r on r.id = l.report_id
    where r.devotee_id = ${devoteeId} group by l.book_id`);
  const byBook = new Map(r.map((x) => [n(x.book_id), { approved: n(x.approved), pending: n(x.pending), pendingQty: n(x.pending_qty) }]));
  let approved = 0, pending = 0, pendingQty = 0;
  for (const v of byBook.values()) (approved += v.approved), (pending += v.pending), (pendingQty += v.pendingQty);
  return { byBook, approved, pending, pendingQty };
}
