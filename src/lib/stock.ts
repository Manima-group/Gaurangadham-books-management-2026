import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";

export type Holder = string; // "central" | `dham:${id}` | `devotee:${id}` | "sold" | "damaged" | "external"
export const H = {
  central: "central",
  dham: (id: number) => `dham:${id}`,
  devotee: (id: string) => `devotee:${id}`,
};

/** Anything that can run SQL: the shared db, or a transaction. */
export type Exec = { execute: (q: SQL) => Promise<unknown> };

type Row = Record<string, unknown>;
async function rows<T = Row>(q: SQL, exec: Exec = db): Promise<T[]> {
  return (await exec.execute(q)) as unknown as T[];
}

/* ------------------------------------------------------------------ */
/* Ledger deltas = latest checkpoint + only the movements after it.    */
/* Movements are never edited, so a checkpoint keyed by movement id    */
/* stays correct even when a movement is dated in the past.            */
/* ------------------------------------------------------------------ */

const DELTAS = sql`
  cp as (select id, upto_movement_id as upto from stock_checkpoint order by id desc limit 1),
  d as (
    select b.holder as h, b.dham_id, b.book_id, b.qty as delta
      from stock_checkpoint_balance b join cp on b.checkpoint_id = cp.id
    union all
    select to_holder, dham_id, book_id, qty from stock_movement where id > coalesce((select upto from cp), 0)
    union all
    select from_holder, dham_id, book_id, -qty from stock_movement where id > coalesce((select upto from cp), 0)
  )`;

/** Stock per book held by exactly one holder. */
export async function holderStock(holder: Holder, exec: Exec = db): Promise<Map<number, number>> {
  const r = await rows<{ book_id: number; qty: number }>(
    sql`with ${DELTAS} select book_id, sum(delta)::int as qty from d where h = ${holder} group by book_id`,
    exec,
  );
  return new Map(r.filter((x) => Number(x.qty) !== 0).map((x) => [Number(x.book_id), Number(x.qty)]));
}

/** Stock with every devotee of a Dham, per devotee per book. */
export async function devoteeStocksForDham(dhamId: number) {
  const r = await rows<{ holder: string; book_id: number; qty: number }>(sql`
    with ${DELTAS}
    select h as holder, book_id, sum(delta)::int as qty from d
    where dham_id = ${dhamId} and h like 'devotee:%'
    group by h, book_id having sum(delta) <> 0`);
  const out = new Map<string, Map<number, number>>();
  for (const x of r) {
    const id = x.holder.slice("devotee:".length);
    if (!out.has(id)) out.set(id, new Map());
    out.get(id)!.set(Number(x.book_id), Number(x.qty));
  }
  return out;
}

/**
 * Copies in hand within a scope, per book.
 * dhamId = null → whole organisation (central store + all Dhams + all devotees).
 * dhamId = n    → that Dham's store + its devotees.
 * beforeDate    → only movements dated before this day (opening balance for Daily Closing).
 */
export async function scopeStock(dhamId: number | null, beforeDate?: string) {
  const inside =
    dhamId == null
      ? sql`(h like 'dham:%' or h like 'devotee:%' or h = 'central')`
      : sql`(h like 'dham:%' or h like 'devotee:%')`;
  const dhamCond = dhamId == null ? sql`true` : sql`dham_id = ${dhamId}`;

  if (beforeDate) {
    // Dated balance: movement dates matter, so add up the (indexed) history for this scope.
    const r = await rows<{ book_id: number; qty: number }>(sql`
      select book_id, sum(delta)::int as qty from (
        select to_holder as h, book_id, qty as delta from stock_movement where ${dhamCond} and movement_date < ${beforeDate}
        union all
        select from_holder as h, book_id, -qty from stock_movement where ${dhamCond} and movement_date < ${beforeDate}
      ) x where ${inside} group by book_id`);
    return new Map(r.map((x) => [Number(x.book_id), Number(x.qty)]));
  }

  const r = await rows<{ book_id: number; qty: number }>(sql`
    with ${DELTAS}
    select book_id, sum(delta)::int as qty from d where ${dhamCond} and ${inside} group by book_id`);
  return new Map(r.map((x) => [Number(x.book_id), Number(x.qty)]));
}

export function total(m: Map<unknown, number>) {
  let t = 0;
  for (const v of m.values()) t += v;
  return t;
}

/** Copies a devotee has reported (sold/returned/damaged) in reports that are not yet approved. */
export async function pendingReportedQty(devoteeId: string, excludeReportId?: number, exec: Exec = db) {
  const r = await rows<{ book_id: number; qty: number }>(
    sql`
    select l.book_id, sum(l.sold_qty + l.returned_qty + l.damaged_qty)::int as qty
    from daily_report_line l join daily_report r on r.id = l.report_id
    where r.devotee_id = ${devoteeId} and r.status = 'submitted'
      ${excludeReportId ? sql`and r.id <> ${excludeReportId}` : sql``}
    group by l.book_id`,
    exec,
  );
  return new Map(r.map((x) => [Number(x.book_id), Number(x.qty)]));
}

