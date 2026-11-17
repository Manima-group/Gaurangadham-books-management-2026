import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import type { AppUser } from "./session";
import { TRANSFER_STATUS } from "./terms";
import { ref } from "./transfers";
import type { ReportSpec } from "./export/render";
import { todayIST } from "./format";

/**
 * Line-level Books Transfer report: one row per book per transfer, with requested, approved,
 * dispatched, received and remaining quantities. Chakra Sevak: everything; Sector Sevak: only
 * transfers that start or end at their Dham.
 */
export type TransferFilter = {
  view?: string; srcDham?: string; dstDham?: string; sender?: string; receiver?: string; book?: string;
  status?: string; ref?: string; from?: string; to?: string;
};

export const TRANSFER_VIEWS: Record<string, { label: string; status?: string[]; toDevotee?: boolean }> = {
  all: { label: "Transfer history" },
  pending: { label: "Pending requests", status: ["requested"] },
  approvals: { label: "Approved, not yet sent", status: ["approved", "accepted"] },
  transit: { label: "In-transit inventory", status: ["sent", "partially_received", "disputed"] },
  completed: { label: "Completed transfers", status: ["completed", "received"] },
  disputed: { label: "Disputed / partly received", status: ["disputed", "partially_received"] },
  devotees: { label: "Books given to devotees (transfer)", toDevotee: true },
  dham: { label: "Dham-wise transfers" },
  devotee: { label: "Devotee-wise transfers" },
  audit: { label: "Stock movement audit" },
};

const DISPATCHED = sql`case when t.status in ('sent','partially_received','disputed','received','completed') then coalesce(l.sent_qty,0) else 0 end`;
const RECEIVED = sql`case when t.status = 'received' then coalesce(l.sent_qty,0) else l.received_qty end`;

function where(u: AppUser, f: TransferFilter) {
  const c: SQL[] = [];
  if (u.role === "manager") c.push(sql`(t.from_dham_id = ${u.dhamId ?? -1} or t.to_dham_id = ${u.dhamId ?? -1})`);
  const v = TRANSFER_VIEWS[f.view ?? "all"];
  if (v?.status) c.push(sql`t.status in (${sql.join(v.status.map((s) => sql`${s}`), sql`, `)})`);
  if (v?.toDevotee) c.push(sql`t.to_holder like 'devotee:%'`);
  if (f.srcDham) c.push(sql`t.from_dham_id = ${Number(f.srcDham)}`);
  if (f.dstDham) c.push(sql`t.to_dham_id = ${Number(f.dstDham)}`);
  if (f.sender) c.push(sql`(t.from_holder = ${"devotee:" + f.sender} or t.sender_id = ${f.sender})`);
  if (f.receiver) c.push(sql`t.to_holder = ${"devotee:" + f.receiver}`);
  if (f.book) c.push(sql`l.book_id = ${Number(f.book)}`);
  if (f.status) c.push(f.status === "completed" ? sql`t.status in ('completed','received')` : sql`t.status = ${f.status}`);
  if (f.ref) {
    const n = Number(String(f.ref).replace(/\D/g, ""));
    if (n) c.push(sql`t.id = ${n}`);
  }
  if (f.from) c.push(sql`(t.requested_at at time zone 'Asia/Kolkata')::date >= ${f.from}`);
  if (f.to) c.push(sql`(t.requested_at at time zone 'Asia/Kolkata')::date <= ${f.to}`);
  return c.length ? sql.join(c, sql` and `) : sql`true`;
}

const HOLDER = (col: SQL) => sql`case when ${col} like 'devotee:%' then (select name from "user" where id = substring(${col} from 9))
  else (select name || ' (shelf)' from dham where id = substring(${col} from 6)::int) end`;

