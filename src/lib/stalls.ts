import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { AppUser } from "./session";
import type { Exec } from "./stock";

export type Stall = typeof schema.bookStall.$inferSelect;

/** Stalls whose confirmed contributions are still reserved (not yet posted to the ledger). */
export const RESERVING = ["draft", "active", "closing", "disputed", "pending_approval"] as const;
export const OPEN = [...RESERVING, "pending_settlement"] as const;
export const ref = (id: number) => `ST-${String(id).padStart(5, "0")}`;

/** Copies reserved per holder per book by open stalls (owner's own holder: devotee:<id>). */
export const stallReservationsSql = sql`
  select 'devotee:' || c.user_id as holder, c.book_id, sum(c.qty)::int as qty
  from stall_contribution c join book_stall s on s.id = c.stall_id
  where c.status = 'confirmed' and s.status in ('draft','active','closing','disputed','pending_approval')
  group by 1, 2`;

export async function stallReservedFor(holder: string, exec: Exec = db) {
  if (!holder.startsWith("devotee:")) return new Map<number, number>();
  const r = (await exec.execute(sql`
    select c.book_id, sum(c.qty)::int as qty from stall_contribution c join book_stall s on s.id = c.stall_id
    where c.status = 'confirmed' and s.status in ('draft','active','closing','disputed','pending_approval') and c.user_id = ${holder.slice(8)}
    group by c.book_id`)) as unknown as { book_id: number; qty: number }[];
  return new Map(r.map((x) => [Number(x.book_id), Number(x.qty)]));
}

/** Money a person received at stalls (reversals are negative rows). Counted in their "collected" money. */
export const stallCollectedBy = (userIdCol: ReturnType<typeof sql>) =>
  sql`coalesce((select sum(ss.total_paise) from stall_sale ss where ss.recipient_id = ${userIdCol}), 0)`;
/** Stall money received by people of a Dham (optionally up to a date, IST). */
export const stallCollectedInDham = (dhamIdCol: ReturnType<typeof sql>, upTo?: string) =>
  sql`coalesce((select sum(ss.total_paise) from stall_sale ss join "user" su on su.id = ss.recipient_id where su.dham_id = ${dhamIdCol}
    ${upTo ? sql`and (ss.created_at at time zone 'Asia/Kolkata')::date <= ${upTo}` : sql``}), 0)`;

/* ---------------- Who may do what ---------------- */

export const canCreateStall = (u: AppUser) => u.approvalStatus === "approved" && u.dhamId != null && (u.role === "manager" || (u.role === "devotee" && u.canDistribute));

export async function participants(stallId: number, exec: Exec = db) {
  const r = (await exec.execute(sql`
    select p.user_id, p.status, p.dham_id, u.name, u.phone, u.role, d.name as dham
    from stall_participant p join "user" u on u.id = p.user_id left join dham d on d.id = p.dham_id
    where p.stall_id = ${stallId} order by (p.status = 'accepted') desc, u.name`)) as unknown as {
    user_id: string; status: "invited" | "accepted" | "declined" | "removed"; dham_id: number; name: string; phone: string | null; role: string; dham: string;
  }[];
  return r;
}

/** Dhams whose Sector Sevak must approve the closing: every Dham with an owner who contributed. */
export async function participatingDhams(stallId: number, exec: Exec = db) {
  const r = (await exec.execute(sql`
    select distinct p.dham_id from stall_participant p
    where p.stall_id = ${stallId} and exists (select 1 from stall_contribution c where c.stall_id = p.stall_id and c.user_id = p.user_id and c.status = 'confirmed')`)) as unknown as { dham_id: number }[];
  return r.map((x) => Number(x.dham_id));
}

export type Access = { view: boolean; coordinator: boolean; participant: boolean; sevak: boolean; seeSources: boolean };

/** Visibility: participants (any status but removed), the coordinator, Sector Sevaks of involved Dhams, Chakra Sevaks. */
export async function stallAccess(u: AppUser, s: Stall): Promise<Access> {
  const none = { view: false, coordinator: false, participant: false, sevak: false, seeSources: false };
  if (u.approvalStatus !== "approved") return none;
  const [p] = await db.select().from(schema.stallParticipant).where(and(eq(schema.stallParticipant.stallId, s.id), eq(schema.stallParticipant.userId, u.id)));
  const participant = !!p && p.status === "accepted";
  let sevak = u.role === "admin";
  if (!sevak && u.role === "manager" && u.dhamId != null) {
    if (s.organizingDhamId === u.dhamId) sevak = true;
    else {
      const [x] = await db.select({ id: schema.stallParticipant.id }).from(schema.stallParticipant)
        .where(and(eq(schema.stallParticipant.stallId, s.id), eq(schema.stallParticipant.dhamId, u.dhamId)));
      sevak = !!x;
    }
  }
  const coordinator = s.coordinatorId === u.id;
  const view = sevak || coordinator || (!!p && p.status !== "removed");
  // Stock source is never shown to devotees — only to Sevaks within scope.
  return { view, coordinator, participant: participant || coordinator, sevak, seeSources: sevak && (u.role === "manager" || u.role === "admin") };
}

