import Link from "next/link";
import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { contactStats, DUP_LABEL, INTEREST_LABEL, type ContactFilter } from "@/lib/outreach";
import { fmtDate, num } from "@/lib/format";
import { BarChart, Card, HBar, PageHeader, StatCard } from "@/components/ui";
import { DownloadReport } from "@/components/download";

function Table({ rows, label, fmt = (k: string) => k }: { rows: { k: string; n: number }[]; label: string; fmt?: (k: string) => string }) {
  const max = Math.max(...rows.map((r) => r.n), 1);
  if (!rows.length) return <p className="text-sm text-ink-500">No contacts yet.</p>;
  return (
    <div className="space-y-2.5" aria-label={label}>
      {rows.map((r) => <HBar key={r.k} label={fmt(r.k)} value={r.n} max={max} format={num} />)}
    </div>
  );
}

/** Outreach Contact Reports — counts only, never mixed with book sales. */
export default async function OutreachReportsPage({ searchParams }: { searchParams: Promise<ContactFilter> }) {
  const u = await requireUser("manager", "admin");
  const sp = await searchParams;
  const f = { from: sp.from, to: sp.to, dham: sp.dham };
  const [s, dhams] = await Promise.all([contactStats(u, f), u.role === "admin" ? db.select({ id: schema.dham.id, name: schema.dham.name }).from(schema.dham).orderBy(asc(schema.dham.name)) : Promise.resolve([])]);
  return (
    <>
      <PageHeader
        title="Outreach Contact Reports"
        crumbs={[{ label: "Home", href: "/dashboard" }, { label: "Outreach Contacts", href: "/contacts" }, { label: "Reports" }]}
        doHere={u.role === "manager" ? `Contacts collected for ${u.dhamName}: by day, month, volunteer, event and interest.` : "Contacts collected in every Dham: by day, month, Dham, volunteer, event and interest."}
        next="These are people, not sales — they are never added to book or money totals."
      />
      <form action="/contacts/reports" className="mb-4 flex flex-wrap items-end gap-2">
        {u.role === "admin" && (
          <label className="text-xs font-semibold text-ink-600">Dham<select name="dham" defaultValue={sp.dham ?? ""} className="field-input mt-1"><option value="">All Dhams</option>{dhams.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
        )}
        <label className="text-xs font-semibold text-ink-600">From<input type="date" name="from" defaultValue={sp.from ?? ""} className="field-input mt-1" /></label>
        <label className="text-xs font-semibold text-ink-600">To<input type="date" name="to" defaultValue={sp.to ?? ""} className="field-input mt-1" /></label>
        <button className="btn-primary btn-sm">Show</button>
        {(sp.from || sp.to || sp.dham) && <Link href="/contacts/reports" className="btn-secondary btn-sm">Clear</Link>}
      </form>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon="📇" label="Total contacts" value={num(s.total)} href="/contacts" />
        <StatCard icon="👤" label="Unique contacts" value={num(s.unique)} tone="blue" hint="Different mobile numbers" />
        <StatCard icon="✅" label="Consent recorded" value={num(s.consent)} tone="green" href="/contacts?consent=yes" />
        <StatCard icon="⚠️" label="Duplicates to review" value={num(s.toReview)} tone={s.toReview ? "amber" : "gray"} href="/contacts?dup=possible" hint={`${num(s.dups)} confirmed duplicates`} />
      </div>
      <div className="mb-4"><DownloadReport kind="contacts" params={f} label="Download contacts" /></div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Daily collection" subtitle="Last 31 days with contacts">
          <BarChart data={[...s.daily].reverse().map((d) => ({ label: d.k.slice(8), value: d.n, sub: fmtDate(d.k) }))} format={num} emptyText="No contacts yet." />
        </Card>
        <Card title="Monthly collection">
          <Table rows={s.monthly} label="Monthly" fmt={(k) => new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(new Date(k + "-01T00:00:00+05:30"))} />
        </Card>
        <Card title="Interested in"><Table rows={[...s.interests].map(([k, n]) => ({ k, n })).sort((a, z) => z.n - a.n)} label="Interests" fmt={(k) => INTEREST_LABEL[k] ?? k} /></Card>
        {u.role === "admin" && <Card title="By Dham"><Table rows={s.byDham} label="Dhams" /></Card>}
        <Card title="By volunteer"><Table rows={s.byCollector} label="Volunteers" /></Card>
        <Card title="By event / place"><Table rows={s.byEvent} label="Events" /></Card>
        <Card title="Duplicate check"><Table rows={s.byDup} label="Duplicate status" fmt={(k) => DUP_LABEL[k]?.label ?? k} /></Card>
        <Card title="Consent">
          <Table rows={[{ k: "Given", n: s.consent }, { k: "Not given", n: s.total - s.consent }]} label="Consent" />
        </Card>
      </div>
    </>
  );
}
