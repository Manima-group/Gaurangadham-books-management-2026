import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { requireUser } from "@/lib/session";
import { activeDhams } from "@/lib/lookups";
import { SOURCE_LABEL, type Source } from "@/lib/lots";
import { num } from "@/lib/format";
import { Badge, Card, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { FilterBar } from "@/components/filters";

type R = Record<string, unknown>;
const rows = async <T = R>(q: SQL) => (await db.execute(q)) as unknown as T[];
const TONE: Record<Source, "blue" | "purple" | "gray"> = { external_central: "blue", temple_store: "purple", unknown: "gray" };
const SRC = sql`coalesce(l.source, 'unknown')`;

/**
 * Stock by source (External Central / Temple Store / Unknown legacy). Sector Sevak: own Dham and its devotees.
 * Chakra Sevak: everything, or one Dham. Never shown to devotees.
 */
export default async function SourcesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await requireUser("manager", "admin");
  const sp = await searchParams;
  const dhamId = u.role === "admin" ? (sp.dham ? Number(sp.dham) : null) : u.dhamId!;
  const source = ["external_central", "temple_store", "unknown"].includes(sp.source ?? "") ? (sp.source as Source) : null;
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from : undefined;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? sp.to : undefined;

  // Holders in scope: all, or a Dham's store + its devotees (+ copies in transit sent from it).
  const inScope = (col: SQL) =>
    dhamId == null
      ? sql`true`
      : sql`(${col} = ${"dham:" + dhamId} or ${col} in (select 'devotee:' || id from "user" where dham_id = ${dhamId}))`;
  const srcF = source ? sql`and ${SRC} = ${source}` : sql``;
  const dateF = sql`${from ? sql`and m.movement_date >= ${from}` : sql``} ${to ? sql`and m.movement_date <= ${to}` : sql``}`;

  const [balance, flows, dhams] = await Promise.all([
    rows<{ source: Source; place: string; qty: number }>(sql`
      select ${SRC} source,
        case when h.holder = 'central' then 'Central store' when h.holder like 'dham:%' then 'Dham store' when h.holder like 'devotee:%' then 'With devotees' else 'In transit' end place,
        sum(h.qty)::int qty
      from (
        select m.to_holder holder, m.lot_id, m.qty from stock_movement m
        union all select m.from_holder, m.lot_id, -m.qty from stock_movement m
      ) h left join stock_lot l on l.id = h.lot_id
      where h.holder ~ '^(central|dham:|devotee:|transit:)' and ${inScope(sql`h.holder`)} ${srcF}
      group by 1, 2 having sum(h.qty) <> 0 order by 1, 2`),
    rows<{ source: Source; title: string; received: number; sold: number; damaged: number; moved: number }>(sql`
      select ${SRC} source, b.title,
        sum(case when m.kind = 'received' and ${inScope(sql`m.to_holder`)} then m.qty else 0 end)::int received,
        sum(case when m.to_holder = 'sold' and ${inScope(sql`m.from_holder`)} then m.qty else 0 end)::int sold,
        sum(case when m.to_holder = 'damaged' and ${inScope(sql`m.from_holder`)} then m.qty else 0 end)::int damaged,
        sum(case when m.kind in ('transfer_out','transfer_in','stall_transfer') and ${inScope(sql`m.from_holder`)} then m.qty else 0 end)::int moved
      from stock_movement m join book b on b.id = m.book_id left join stock_lot l on l.id = m.lot_id
      where m.kind <> 'correction' and m.reversed_by is null ${srcF} ${dateF}
      group by 1, 2 having sum(m.qty) > 0 order by 2, 1 limit 500`),
    u.role === "admin" ? activeDhams() : Promise.resolve([]),
  ]);
  const totals = (["external_central", "temple_store", "unknown"] as Source[]).map((s) => ({ s, qty: balance.filter((b) => b.source === s).reduce((a, b) => a + Number(b.qty), 0) }));

  return (
    <>
      <PageHeader title="Stock Sources" crumbs={[{ label: "Home", href: "/dashboard" }, { label: "Stock", href: "/stock" }, { label: "Stock Sources" }]}
        doHere={`Where the books ${dhamId == null ? "in all Dhams" : "of this Dham"} came from: External Central, Temple Store, or Unknown (stock from before sources were recorded).`}
        next="Every movement keeps its source, oldest stock first. Devotees never see sources." />
      <div className="mb-4">
        <FilterBar action="/stock/sources" values={sp} dhams={u.role === "admin" ? dhams.map((d) => ({ value: d.id, label: d.name })) : undefined}
          extra={<label className="flex flex-col gap-1 text-xs font-semibold text-ink-500">Source
            <select name="source" defaultValue={sp.source ?? ""} className="field-input py-2.5 text-sm font-normal">
              <option value="">All sources</option>{Object.entries(SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></label>} />
      </div>
      <div className="mb-4 grid grid-cols-3 gap-3" data-testid="source-totals">
        {totals.map((t) => <StatCard key={t.s} label={`In hand · ${SOURCE_LABEL[t.s]}`} value={num(t.qty)} />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <Card title="Copies in hand now" className="lg:col-span-2 lg:self-start">
          {balance.length === 0 ? <EmptyState icon="📦" title="No stock." /> : (
            <table className="data-table"><thead><tr><th>Source</th><th>Where</th><th className="text-right">Copies</th></tr></thead>
              <tbody>{balance.map((b, i) => <tr key={i}><td><Badge tone={TONE[b.source]}>{SOURCE_LABEL[b.source]}</Badge></td><td>{b.place}</td><td className="text-right">{num(b.qty)}</td></tr>)}</tbody></table>
          )}
        </Card>
        <Card title="By book" subtitle={from || to ? "In the chosen dates" : "All time"} className="lg:col-span-3">
          {flows.length === 0 ? <EmptyState icon="📚" title="Nothing in this period." /> : (
            <div className="overflow-x-auto"><table className="data-table" data-testid="source-books"><thead><tr><th>Book</th><th>Source</th><th className="text-right">Received</th><th className="text-right">Sold</th><th className="text-right">Damaged</th><th className="text-right">Moved</th></tr></thead>
              <tbody>{flows.map((f, i) => <tr key={i}><td>{f.title}</td><td><Badge tone={TONE[f.source]}>{SOURCE_LABEL[f.source]}</Badge></td><td className="text-right">{num(f.received)}</td><td className="text-right">{num(f.sold)}</td><td className="text-right">{num(f.damaged)}</td><td className="text-right">{num(f.moved)}</td></tr>)}</tbody></table></div>
          )}
        </Card>
      </div>
    </>
  );
}