/** Stalls a person can see in the list. */
export async function stallsFor(u: AppUser) {
  if (u.approvalStatus !== "approved") return [];
  const where =
    u.role === "admin"
      ? sql`true`
      : u.role === "manager"
        ? sql`(s.organizing_dham_id = ${u.dhamId ?? -1} or exists (select 1 from stall_participant p where p.stall_id = s.id and (p.dham_id = ${u.dhamId ?? -1} or p.user_id = ${u.id})))`
        : sql`(s.coordinator_id = ${u.id} or exists (select 1 from stall_participant p where p.stall_id = s.id and p.user_id = ${u.id} and p.status <> 'removed'))`;
  return (await db.execute(sql`
    select s.*, d.name as dham, cu.name as coordinator,
      (select status from stall_participant p where p.stall_id = s.id and p.user_id = ${u.id}) as my_status,
      coalesce((select sum(l.qty) from stall_sale_line l where l.stall_id = s.id), 0)::int as sold
    from book_stall s join dham d on d.id = s.organizing_dham_id join "user" cu on cu.id = s.coordinator_id
    where ${where} order by (s.status in ('closed','cancelled')), s.event_date desc, s.id desc limit 200`)) as unknown as (Record<string, unknown> & {
    id: number; name: string; status: Stall["status"]; event_date: string; dham: string; coordinator: string; my_status: string | null; sold: number; mode: string; location: string | null;
  })[];
}

/** Per title: confirmed copies given, net copies sold, price. */
export async function stallStock(stallId: number, exec: Exec = db) {
  const r = (await exec.execute(sql`
    select b.id as book_id, b.title, b.language, b.price_paise,
      coalesce((select sum(c.qty) from stall_contribution c where c.stall_id = ${stallId} and c.book_id = b.id and c.status = 'confirmed'), 0)::int as contributed,
      coalesce((select sum(l.qty) from stall_sale_line l where l.stall_id = ${stallId} and l.book_id = b.id), 0)::int as sold
    from book b
    where b.id in (select book_id from stall_contribution where stall_id = ${stallId} and status = 'confirmed')
    order by b.title`)) as unknown as { book_id: number; title: string; language: string; price_paise: number; contributed: number; sold: number }[];
  return r.map((x) => ({ ...x, book_id: Number(x.book_id), contributed: Number(x.contributed), sold: Number(x.sold), left: Number(x.contributed) - Number(x.sold) }));
}

/** Money each person received at the stall, and how much of it they handed over (confirmed received). */
export async function stallMoney(stallId: number, exec: Exec = db) {
  const r = (await exec.execute(sql`
    select ss.recipient_id as user_id, u.name, sum(ss.total_paise)::int as collected, sum(ss.cash_paise)::int as cash, sum(ss.upi_paise)::int as upi,
      coalesce((select sum(m.amount_paise) from money_submission m where m.stall_id = ${stallId} and m.devotee_id = ss.recipient_id and m.status = 'received'), 0)::int as received,
      coalesce((select sum(m.amount_paise) from money_submission m where m.stall_id = ${stallId} and m.devotee_id = ss.recipient_id and m.status = 'submitted'), 0)::int as submitted
    from stall_sale ss join "user" u on u.id = ss.recipient_id
    where ss.stall_id = ${stallId} group by ss.recipient_id, u.name order by u.name`)) as unknown as {
    user_id: string; name: string; collected: number; cash: number; upi: number; received: number; submitted: number;
  }[];
  return r.map((x) => ({ ...x, collected: Number(x.collected), cash: Number(x.cash), upi: Number(x.upi), received: Number(x.received), submitted: Number(x.submitted) }));
}

export async function logStall(exec: Exec, stallId: number, actorId: string, action: string, detail?: Record<string, unknown>) {
  await (exec as typeof db).insert(schema.stallEvent).values({ stallId, actorId, action, detail: detail ?? null });
}

/** Stalls in which this person collected money (for tagging a money handover). */
export async function myStallsWithMoney(userId: string) {
  const r = await db
    .selectDistinct({ id: schema.bookStall.id, name: schema.bookStall.name })
    .from(schema.bookStall)
    .innerJoin(schema.stallSale, eq(schema.stallSale.stallId, schema.bookStall.id))
    .where(and(eq(schema.stallSale.recipientId, userId), inArray(schema.bookStall.status, [...OPEN, "closed"])));
  return r;
}

/** Close a stall once every person who received its money has handed it over (confirmed received by a Sevak). */
export async function settleIfDone(stallId: number, actor: string) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"stall:" + stallId}))`);
    const [s] = await tx.select().from(schema.bookStall).where(eq(schema.bookStall.id, stallId));
    if (!s || s.status !== "pending_settlement") return;
    const r = (await tx.execute(sql`
      select ss.recipient_id, sum(ss.total_paise)::int as due,
        coalesce((select sum(m.amount_paise) from money_submission m where m.stall_id = ${stallId} and m.devotee_id = ss.recipient_id and m.status = 'received'),0)::int as got
      from stall_sale ss where ss.stall_id = ${stallId} group by ss.recipient_id`)) as unknown as { due: number; got: number }[];
    if (!r.every((x) => Number(x.got) >= Number(x.due))) return;
    const done = await tx.update(schema.bookStall).set({ status: "closed", closedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(schema.bookStall.id, stallId), eq(schema.bookStall.status, "pending_settlement"))).returning({ id: schema.bookStall.id });
    if (done.length) await logStall(tx, stallId, actor, "status:closed", { settled: true });
  });
}
