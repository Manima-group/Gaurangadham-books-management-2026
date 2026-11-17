import Link from "next/link";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { db, schema } from "@/db";
import type { AppUser } from "@/lib/session";
import { overview, salesByDay } from "@/lib/stats";
import { H, holderStock, total } from "@/lib/stock";
import { fmtDate, inr, num, todayIST } from "@/lib/format";
import { BarChart, EmptyState, PageHeader, Section, StatCard, Alert } from "@/components/ui";
import { QuickActions, TodoNow, type Todo } from "./quick";
import { DhamWidgets } from "@/components/dhamwidgets";
import { dhamWise } from "@/lib/distribution";

export async function ManagerDashboard({ user }: { user: AppUser }) {
  if (!user.dhamId)
    return <Alert tone="amber" title="You are not linked to a Dham yet.">Please ask the Chakra Sevak to assign you to a Dham.</Alert>;
  const dhamId = user.dhamId;
  const today = todayIST();
  const t = schema.dhamTransfer;
  const [dw, o, store, chart, devotees, todays, waiting, [unconfirmed], transfersForMe] = await Promise.all([
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
    // transfers where this Dham must act: approve/send (it has the books) or confirm receipt (it asked)
    db.$count(t, or(and(eq(t.fromDhamId, dhamId), inArray(t.status, ["requested", "approved"])), and(eq(t.toDhamId, dhamId), eq(t.status, "sent")))),
  ]);
  const submitted = new Map(todays.filter((t) => t.status !== "draft").map((t) => [t.devoteeId, t.status]));
  const missing = devotees.filter((d) => !submitted.has(d.id));
  const inStore = total(store);
  const withDevotees = o.available - inStore;

  const mine = dw.find((d) => d.id === dhamId);

  const todo: Todo[] = [];
  if (o.reportsAwaiting) todo.push({ href: "/reports?status=submitted", icon: "📝", tone: "red", text: <><b>{num(o.reportsAwaiting)}</b> report{o.reportsAwaiting > 1 ? "s" : ""} waiting for your review</>, action: "Review" });
  if (unconfirmed) todo.push({ href: "/money?status=submitted", icon: "💰", text: <><b>{unconfirmed}</b> money submission{unconfirmed > 1 ? "s" : ""} to confirm as received</>, action: "Confirm" });
  if (transfersForMe) todo.push({ href: "/transfers", icon: "🚚", text: <><b>{transfersForMe}</b> Dham transfer{transfersForMe > 1 ? "s" : ""} waiting for you</>, action: "Open" });
  if (missing.length) todo.push({ href: "#not-reported", icon: "🙋", text: <><b>{missing.length} of {devotees.length}</b> devotees have not reported today<span className="block truncate text-xs text-ink-500">{missing.map((m) => m.name).join(", ")}</span></>, action: "Call" });
  if (o.pendingMoney) todo.push({ href: "/pending", icon: "⏳", text: <><b>{inr(o.pendingMoney)}</b> collected but not yet handed over</>, action: "See" });

  return (
    <>
      <PageHeader
        title={`${user.dhamName} — Today`}
        crumbs={[{ label: "Home" }]}
        doHere="Check today's work at your Dham: books, sales, money and reports waiting for you."
        next="Review reports as they come in. When all devotees have reported and money is received, do the Daily Closing."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon="🤲" label="Distributed today" value={num(mine?.today.total ?? 0)} tone="purple" href={`/distribution/${dhamId}`} hint={`${mine?.today.people ?? 0} of ${mine?.devotees ?? devotees.length} devotees · ${inr(mine?.today.amount ?? 0)}`} />
        <StatCard icon="📝" label="Reports waiting for my review" value={num(o.reportsAwaiting)} tone={o.reportsAwaiting ? "red" : "gray"} href="/reports?status=submitted" hint={o.reportsAwaiting ? "Tap to review" : "All caught up 🙏"} />
        <StatCard icon="⏳" label="Money yet to submit" value={inr(o.pendingMoney)} tone={o.pendingMoney ? "amber" : "green"} href="/pending" />
        <StatCard icon="🙋" label="Not reported today" value={`${missing.length} of ${devotees.length}`} tone={missing.length ? "amber" : "green"} href="/pending" />
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <TodoNow items={todo} />
        </div>
        <div className="lg:col-span-2">
          <QuickActions
            primary
            title="Main actions"
            items={[
              { href: "/stock/assign-devotees", label: "Assign Books", icon: "🤲" },
              { href: "/reports?status=submitted", label: "Review Reports", icon: "📝", badge: o.reportsAwaiting },
              { href: "/money?status=submitted", label: "Receive Money", icon: "💰", badge: unconfirmed },
              { href: "/closing", label: "Daily Closing", icon: "🔒" },
            ]}
          />
        </div>
      </div>

      <div className="space-y-3">
        <Section icon="📝" title="Reports waiting for my review" hint={waiting.length ? `${waiting.length} shown · newest first` : "No reports are waiting"} defaultOpen={waiting.length > 0}>
          {waiting.length === 0 ? (
            <p className="text-sm text-ink-500">✅ No reports are waiting. New reports will appear here and in your notifications.</p>
          ) : (
            <ul className="-my-2 divide-y divide-stone-100">
              {waiting.map((r) => (
                <li key={r.id}>
                  <Link href={`/reports/${r.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-stone-50">
                    <div className="min-w-0">
                      <p className="font-semibold">{r.name}</p>
                      <p className="text-sm text-ink-500">{fmtDate(r.reportDate)} · {num(r.totalSold)} books · {inr(r.salesPaise)}</p>
                      {r.collectedPaise !== r.salesPaise && <p className="text-xs font-semibold text-amber-700">⚠ Money collected differs from sales</p>}
                    </div>
                    <span className="btn-primary btn-sm shrink-0">Review</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link href="/reports?status=submitted" className="tap mt-1 text-sm font-semibold text-brand-700 hover:underline">See all reports →</Link>
        </Section>

        <Section id="not-reported" icon="🙋" title="Who has not submitted today's report?" hint={`${fmtDate(today)} · ${devotees.length ? `${missing.length} of ${devotees.length} not yet` : "no devotees yet"}`} defaultOpen={missing.length > 0 && missing.length <= 6}>
          {devotees.length === 0 ? (
            <EmptyState icon="🙋" title="No devotees in your Dham yet" action={<Link href="/people" className="btn-primary btn-sm">Add a Devotee</Link>}>
              Add devotees so you can give them books.
            </EmptyState>
          ) : missing.length === 0 ? (
            <p className="text-sm text-ink-500">✅ Everyone has reported today.</p>
          ) : (
            <ul className="-my-2 divide-y divide-stone-100">
              {missing.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 py-2.5">
                  <span className="font-medium">{d.name}</span>
                  {d.phone && <a href={`tel:${d.phone}`} className="btn-secondary btn-sm">📞 Call</a>}
                </li>
              ))}
            </ul>
          )}
          {todays.length > 0 && (
            <p className="mt-3 border-t border-stone-100 pt-3 text-xs text-ink-500">
              Already reported today: {todays.filter((t) => t.status !== "draft").length} of {devotees.length}
            </p>
          )}
        </Section>

        <Section icon="🛕" title="Today's distribution" hint={`${num(mine?.today.total ?? 0)} books today · ${num(mine?.all.total ?? 0)} so far`}>
          <DhamWidgets rows={dw.filter((d) => d.id === dhamId)} title="Today's distribution" showAllCard={false} />
        </Section>

        <Section icon="📊" title="All numbers" hint="Books available, assigned and sold · money collected and submitted">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard icon="📦" label="Books available in my Dham" value={num(o.available)} tone="blue" href="/stock" hint={`${num(inStore)} in store · ${num(withDevotees)} with devotees`} />
            <StatCard icon="🤲" label="Books assigned to devotees" value={num(o.distributed)} tone="purple" href="/stock#devotees" hint="Given out so far (less returns)" />
            <StatCard icon="📖" label="Books sold" value={num(o.soldApproved)} tone="green" href="/reports?status=approved" hint={o.soldPending ? `+ ${num(o.soldPending)} waiting for your review` : "From approved reports"} />
            <StatCard icon="🪙" label="Money collected" value={inr(o.collected)} tone="green" href="/money" />
            <StatCard icon="🏦" label="Money submitted by devotees" value={inr(o.submitted)} tone="blue" href="/money" hint={unconfirmed ? `${unconfirmed} to confirm as received` : "All confirmed"} />
          </div>
        </Section>

        <Section icon="⚡" title="All quick actions" hint="Receive books, today's sales, pending, stock, my own sales">
          <QuickActions
            bare
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
        </Section>

        <Section icon="📈" title="Sales at my Dham — last 14 days" hint="Value of books sold each day">
          <BarChart data={chart.map((d) => ({ label: d.date.slice(8), value: d.amount, sub: `${d.qty} books` }))} format={(n) => inr(n)} />
        </Section>
      </div>
    </>
  );
}
