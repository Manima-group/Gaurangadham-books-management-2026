import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { AppUser } from "@/lib/session";
import { overview, salesByDay } from "@/lib/stats";
import { H, holderStock, total } from "@/lib/stock";
import { fmtDate, inr, num, todayIST } from "@/lib/format";
import { BarChart, Card, EmptyState, PageHeader, StatCard, Alert } from "@/components/ui";
import { QuickActions } from "./quick";
import { DhamWidgets } from "@/components/dhamwidgets";
import { dhamWise } from "@/lib/distribution";

export async function ManagerDashboard({ user }: { user: AppUser }) {
  if (!user.dhamId)
    return <Alert tone="amber" title="You are not linked to a Dham yet.">Please ask the Admin to assign you to a Dham.</Alert>;
  const dhamId = user.dhamId;
  const today = todayIST();
  const [dw, o, store, chart, devotees, todays, waiting, [unconfirmed]] = await Promise.all([
    dhamWise("today"),
    overview({ dhamId }),
    holderStock(H.dham(dhamId)),
    salesByDay({ dhamId }, 14, today),
    db
      .select({ id: schema.user.id, name: schema.user.name, phone: schema.user.phone })
      .from(schema.user)
      .where(and(eq(schema.user.dhamId, dhamId), eq(schema.user.role, "devotee"), eq(schema.user.isActive, true))),
    db
      .select({ devoteeId: schema.dailyReport.devoteeId, status: schema.dailyReport.status })
      .from(schema.dailyReport)
      .where(and(eq(schema.dailyReport.dhamId, dhamId), eq(schema.dailyReport.reportDate, today))),
    db
      .select({
        id: schema.dailyReport.id,
        name: schema.user.name,
        reportDate: schema.dailyReport.reportDate,
        totalSold: schema.dailyReport.totalSold,
        salesPaise: schema.dailyReport.salesPaise,
        collectedPaise: schema.dailyReport.collectedPaise,
        status: schema.dailyReport.status,
      })
      .from(schema.dailyReport)
      .innerJoin(schema.user, eq(schema.user.id, schema.dailyReport.devoteeId))
      .where(and(eq(schema.dailyReport.dhamId, dhamId), eq(schema.dailyReport.status, "submitted")))
      .orderBy(desc(schema.dailyReport.reportDate))
      .limit(8),
    db.$count(schema.moneySubmission, and(eq(schema.moneySubmission.dhamId, dhamId), eq(schema.moneySubmission.status, "submitted"))).then((n) => [n]),
  ]);
  const submitted = new Map(todays.filter((t) => t.status !== "draft").map((t) => [t.devoteeId, t.status]));
  const missing = devotees.filter((d) => !submitted.has(d.id));
  const inStore = total(store);
  const withDevotees = o.available - inStore;

  return (
    <>
      <PageHeader
        title={`${user.dhamName} — Today`}
        crumbs={[{ label: "Home" }]}
        doHere="Check today's work at your Dham: books, sales, money and reports waiting for you."
        next="Review reports as they come in. When all devotees have reported and money is received, do the Daily Closing."
      />
      <DhamWidgets rows={dw.filter((d) => d.id === dhamId)} title="Today's distribution" showAllCard={false} />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon="📦" label="Books available in my Dham" value={num(o.available)} tone="blue" href="/stock" hint={`${num(inStore)} in store · ${num(withDevotees)} with devotees`} />
        <StatCard icon="🤲" label="Books assigned to devotees" value={num(o.distributed)} tone="purple" href="/stock#devotees" hint="Given out so far (less returns)" />
        <StatCard icon="📖" label="Books sold" value={num(o.soldApproved)} tone="green" href="/reports?status=approved" hint={o.soldPending ? `+ ${num(o.soldPending)} waiting for your review` : "From approved reports"} />
        <StatCard icon="📝" label="Reports waiting for my review" value={num(o.reportsAwaiting)} tone={o.reportsAwaiting ? "red" : "gray"} href="/reports?status=submitted" hint={o.reportsAwaiting ? "Tap to review" : "All caught up 🙏"} />
        <StatCard icon="🪙" label="Money collected" value={inr(o.collected)} tone="green" href="/money" />
        <StatCard icon="🏦" label="Money submitted by devotees" value={inr(o.submitted)} tone="blue" href="/money" hint={unconfirmed ? `${unconfirmed} to confirm as received` : "All confirmed"} />
        <StatCard icon="⏳" label="Money yet to submit" value={inr(o.pendingMoney)} tone={o.pendingMoney ? "amber" : "green"} href="/pending" />
        <StatCard icon="🙋" label="Not reported today" value={`${missing.length} of ${devotees.length}`} tone={missing.length ? "amber" : "green"} href="/pending" />
      </div>

      <QuickActions
        items={[
          { href: "/stock/receive", label: "Receive Books", icon: "📥" },
          { href: "/stock/assign-devotees", label: "Assign Books to Devotees", icon: "🤲" },
          { href: `/reports?from=${today}&to=${today}`, label: "View Today's Sales", icon: "📈" },
          { href: "/reports?status=submitted", label: "Review Daily Reports", icon: "📝", badge: o.reportsAwaiting },
          { href: "/money?status=submitted", label: "Receive Collected Money", icon: "💰", badge: unconfirmed },
          { href: "/pending", label: "View Pending Submissions", icon: "⏳" },
          { href: "/stock", label: "View Book Stock", icon: "📦" },
          { href: "/closing", label: "Daily Closing", icon: "🔒" },
          { href: "/my/sales", label: "Add My Own Sales", icon: "🛍️" },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Reports waiting for my review" actions={<Link href="/reports?status=submitted" className="tap text-sm font-semibold text-brand-700 hover:underline">See all</Link>}>
          {waiting.length === 0 ? (
            <p className="py-4 text-sm text-ink-500">✅ No reports are waiting. New reports will appear here and in your notifications.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {waiting.map((r) => (
                <li key={r.id}>
                  <Link href={`/reports/${r.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-brand-50/40">
                    <div>
                      <p className="font-semibold">{r.name}</p>
                      <p className="text-sm text-ink-500">{fmtDate(r.reportDate)} · {num(r.totalSold)} books · {inr(r.salesPaise)}</p>
                      {r.collectedPaise !== r.salesPaise && <p className="text-xs font-semibold text-amber-700">⚠ Money collected differs from sales</p>}
                    </div>
                    <span className="btn-primary btn-sm">Review Report</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Who has not submitted today's report?" subtitle={fmtDate(today)}>
          {devotees.length === 0 ? (
            <EmptyState icon="🙋" title="No devotees in your Dham yet" action={<Link href="/people" className="btn-primary btn-sm">Add a Devotee</Link>}>
              Add devotees so you can give them books.
            </EmptyState>
          ) : missing.length === 0 ? (
            <p className="py-4 text-sm text-ink-500">✅ Everyone has reported today.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {missing.map((d) => (
                <li key={d.id} className="flex items-center justify-between py-2.5">
                  <span className="font-medium">{d.name}</span>
                  {d.phone && <a href={`tel:${d.phone}`} className="btn-secondary btn-sm">📞 Call</a>}
                </li>
              ))}
            </ul>
          )}
          {todays.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-stone-100 pt-3 text-xs text-ink-500">
              Already reported today: {todays.filter((t) => t.status !== "draft").length} of {devotees.length}
            </div>
          )}
        </Card>
      </div>
      <div className="mt-4">
        <Card title="Sales at my Dham — last 14 days">
          <BarChart data={chart.map((d) => ({ label: d.date.slice(8), value: d.amount, sub: `${d.qty} books` }))} format={(n) => inr(n)} />
        </Card>
      </div>
    </>
  );
}
