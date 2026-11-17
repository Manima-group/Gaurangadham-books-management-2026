import Link from "next/link";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { groupBy, transferAudit, transferLines, TRANSFER_VIEWS, type TransferFilter } from "@/lib/transfer-report";
import { MOVEMENT_LABEL, TRANSFER_STATUS } from "@/lib/terms";
import { fmtDate, num } from "@/lib/format";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { ChipLinks } from "@/components/chips";
import { withQuery } from "@/components/tabs";
import { DownloadReport } from "@/components/download";

/** Transfer reports: every view the Chakra Sevak / Sector Sevak needs, with filters and downloads. */
export default async function TransferReportPage({ searchParams }: { searchParams: Promise<TransferFilter> }) {
  const u = await requireUser("admin", "manager");
  const sp = await searchParams;
  const view = TRANSFER_VIEWS[sp.view ?? ""] ? sp.view! : "all";
  const f: TransferFilter = { ...sp, view };
  const [dhams, books, devotees] = await Promise.all([
    db.select({ id: schema.dham.id, name: schema.dham.name }).from(schema.dham).orderBy(asc(schema.dham.name)),
    db.select({ id: schema.book.id, title: schema.book.title, language: schema.book.language }).from(schema.book).orderBy(asc(schema.book.title)),
    db.select({ id: schema.user.id, name: schema.user.name }).from(schema.user)
      .where(and(inArray(schema.user.role, ["devotee", "manager"]), u.role === "manager" ? eq(schema.user.dhamId, u.dhamId ?? -1) : undefined)).orderBy(asc(schema.user.name)),
  ]);
  const audit = view === "audit" ? await transferAudit(u, f) : [];
  const rows = view === "audit" ? [] : await transferLines(u, { ...f, view: view === "dham" || view === "devotee" ? "all" : view });
  const groups = view === "dham" || view === "devotee" ? groupBy(rows, view) : [];
  const keep = { srcDham: sp.srcDham, dstDham: sp.dstDham, sender: sp.sender, receiver: sp.receiver, book: sp.book, status: sp.status, ref: sp.ref, from: sp.from, to: sp.to };
  const base = "/transfers/report";
  const tot = rows.reduce((a, r) => ({ requested: a.requested + r.requested, approved: a.approved + r.approved, dispatched: a.dispatched + r.dispatched, received: a.received + r.received, remaining: a.remaining + r.remaining }), { requested: 0, approved: 0, dispatched: 0, received: 0, remaining: 0 });

  return (
    <>
      <PageHeader
        title="Transfer Reports"
        crumbs={[{ label: "Home", href: "/dashboard" }, { label: "Books Transfer", href: "/transfers" }, { label: "Reports" }]}
        doHere={u.role === "manager" ? "Every transfer to or from your Dham, book by book: asked, approved, sent, received and still on the way." : "Every transfer, book by book: asked, approved, sent, received and still on the way."}
        next="Transfers are not sales. They never change books-sold, sales value or money collected."
      />
      <div className="mb-3">
        <ChipLinks label="Report view" items={Object.entries(TRANSFER_VIEWS).map(([k, v]) => ({ label: v.label, href: withQuery(base, { ...keep, view: k === "all" ? undefined : k }), active: view === k }))} />
      </div>

      <form action={base} className="mb-4 grid grid-cols-2 gap-2 rounded-2xl border border-stone-200/80 bg-white p-3 shadow-card sm:grid-cols-3 lg:grid-cols-5">
        {view !== "all" && <input type="hidden" name="view" value={view} />}
        <label className="text-xs font-semibold text-ink-600">Reference<input name="ref" defaultValue={sp.ref ?? ""} placeholder="BT-00012" className="field-input mt-1" /></label>
        <label className="text-xs font-semibold text-ink-600">From Dham
          <select name="srcDham" defaultValue={sp.srcDham ?? ""} className="field-input mt-1"><option value="">Any</option>{dhams.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        </label>
        <label className="text-xs font-semibold text-ink-600">To Dham
          <select name="dstDham" defaultValue={sp.dstDham ?? ""} className="field-input mt-1"><option value="">Any</option>{dhams.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        </label>
        <label className="text-xs font-semibold text-ink-600">Sending devotee
          <select name="sender" defaultValue={sp.sender ?? ""} className="field-input mt-1"><option value="">Any</option>{devotees.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        </label>
        <label className="text-xs font-semibold text-ink-600">Receiving devotee
          <select name="receiver" defaultValue={sp.receiver ?? ""} className="field-input mt-1"><option value="">Any</option>{devotees.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        </label>
        <label className="text-xs font-semibold text-ink-600">Book
          <select name="book" defaultValue={sp.book ?? ""} className="field-input mt-1"><option value="">Any</option>{books.map((b) => <option key={b.id} value={b.id}>{b.title} ({b.language})</option>)}</select>
        </label>
        <label className="text-xs font-semibold text-ink-600">Status
          <select name="status" defaultValue={sp.status ?? ""} className="field-input mt-1"><option value="">Any</option>{Object.entries(TRANSFER_STATUS).filter(([k]) => k !== "received").map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        </label>
        <label className="text-xs font-semibold text-ink-600">Requested from<input type="date" name="from" defaultValue={sp.from ?? ""} className="field-input mt-1" /></label>
        <label className="text-xs font-semibold text-ink-600">Requested to<input type="date" name="to" defaultValue={sp.to ?? ""} className="field-input mt-1" /></label>
        <div className="col-span-2 flex items-end gap-2 sm:col-span-1">
          <button className="btn-primary btn-sm">Show</button>
          <Link href={withQuery(base, { view: view === "all" ? undefined : view })} className="btn-secondary btn-sm">Clear</Link>
        </div>
      </form>

      <div className="mb-4"><DownloadReport kind="transfers" params={{ ...keep, view }} /></div>

      {view === "audit" ? (
        <Card title="Stock movement audit" subtitle="Every stock movement written by Books Transfer. Movements are never edited.">
          {audit.length === 0 ? <EmptyState icon="🧾" title="No transfer movements match." /> : (
            <div className="overflow-x-auto">
              <table className="data-table min-w-[720px]">
                <thead><tr><th>Date</th><th>Reference</th><th>What</th><th>Book</th><th>From</th><th>To</th><th className="text-right">Copies</th><th>By</th></tr></thead>
                <tbody>{audit.map((a) => (
                  <tr key={a.id}><td>{fmtDate(a.date)}</td><td><Link className="font-semibold text-brand-700 hover:underline" href={`/transfers/${Number(a.ref.slice(3))}`}>{a.ref}</Link></td><td>{MOVEMENT_LABEL[a.kind] ?? a.kind}</td><td>{a.book}</td><td>{a.from}</td><td>{a.to}</td><td className="text-right tabular-nums">{num(a.qty)}</td><td>{a.by}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </Card>
      ) : groups.length || view === "dham" || view === "devotee" ? (
        <Card title={TRANSFER_VIEWS[view].label}>
          {groups.length === 0 ? <EmptyState icon="🚚" title="No transfers match." /> : (
            <div className="overflow-x-auto">
              <table className="data-table min-w-[620px]" data-testid="transfer-groups">
                <thead><tr><th>{view === "dham" ? "From → To" : "Devotee"}</th><th className="text-right">Transfers</th><th className="text-right">Asked</th><th className="text-right">Approved</th><th className="text-right">Sent</th><th className="text-right">Received</th><th className="text-right">On the way</th></tr></thead>
                <tbody>{groups.map((g) => (
                  <tr key={g.key}><td className="font-semibold">{g.key}</td><td className="text-right tabular-nums">{g.transfers}</td><td className="text-right tabular-nums">{num(g.requested)}</td><td className="text-right tabular-nums">{num(g.approved)}</td><td className="text-right tabular-nums">{num(g.dispatched)}</td><td className="text-right tabular-nums">{num(g.received)}</td><td className="text-right tabular-nums">{num(g.remaining)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        <Card title={TRANSFER_VIEWS[view].label} subtitle="A transfer is not a sale: these copies are not counted as sold and no money moves.">
          {rows.length === 0 ? <EmptyState icon="🚚" title="No transfers match." /> : (
            <div className="overflow-x-auto">
              <table className="data-table min-w-[900px]" data-testid="transfer-lines">
                <thead><tr><th>Reference</th><th>Date</th><th>From</th><th>To</th><th>Book</th><th className="text-right">Asked</th><th className="text-right">Approved</th><th className="text-right">Sent</th><th className="text-right">Received</th><th className="text-right">On the way</th><th>Status</th></tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td><Link className="font-semibold text-brand-700 hover:underline" href={`/transfers/${r.id}`}>{r.ref}</Link></td>
                      <td>{fmtDate(r.date)}</td><td>{r.source}</td><td>{r.dest}</td>
                      <td>{r.book}{r.issue && <span className="block text-xs text-red-700">⚠ {r.issue}</span>}</td>
                      <td className="text-right tabular-nums">{num(r.requested)}</td><td className="text-right tabular-nums">{num(r.approved)}</td>
                      <td className="text-right tabular-nums">{num(r.dispatched)}</td><td className="text-right tabular-nums">{num(r.received)}</td>
                      <td className="text-right font-semibold tabular-nums">{num(r.remaining)}</td>
                      <td><Badge tone={TRANSFER_STATUS[r.status]?.tone ?? "gray"}>{r.statusLabel}</Badge></td>
                    </tr>
                  ))}
                  <tr className="font-bold"><td colSpan={5}>Total</td><td className="text-right tabular-nums">{num(tot.requested)}</td><td className="text-right tabular-nums">{num(tot.approved)}</td><td className="text-right tabular-nums">{num(tot.dispatched)}</td><td className="text-right tabular-nums">{num(tot.received)}</td><td className="text-right tabular-nums">{num(tot.remaining)}</td><td /></tr>
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </>
  );
}
