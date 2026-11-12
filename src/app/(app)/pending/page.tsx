import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { onlyDevoteesOf, allDevotees, allDhams } from "@/lib/lookups";
import { devoteeBalances } from "@/lib/balances";
import { addDays, fmtDate, inr, todayIST } from "@/lib/format";
import { Card, EmptyState, PageHeader, ReportStatus } from "@/components/ui";
import { DayPicker } from "@/components/daypicker";

export default async function PendingPage({ searchParams }: { searchParams: Promise<{ date?: string; dham?: string }> }) {
  const u = await requireUser("admin", "manager");
  const sp = await searchParams;
  const today = todayIST();
  const date = sp.date && sp.date <= today ? sp.date : today;
  const dhamId = u.role === "manager" ? u.dhamId! : sp.dham ? Number(sp.dham) : null;
  const [devotees, reports, balances, dhams] = await Promise.all([
    dhamId ? onlyDevoteesOf(dhamId) : allDevotees(),
    db.select().from(schema.dailyReport).where(and(eq(schema.dailyReport.reportDate, date), ...(dhamId ? [eq(schema.dailyReport.dhamId, dhamId)] : []))),
    devoteeBalances(dhamId),
    u.role === "admin" ? allDhams() : Promise.resolve([]),
  ]);
  const rep = new Map(reports.map((r) => [r.devoteeId, r]));
  const notSent = devotees.filter((d) => !rep.get(d.id) || rep.get(d.id)!.status === "draft");
  const needFix = reports.filter((r) => r.status === "changes_required" || r.status === "rejected");
  const owing = balances.filter((b) => b.pending > 0).sort((a, b) => b.pending - a.pending);
  const nameOf = new Map(devotees.map((d) => [d.id, d]));

  return (
    <>
      <PageHeader
        title="Pending Submissions"
        crumbs={[{ label: "Home", href: "/dashboard" }, { label: "Pending Submissions" }]}
        doHere="See who has not sent today's report and who still has money to submit. Tap 📞 to call them."
        next="Once they submit, they disappear from this list automatically."
      />
      <DayPicker
        action="/pending"
        date={date}
        today={today}
        prev={addDays(date, -1)}
        next={addDays(date, 1)}
        dhams={u.role === "admin" ? dhams.map((d) => ({ id: d.id, name: d.name })) : undefined}
        dham={sp.dham}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`Report not submitted — ${fmtDate(date)}`} subtitle={`${notSent.length} of ${devotees.length} devotees`}>
          {devotees.length === 0 ? (
            <EmptyState icon="🙋" title="No devotees yet." />
          ) : notSent.length === 0 ? (
            <p className="py-3 text-sm text-ink-500">✅ Everyone has submitted their report for this day.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {notSent.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 py-2.5">
                  <div>
                    <p className="font-medium">{d.name}</p>
                    {rep.get(d.id)?.status === "draft" && <p className="text-xs text-ink-500">Saved a report but has not sent it</p>}
                  </div>
                  {d.phone && <a href={`tel:${d.phone}`} className="btn-secondary btn-sm">📞 Call</a>}
                </li>
              ))}
            </ul>
          )}
          {needFix.length > 0 && (
            <div className="mt-4 border-t border-stone-100 pt-3">
              <p className="mb-2 text-sm font-semibold">Sent back, waiting for the devotee to correct:</p>
              <ul className="space-y-1 text-sm">
                {needFix.map((r) => <li key={r.id} className="flex items-center justify-between"><span>{nameOf.get(r.devoteeId)?.name ?? "Devotee"}</span><ReportStatus status={r.status} /></li>)}
              </ul>
            </div>
          )}
        </Card>
        <Card title="Money yet to submit" subtitle="Devotees who have collected money but not handed all of it over">
          {owing.length === 0 ? (
            <p className="py-3 text-sm text-ink-500">✅ No money is pending.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {owing.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-2 py-2.5">
                  <div>
                    <p className="font-medium">{b.name}</p>
                    <p className="text-xs text-ink-500">Collected {inr(b.collected)} · Submitted {inr(b.submitted)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold tabular-nums text-amber-700">{inr(b.pending)}</span>
                    {b.phone && <a href={`tel:${b.phone}`} className="btn-secondary btn-sm" aria-label={`Call ${b.name}`}>📞</a>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