export async function transferLines(u: AppUser, f: TransferFilter) {
  const r = (await db.execute(sql`
    select t.id, t.status, to_char(t.requested_at at time zone 'Asia/Kolkata','YYYY-MM-DD') as date,
      sd.name as src_dham, dd.name as dst_dham,
      ${HOLDER(sql`coalesce(t.from_holder, 'dham:' || t.from_dham_id)`)} as source,
      ${HOLDER(sql`coalesce(t.to_holder, 'dham:' || t.to_dham_id)`)} as dest,
      b.title || ' (' || b.language || ')' as book,
      l.requested_qty as requested, coalesce(l.approved_qty, l.sent_qty, 0) as approved,
      ${DISPATCHED} as dispatched, ${RECEIVED} as received,
      greatest(${DISPATCHED} - ${RECEIVED} - l.returned_qty - l.lost_qty, 0) as remaining,
      l.returned_qty as returned, l.lost_qty as lost, coalesce(l.issue,'') as issue
    from dham_transfer t join dham_transfer_line l on l.transfer_id = t.id join book b on b.id = l.book_id
      join dham sd on sd.id = t.from_dham_id join dham dd on dd.id = t.to_dham_id
    where ${where(u, f)}
    order by t.id desc, b.title limit 2000`)) as unknown as Record<string, unknown>[];
  return r.map((x) => ({
    ...x,
    ref: ref(Number(x.id)),
    statusLabel: TRANSFER_STATUS[String(x.status)]?.label ?? String(x.status),
    requested: Number(x.requested), approved: Number(x.approved), dispatched: Number(x.dispatched),
    received: Number(x.received), remaining: Number(x.remaining), returned: Number(x.returned), lost: Number(x.lost),
  })) as ({ id: number; status: string; date: string; src_dham: string; dst_dham: string; source: string; dest: string; book: string; issue: string; ref: string; statusLabel: string } & Record<"requested" | "approved" | "dispatched" | "received" | "remaining" | "returned" | "lost", number>)[];
}

/** Totals per source → destination Dham, or per devotee (as sender and as receiver). */
export function groupBy(rows: Awaited<ReturnType<typeof transferLines>>, by: "dham" | "devotee") {
  const m = new Map<string, { key: string; transfers: Set<number>; requested: number; approved: number; dispatched: number; received: number; remaining: number }>();
  const add = (key: string, r: (typeof rows)[number]) => {
    const g = m.get(key) ?? { key, transfers: new Set<number>(), requested: 0, approved: 0, dispatched: 0, received: 0, remaining: 0 };
    g.transfers.add(r.id); g.requested += r.requested; g.approved += r.approved; g.dispatched += r.dispatched; g.received += r.received; g.remaining += r.remaining;
    m.set(key, g);
  };
  for (const r of rows) {
    if (by === "dham") add(`${r.src_dham} → ${r.dst_dham}`, r);
    else {
      if (!r.source.endsWith("(shelf)")) add(`${r.source} — sent`, r);
      if (!r.dest.endsWith("(shelf)")) add(`${r.dest} — received`, r);
    }
  }
  return [...m.values()].map((g) => ({ ...g, transfers: g.transfers.size })).sort((a, z) => z.dispatched - a.dispatched || a.key.localeCompare(z.key));
}