/** Movement totals by kind in a scope and date range (for daily closing & monitoring). */
export async function movementTotals(f: {
  dhamId?: number | null;
  from?: string;
  to?: string;
  devoteeId?: string;
  campaignId?: number;
}) {
  // Undone movements and their corrections cancel out, so neither is counted by kind.
  const conds: SQL[] = [sql`reversed_by is null`, sql`kind <> 'correction'`];
  if (f.dhamId != null) conds.push(sql`dham_id = ${f.dhamId}`);
  if (f.from) conds.push(sql`movement_date >= ${f.from}`);
  if (f.to) conds.push(sql`movement_date <= ${f.to}`);
  if (f.devoteeId) conds.push(sql`devotee_id = ${f.devoteeId}`);
  if (f.campaignId) conds.push(sql`campaign_id = ${f.campaignId}`);
  const where = sql.join(conds, sql` and `);
  const r = await rows<{ kind: string; qty: number }>(
    sql`select kind, sum(qty)::int as qty from stock_movement where ${where} group by kind`,
  );
  const out: Record<string, number> = {
    received: 0,
    assign_dham: 0,
    assign_devotee: 0,
    sold: 0,
    returned: 0,
    damaged: 0,
  };
  for (const x of r) out[x.kind] = Number(x.qty);
  // For one Dham, "received" means: arrived directly at the Dham + sent from the central store.
  if (f.dhamId != null) out.received = out.received + out.assign_dham;
  return out;
}

/* ------------------------------------------------------------------ */
/* Locks — make "check stock, then write" safe when two people click   */
/* at the same moment. Locks last until the transaction ends.          */
/* ------------------------------------------------------------------ */

/** Serialise every write that takes stock from these holders (sorted, so two writers never deadlock). */
export async function lockHolders(tx: Exec, holders: string[]) {
  for (const h of [...new Set(holders)].sort()) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"stock:" + h}))`);
  }
}

/** A named lock for anything else that must not run twice at once (e.g. one devotee's money). */
export async function lockKey(tx: Exec, key: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
}

/* ------------------------------------------------------------------ */
/* Checkpoints                                                          */
/* ------------------------------------------------------------------ */

/** Save current balances so later reads only add up newer movements. Returns the new checkpoint, or null. */
export async function createCheckpoint() {
  return db.transaction(async (tx) => {
    // Only one checkpoint at a time; skip if another one is being made right now.
    const [{ ok }] = (await tx.execute(sql`select pg_try_advisory_xact_lock(hashtext('stock-checkpoint')) as ok`)) as unknown as { ok: boolean }[];
    if (!ok) return null;
    const [{ upto }] = (await tx.execute(sql`select coalesce(max(id), 0)::int as upto from stock_movement`)) as unknown as { upto: number }[];
    const [last] = (await tx.execute(sql`select id, upto_movement_id as upto from stock_checkpoint order by id desc limit 1`)) as unknown as { id: number; upto: number }[];
    if (last && Number(last.upto) >= Number(upto)) return null; // nothing new
    const [cp] = (await tx.execute(sql`insert into stock_checkpoint (upto_movement_id) values (${upto}) returning id`)) as unknown as { id: number }[];
    // New balances = previous checkpoint + movements since it (or full history if there is none).
    await tx.execute(sql`
      insert into stock_checkpoint_balance (checkpoint_id, holder, dham_id, book_id, qty)
      select ${cp.id}, h, dham_id, book_id, sum(delta)::int from (
        select holder as h, dham_id, book_id, qty as delta from stock_checkpoint_balance where checkpoint_id = ${last?.id ?? -1}
        union all
        select to_holder, dham_id, book_id, qty from stock_movement where id > ${last?.upto ?? 0} and id <= ${upto}
        union all
        select from_holder, dham_id, book_id, -qty from stock_movement where id > ${last?.upto ?? 0} and id <= ${upto}
      ) x group by h, dham_id, book_id having sum(delta) <> 0`);
    // Keep only the newest 3 checkpoints.
    await tx.execute(sql`delete from stock_checkpoint_balance where checkpoint_id in (select id from stock_checkpoint order by id desc offset 3)`);
    await tx.execute(sql`delete from stock_checkpoint where id in (select id from stock_checkpoint order by id desc offset 3)`);
    return { id: Number(cp.id), uptoMovementId: Number(upto) };
  });
}

/** Called in the background after page loads: makes a checkpoint at most every 12 hours, and only when worth it. */
export async function maybeCheckpoint(minNewMovements = 500) {
  const [s] = (await db.execute(sql`
    select (select max(created_at) from stock_checkpoint) as last_at,
           (select count(*) from stock_movement where id > coalesce((select upto_movement_id from stock_checkpoint order by id desc limit 1), 0))::int as pending`)) as unknown as {
    last_at: string | null;
    pending: number;
  }[];
  const age = s.last_at ? Date.now() - new Date(s.last_at).getTime() : Infinity;
  if (Number(s.pending) >= minNewMovements && age > 12 * 3600 * 1000) return createCheckpoint();
  return null;
}
