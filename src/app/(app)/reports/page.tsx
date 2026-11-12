import Link from "next/link";
import { and, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { allCampaigns, allDevotees, allDhams, devoteesOf } from "@/lib/lookups";
import { fmtDate, inr, num } from "@/lib/format";
import { Card, EmptyState, PageHeader, ReportStatus, Badge } from "@/components/ui";
import { DownloadReport } from "@/components/download";
import { FilterBar } from "@/components/filters";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await requireUser("admin", "manager");
  const sp = await searchParams;
  const r = schema.dailyReport;
  const c: SQL[] = [];
  if (u.role === "manager") c.push(eq(r.dhamId, u.dhamId!));
  else if (sp.dham) c.push(eq(r.dhamId, Number(sp.dham)));
  if (sp.drive) c.push(eq(r.campaignId, Number(sp.drive)));
  if (sp.devotee) c.push(eq(r.devoteeId, sp.devotee));
  if (sp.status) c.push(eq(r.status, sp.status as "submitted"));
  else c.push(eq(r.status, r.status)); // all, but drafts are hidden below
  if (sp.from) c.push(gte(r.reportDate, sp.from));
  if (sp.to) c.push(lte(r.reportDate, sp.to));

  const [rows, dhams, drives, devotees] = await Promise.all([
    db
      .select({ r, name: schema.user.name, dham: schema.dham.name })
      .from(r)
      .innerJoin(schema.user, eq(schema.user.id, r.devoteeId))
      .innerJoin(schema.dham, eq(schema.dham.id, r.dhamId))
      .where(and(...c))
      .orderBy(desc(r.reportDate), desc(r.submittedAt))
      .limit(200),
    u.role === "admin" ? allDhams() : Promise.resolve([]),
    allCampaigns(),
    u.role === "admin" ? allDevotees() : devoteesOf(u.dhamId!),
  ]);
  const list = rows.filter((x) => x.r.status !== "draft");
  const waiting = await db.$count(
    r,
    and(eq(r.status, "submitted"), ...(u.role === "manager" ? [eq(r.dhamId, u.dhamId!)] : sp.dham ? [eq(r.dhamId, Number(sp.dham))] : [])),
  );
  const totals = list.reduce((a, x) => ({ qty: a.qty + x.r.totalSold, sales: a.sales + x.r.salesPaise, coll: a.coll + x.r.collectedPaise }), { qty: 0, sales: 0, coll: 0 });

  return (
    <>
      <PageHeader
        title="Daily Reports"
        crumbs={[{ label: "Home", href: "/dashboard" }, { label: "Daily Reports" }]}
        doHere={`Review the sales reports sent by devotees${u.role === "manager" ? ` of ${u.dhamName}` : ""}. Reports marked “Being Reviewed” are waiting for you.`}
        next="Open a report and choose Approve Report, Request Correction or Reject Report. The devotee is told immediately."
      />
      <Card className="mb-4">
        <FilterBar
          action="/reports"
          values={sp}
          dhams={u.role === "admin" ? dhams.map((d) => ({ value: d.id, label: d.name })) : undefined}
          drives={drives.map((d) => ({ value: d.id, label: d.name }))}
          devotees={devotees.map((d) => ({ value: d.id, label: d.name }))}
          statuses={[
            { value: "submitted", label: `Waiting for review${waiting ? ` (${waiting})` : ""}` },
            { value: "approved", label: "Approved" },
            { value: "changes_required", label: "Changes Required" },
            { value: "rejected", label: "Rejected" },
          ]}
        />
      </Card>
      <div className="mb-4"><DownloadReport kind="reports" params={sp} /></div>
      {list.length === 0 ? (
        <EmptyState icon="📝" title={sp.status === "submitted" ? "No reports are waiting for review. 🙏" : "No reports found."}>
          {sp.status === "submitted" ? "When devotees submit their daily sales, they will appear here and you'll get a notification." : "Try changing the filters."}
        </EmptyState>
      ) : (
        <Card subtitle={`${list.length} reports · ${num(totals.qty)} books · sales ${inr(totals.sales)} · collected ${inr(totals.coll)}`}>
          <ul className="divide-y divide-stone-100 md:hidden">
            {list.map(({ r, name, dham }) => (
              <li key={r.id}>
                <Link href={`/reports/${r.id}`} className="block py-3">
                  <div className="flex items-center justify-between gap-2"><span className="font-semibold">{name}</span><ReportStatus status={r.status} /></div>
                  <p className="text-sm text-ink-500">{fmtDate(r.reportDate)}{u.role === "admin" ? ` · ${dham}` : ""} · {num(r.totalSold)} books · {inr(r.salesPaise)}</p>
                  {r.collectedPaise !== r.salesPaise && <p className="text-xs font-semibold text-amber-700">⚠ Collected {inr(r.collectedPaise)}</p>}
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="data-table">
              <thead><tr><th>Date</th><th>Devotee</th>{u.role === "admin" && <th>Dham</th>}<th className="text-right">Books sold</th><th className="text-right">Sales amount</th><th className="text-right">Money collected</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {list.map(({ r, name, dham }) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">{fmtDate(r.reportDate)}</td>
                    <td className="font-medium">{name}</td>
                    {u.role === "admin" && <td>{dham}</td>}
                    <td className="text-right tabular-nums">{num(r.totalSold)}</td>
                    <td className="text-right tabular-nums">{inr(r.salesPaise)}</td>
                    <td className="text-right tabular-nums">
                      {inr(r.collectedPaise)} {r.collectedPaise !== r.salesPaise && <Badge tone="amber" title="Money collected differs from the sales amount">Differs</Badge>}
                    </td>
                    <td><ReportStatus status={r.status} /></td>
                    <td className="text-right">
                      <Link href={`/reports/${r.id}`} className={r.status === "submitted" ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>
                        {r.status === "submitted" ? "Review Report" : "View Details"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