/** Ledger rows written by transfers (sent, received, returned, written off). */
export async function transferAudit(u: AppUser, f: TransferFilter) {
  const c: SQL[] = [sql`m.reference like 'transfer:%'`];
  if (u.role === "manager") c.push(sql`m.dham_id = ${u.dhamId ?? -1}`);
  if (f.ref) {
    const n = Number(String(f.ref).replace(/\D/g, ""));
    if (n) c.push(sql`m.reference = ${"transfer:" + n}`);
  }
  if (f.book) c.push(sql`m.book_id = ${Number(f.book)}`);
  if (f.from) c.push(sql`m.movement_date >= ${f.from}`);
  if (f.to) c.push(sql`m.movement_date <= ${f.to}`);
  const r = (await db.execute(sql`
    select m.id, to_char(m.movement_date,'YYYY-MM-DD') as date, m.kind, m.qty, m.from_holder, m.to_holder, m.reference,
      b.title || ' (' || b.language || ')' as book, coalesce(cu.name,'—') as by_name,
      ${HOLDER(sql`case when m.from_holder like 'transit:%' then null else m.from_holder end`)} as from_name,
      ${HOLDER(sql`case when m.to_holder like 'transit:%' or m.to_holder = 'damaged' then null else m.to_holder end`)} as to_name
    from stock_movement m join book b on b.id = m.book_id left join "user" cu on cu.id = m.created_by
    where ${sql.join(c, sql` and `)} order by m.id desc limit 1000`)) as unknown as Record<string, unknown>[];
  return r.map((x) => ({
    id: Number(x.id), date: String(x.date), kind: String(x.kind), qty: Number(x.qty), book: String(x.book), by: String(x.by_name),
    ref: ref(Number(String(x.reference).slice(9))),
    from: String(x.from_holder).startsWith("transit:") ? "On the way" : String(x.from_name ?? x.from_holder),
    to: String(x.to_holder).startsWith("transit:") ? "On the way" : x.to_holder === "damaged" ? "Written off" : String(x.to_name ?? x.to_holder),
  }));
}

export async function transfersExport(u: AppUser, p: Record<string, string | undefined>): Promise<ReportSpec> {
  const f = p as TransferFilter;
  const view = TRANSFER_VIEWS[f.view ?? "all"] ? f.view ?? "all" : "all";
  const meta: [string, string][] = [["View", TRANSFER_VIEWS[view].label], ["Scope", u.role === "manager" ? "Transfers to or from your Dham" : "All Dhams"]];
  if (f.from || f.to) meta.push(["Requested", `${f.from || "start"} – ${f.to || "today"}`]);
  const base = { title: `Books Transfer — ${TRANSFER_VIEWS[view].label}`, filename: `books-transfer-${view}-${todayIST()}`, meta };
  if (view === "audit") {
    const rows = await transferAudit(u, f);
    return {
      ...base,
      sections: [{
        name: "Stock movements",
        columns: [
          { header: "Date", key: "date", kind: "date" }, { header: "Reference", key: "ref" }, { header: "Book", key: "book", width: 28 },
          { header: "From", key: "from", width: 22 }, { header: "To", key: "to", width: 22 }, { header: "Copies", key: "qty", kind: "int" }, { header: "By", key: "by" },
        ],
        rows, totals: ["qty"],
      }],
    };
  }
  const rows = await transferLines(u, { ...f, view: view === "dham" || view === "devotee" ? "all" : view });
  const qtyCols = [
    { header: "Asked", key: "requested", kind: "int" as const }, { header: "Approved", key: "approved", kind: "int" as const },
    { header: "Sent", key: "dispatched", kind: "int" as const }, { header: "Received", key: "received", kind: "int" as const },
    { header: "On the way", key: "remaining", kind: "int" as const },
  ];
  if (view === "dham" || view === "devotee") {
    return {
      ...base,
      sections: [{ name: view === "dham" ? "Source → destination Dham" : "Devotee", columns: [{ header: view === "dham" ? "Dhams" : "Devotee", key: "key", width: 34 }, { header: "Transfers", key: "transfers", kind: "int" }, ...qtyCols], rows: groupBy(rows, view), totals: ["requested", "approved", "dispatched", "received", "remaining"] }],
    };
  }
  return {
    ...base,
    sections: [{
      name: "Transfers",
      note: "A transfer is not a sale: these copies are not counted as sold and no money moves.",
      columns: [
        { header: "Reference", key: "ref" }, { header: "Date", key: "date", kind: "date" }, { header: "From", key: "source", width: 22 }, { header: "To", key: "dest", width: 22 },
        { header: "Book", key: "book", width: 26 }, ...qtyCols, { header: "Status", key: "statusLabel", width: 16 },
      ],
      rows, totals: ["requested", "approved", "dispatched", "received", "remaining"],
    }],
  };
}
