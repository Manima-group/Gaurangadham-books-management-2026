import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireApproved } from "@/lib/session";
import { redirect } from "next/navigation";
import { PERIOD_LABEL, periodRange, type Period } from "@/lib/distribution";
import { fmtDate, inr, num } from "@/lib/format";
import { Card, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { ChipLinks } from "@/components/chips";

type R = Record<string, unknown>;
const rows = async <T = R>(q: ReturnType<typeof sql>) => (await db.execute(q)) as unknown as T[];

/** Read-only totals of the viewer's own Dham. No devotee names, no stock sources, no money custody. */
export default async function DhamSalesPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const u = await requireApproved("devotee", "manager", "admin");
  if (!u.canViewDhamSales || u.dhamId == null) redirect("/dashboard?denied=1");
  const p = (["today", "week", "month", "all"].includes((await searchParams).p ?? "") ? (await searchParams).p : "month") as Period;
  const { from, to } = periodRange(p);
  const f = sql`r.dham_id = ${u.dhamId} and r.status = 'approved' and r.report_date <= ${to} ${from ? sql`and r.report_date >= ${from}` : sql``}`;
  const [byTitle, byDay] = await Promise.all([
    rows<{ title: string; qty: number; amount: number }>(sql`
      select b.title, sum(l.sold_qty)::int qty, sum(l.amount_paise)::int amount
      from daily_report r join daily_report_line l on l.report_id = r.id join book b on b.id = l.book_id
      where ${f} and l.sold_qty > 0 group by b.title order by qty desc, b.title limit 200`),
    rows<{ d: string; qty: number; amount: number }>(sql`
      select r.report_date::text d, sum(r.total_sold)::int qty, sum(r.sales_paise)::int amount
      from daily_report r where ${f} group by r.report_date order by r.report_date desc limit 90`),
  ]);
  const totQty = byTitle.reduce((a, r) => a + Number(r.qty), 0);
  const totAmt = byTitle.reduce((a, r) => a + Number(r.amount), 0);
  return (
    <>
      <PageHeader title="Dham Sales" crumbs={[{ label: "Home", href: "/dashboard" }, { label: "Dham Sales" }]}
        doHere={`Read-only totals of approved book distribution in ${u.dhamName}.`} next="Only totals are shown — no names of devotees." />
      <div className="mb-4"><ChipLinks label="Period" items={(Object.keys(PERIOD_LABEL) as Period[]).map((k) => ({ href: `/dham-sales?p=${k}`, label: PERIOD_LABEL[k], active: k === p }))} /></div>
      <div className="mb-4 grid grid-cols-2 gap-3">
        <StatCard label="Books distributed" value={num(totQty)} />
        <StatCard label="Book value" value={inr(totAmt)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="By book">
          {byTitle.length === 0 ? <EmptyState icon="📚" title="No approved sales in this period." /> : (
            <table className="data-table" data-testid="dhamsales-title"><thead><tr><th>Book</th><th className="text-right">Copies</th><th className="text-right">Value</th></tr></thead>
              <tbody>{byTitle.map((r) => <tr key={r.title}><td>{r.title}</td><td className="text-right">{num(r.qty)}</td><td className="text-right">{inr(r.amount)}</td></tr>)}</tbody></table>
          )}
        </Card>
        <Card title="By day">
          {byDay.length === 0 ? <EmptyState icon="📅" title="No approved sales in this period." /> : (
            <table className="data-table"><thead><tr><th>Day</th><th className="text-right">Copies</th><th className="text-right">Value</th></tr></thead>
              <tbody>{byDay.map((r) => <tr key={r.d}><td>{fmtDate(r.d)}</td><td className="text-right">{num(r.qty)}</td><td className="text-right">{inr(r.amount)}</td></tr>)}</tbody></table>
          )}
        </Card>
      </div>
    </>
  );
}
