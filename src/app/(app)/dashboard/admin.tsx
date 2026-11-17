import Link from "next/link";
import { count, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { overview, salesByDay, dhamHealth } from "@/lib/stats";
import { holderStock, total } from "@/lib/stock";
import { setupProgress } from "@/lib/setup";
import { inr, num, todayIST, timeAgo } from "@/lib/format";
import { BarChart, Card, HBar, LinkButton, PageHeader, Section, StatCard, Badge, EmptyState } from "@/components/ui";
import { QuickActions, TodoNow, type Todo } from "./quick";
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
  const todayTotal = dw.reduce((a, d) => ({ qty: a.qty + d.today.total, amt: a.amt + d.today.amount }), { qty: 0, amt: 0 });

  const todo: Todo[] = [];
  if (!setup.complete) todo.push({ href: "/setup", icon: "✅", tone: "amber", text: <>Setup is <b>{setup.done} of {setup.total}</b> steps complete — finish it so Sector Sevaks and Devotees can start</>, action: "Continue" });
  if (o.reportsAwaiting) todo.push({ href: "/reports?status=submitted", icon: "📝", tone: "red", text: <><b>{num(o.reportsAwaiting)}</b> report{o.reportsAwaiting > 1 ? "s" : ""} waiting for review</>, action: "Review" });
  for (const h of attention)
    todo.push({
      href: `/monitor?dham=${h.id}`,
      icon: "🛕",
      text: (
        <>
          <b>{h.name}</b>
          {h.pending > 0 && <span className="ml-2"><Badge tone="amber">{inr(h.pending)} to submit</Badge></span>}
          <span className="block text-xs text-ink-500">{h.reasons.join(" · ")}</span>
        </>
      ),
    });

  return (
    <>
      <PageHeader
        title="Organisation Overview"
        crumbs={[{ label: "Home" }]}
        doHere="See today's distribution in every Dham first. Tap a Dham to see who distributed how many books."
        next="Use Quick Actions to add Dhams, books or people. Reports and Dhams that need your attention are listed below."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon="🤲" label="Distributed today" value={num(todayTotal.qty)} tone="purple" href="/distribution" hint={`${inr(todayTotal.amt)} · all Dhams`} />
        <StatCard icon="📦" label="Books available" value={num(o.available)} tone="blue" href="/stock" hint={`${num(total(central))} in Central Store, rest at Dhams & with devotees`} />
        <StatCard icon="⏳" label="Money yet to submit" value={inr(o.pendingMoney)} tone={o.pendingMoney > 0 ? "amber" : "green"} href="/money" hint="Collected but not yet handed over" />
        <StatCard icon="📝" label="Reports waiting for review" value={num(o.reportsAwaiting)} tone={o.reportsAwaiting ? "red" : "gray"} href="/reports?status=submitted" hint={o.reportsAwaiting ? "Tap to review" : "All caught up"} />
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <TodoNow items={todo} done="All Dhams are up to date." />
        </div>
        <div className="lg:col-span-2">
          <QuickActions
            primary
            title="Main actions"
            items={[
              { href: "/stock/receive", label: "Receive Books", icon: "📥" },
              { href: "/stock/assign-dham", label: "Send Books to a Dham", icon: "🚚" },
              { href: "/reports?status=submitted", label: "Review Reports", icon: "📝", badge: o.reportsAwaiting },
              { href: "/people", label: "Sevaks & Devotees", icon: "👥" },
            ]}
          />
        </div>
      </div>

      <div className="space-y-3">
        <Section icon="🛕" title="Distribution by Dham — today" hint={dw.map((d) => `${d.name.replace(/ Dham$/, "")} ${num(d.today.total)}`).join(" · ") || "No active Dhams yet"}>
          <DhamWidgets rows={dw} title="Dham-wise distribution" />
        </Section>
        <Section icon="📊" title="All numbers" hint="Dhams, books distributed and sold, money collected and submitted">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard icon="🛕" label="Active Dhams" value={num(active)} href="/dhams" hint="Dhams currently distributing" />
            <StatCard icon="🤲" label="Books distributed" value={num(o.distributed)} tone="purple" href="/stock/history" hint="Given to devotees so far" />
            <StatCard icon="📖" label="Books sold" value={num(o.soldApproved)} tone="green" href="/monitor" hint={o.soldPending ? `+ ${num(o.soldPending)} in reports being reviewed` : "From approved reports"} />
            <StatCard icon="🪙" label="Money collected" value={inr(o.collected)} tone="green" href="/money" hint="As reported by devotees" />
            <StatCard icon="🏦" label="Money submitted" value={inr(o.submitted)} tone="blue" href="/money" hint={`${inr(o.receivedConfirmed)} confirmed by Sector Sevaks`} />
          </div>
        </Section>
        <Section icon="⚡" title="All quick actions" hint="Add Dhams, books, people, drives and more">
          <QuickActions
            bare
            items={[
              { href: "/dhams", label: "Add a Dham", icon: "🛕" },
              { href: "/books", label: "Add a Book", icon: "📚" },
              { href: "/books#prices", label: "Update Book Prices", icon: "🏷️" },
              { href: "/people?role=manager", label: "Add a Sector Sevak", icon: "🧑‍💼" },
              { href: "/people?role=devotee", label: "Add a Devotee", icon: "🙋" },
              { href: "/drives", label: "Create a Distribution Drive", icon: "🚩" },
              { href: "/stock/receive", label: "Receive Books", icon: "📥" },
              { href: "/monitor", label: "View Reports", icon: "📊", badge: o.reportsAwaiting },
            ]}
          />
        </Section>
        <Section icon="📈" title="Sales and money charts" hint="Sales in the last 14 days · money by Dham">
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
        </Section>
        <Section icon="🕘" title="Recent activity" hint={recent[0] ? `${recent[0].action} · ${timeAgo(recent[0].createdAt)}` : "Nothing has happened yet."}>
          {recent.length === 0 ? (
            <p className="text-sm text-ink-500">Nothing has happened yet.</p>
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
          <Link href="/activity" className="tap mt-2 text-sm font-semibold text-brand-700 hover:underline">View all activity →</Link>
        </Section>
      </div>
    </>
  );
}
