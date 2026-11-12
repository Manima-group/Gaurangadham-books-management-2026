import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { fmtDate, inr, num } from "@/lib/format";
import { EmptyState, PageHeader, ReportStatus } from "@/components/ui";
import { DeleteButton } from "@/components/delete";
import { deleteReport } from "@/app/actions/reports";

export default async function MyReports() {
  const u = await requireUser("devotee", "manager");
  const rows = await db.select().from(schema.dailyReport).where(eq(schema.dailyReport.devoteeId, u.id)).orderBy(desc(schema.dailyReport.reportDate)).limit(60);
  return (
    <>
      <PageHeader
        title="My Reports"
        crumbs={[{ label: "Home", href: "/dashboard" }, { label: "My Reports" }]}
        doHere="See every daily report you have sent and whether your Manager approved it."
        next="If a report shows “Changes Required”, tap it to correct and send it again."
      />
      {rows.length === 0 ? (
        <EmptyState icon="🗂️" title="You haven't sent any reports yet." action={<Link href="/my/sales" className="btn-primary">Submit Today's Sales</Link>}>
          Your daily sales reports will be listed here.
        </EmptyState>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="space-y-1">
              <Link href={`/my/sales?date=${r.reportDate}`} className="block rounded-2xl border border-stone-200 bg-white p-4 shadow-sm hover:border-brand-300">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{fmtDate(r.reportDate)}</span>
                  <ReportStatus status={r.status} />
                </div>
                <p className="mt-1 text-sm text-ink-500">{num(r.totalSold)} books sold · {inr(r.salesPaise)} · collected {inr(r.collectedPaise)}</p>
                {r.reviewNote && <p className="mt-1 text-sm text-amber-800">Manager's note: “{r.reviewNote}”</p>}
              </Link>
              {(r.status !== "approved" || u.role === "manager") && (
                <div className="flex justify-end">
                  <DeleteButton action={deleteReport} id={r.id} label="Delete" confirm={r.status === "approved" ? "Delete? Stock goes back to you." : "Delete this report?"} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
