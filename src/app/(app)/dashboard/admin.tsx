import Link from "next/link";
import { count, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { overview, salesByDay, dhamHealth } from "@/lib/stats";
import { holderStock, total } from "@/lib/stock";
import { setupProgress } from "@/lib/setup";
import { inr, num, todayIST, timeAgo } from "@/lib/format";
import { Alert, BarChart, Card, HBar, LinkButton, PageHeader, StatCard, Badge, EmptyState } from "@/components/ui";
import { QuickActions } from "./quick";
import { DhamWidgets } from "@/components/dhamwidgets";
import { dhamWise } from "@/lib/distribution";

export async function AdminDashboard() {
  const today = todayIST();
  const [dw, o, chart, health, setup, central, [{ active }], recent] = await Promise.all([
    dhamWise("today"),
    overview({}),
    salesByDay({}, 14, today),
    dhamHealth(today),
    setupProgress(),
    holderStock("central"),
    db.select({ active: count() }).from(schema.dham).where(eq(schema.dham.isActive, true)),
    db.select().from(schema.activityLog).orderBy(desc(schema.activityLog.createdAt)).limit(6),
  ]);
  const attention = health.filter((h) => h.isActive && h.reasons.length);
  const maxMoney = Math.max(...health.map((h) => h.collected), 1);

  return (
    <>
      <PageHeader
        title="Organisation Overview"
        crumbs={[{ label: "Home" }]}
        doHere="See today's distribution in every Dham first. Tap a Dham to see who distributed how many books."
        next="Use Quick Actions to add Dhams, books or people. Reports and Dhams that need your attention are listed below."
      />

      {!setup.complete && (
        <div className="mb-6">
          <Alert tone="purple" title={`Setup is ${setup.done} of ${setup.total} steps complete`}>
            Finish the setup so Managers and Devotees can start working.{" "}
            <Link href="/setup" className="font-semibold underline">Continue setup →</Link>
          </Alert>
        </div>
      )}

      <DhamWidgets rows={dw} />

      <h2 className="mb-3 font-display text-lg font-bold text-ink-900">Books &amp; money at a glance</h2>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon="🛕" label="Active Dhams" value={num(active)} href="/dhams" hint="Dhams currently distributing" />
        <StatCard icon="📦" label="Books available" value={num(o.available)} tone="blue" href="/stock" hint={`${num(total(central))} in Central Store, rest at Dhams & with devotees`} />
        <StatCard icon="🤲" label="Books distributed" value={num(o.distributed)} tone="purple" href="/stock/history" hint="Given to devotees so far" />
        <StatCard icon="📖" label="Books sold" value={num(o.soldApproved)} tone="green" href="/monitor" hint={o.soldPending ? `+ ${num(o.soldPending)} in reports being reviewed` : "From approved reports"} />
        <StatCard icon="🪙" label="Money collected" value={inr(o.collected)} tone="green" href="/money" hint="As reported by devotees" />
        <StatCard icon="🏦" label="Money submitted" value={inr(o.submitted)} tone="blue" href="/money" hint={`${inr(o.receivedConfirmed)} confirmed by Managers`} />
        <StatCard icon="⏳" label="Money yet to submit" value={inr(o.pendingMoney)} tone={o.pendingMoney > 0 ? "amber" : "green"} href="/money" hint="Collected but not yet handed over" />
        <StatCard icon="📝" label="Reports waiting for review" value={num(o.reportsAwaiting)} tone={o.reportsAwaiting ? "red" : "gray"} href="/reports?status=submitted" hint={o.reportsAwaiting ? "Tap to review" : "All caught up"} />
      </div>

      <QuickActions
        items={[
          { href: "/dhams", label: "Add a Dham", icon: "🛕" },
          { href: "/books", label: "Add a Book", icon: "📚" },
          { href: "/books#prices", label: "Update Book Prices", icon: "🏷️" },
          { href: "/people?role=manager", label: "Add a Manager", icon: "🧑‍💼" },
          { href: "/people?role=devotee", label: "Add a Devotee", icon: "🙋" },
          { href: "/drives", label: "Create a Distribution Drive", icon: "🚩" },
          { href: "/stock/receive", label: "Receive Books", icon: "📥" },
          { href: "/monitor", label: "View Reports", icon: "📊", badge: o.reportsAwaiting },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <Card title="Sales in the last 14 days" subtitle="Value of books sold each day (approved and being reviewed)" className="lg:col-span-3">
          <BarChart
            data={chart.map((d) => ({ label: d.date.slice(8), value: d.amount, sub: `${d.qty} books` }))}
            format={(n) => inr(n)}
          />
        </Card>
        <Card title="Money by Dham" subtitle="Collected vs. submitted" className="lg:col-span-2">
          {health.length === 0 ? (
            <EmptyState title="No Dhams yet" action={<LinkButton href="/dhams" size="sm">Add a Dham</LinkButton>}>
              Add your first Dham to start.
            </EmptyState>
          ) : (
            <div className="space-y-4">
              {health.map((h) => (
                <div key={h.id} className="space-y-1.5">
                  <p className="text-sm font-semibold">{h.name}</p>
                  <HBar label="Collected" value={h.collected} max={maxMoney} format={inr} />
                  <HBar label="Submitted" value={h.submitted} max={maxMoney} format={inr} tone="green" />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Dhams that need attention" subtitle="Things to follow up today">
          {attention.length === 0 ? (
            <p className="py-4 text-sm text-ink-500">✅ All Dhams are up to date.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {attention.map((h) => (
                <li key={h.id} className="py-3">
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`/monitor?dham=${h.id}`} className="tap font-semibold hover:underline">{h.name}</Link>
                    {h.pending > 0 && <Badge tone="amber">{inr(h.pending)} to submit</Badge>}
                  </div>
                  <ul className="mt-1 list-inside list-disc text-sm text-ink-700">
                    {h.reasons.map((r) => <li key={r}>{r}</li>)}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Recent activity" actions={<Link href="/activity" className="tap text-sm font-semibold text-brand-700 hover:underline">View all</Link>}>
          {recent.length === 0 ? (
            <p className="py-4 text-sm text-ink-500">Nothing has happened yet.</p>
          ) : (
            <ul className="space-y-3">
              {recent.map((a) => (
                <li key={a.id} className="text-sm">
                  <p className="text-ink-900">{a.action}</p>
                  <p className="text-xs text-ink-500">{timeAgo(a.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
