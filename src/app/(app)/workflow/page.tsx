import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireUser } from "@/lib/session";
import { setupProgress } from "@/lib/setup";
import { H, holderStock, total } from "@/lib/stock";
import { moneySummary } from "@/lib/stats";
import { fmtDate, inr, num, todayIST } from "@/lib/format";
import { Badge, PageHeader } from "@/components/ui";
import type { Tone } from "@/lib/terms";

type Stage = {
  title: string;
  icon: string;
  who: string;
  status: { label: string; tone: Tone };
  pending: string;
  last: string | null;
  related: string;
  href: string;
};

const DONE = { label: "Up to date", tone: "green" as Tone };
const ACTION = { label: "Action needed", tone: "amber" as Tone };
const NOT_STARTED = { label: "Not started", tone: "gray" as Tone };

export default async function WorkflowPage() {
  const u = await requireUser("admin", "manager");
  const today = todayIST();
  const dhamId = u.role === "manager" ? u.dhamId! : null;
  const dc = dhamId ? sql`and dham_id = ${dhamId}` : sql``;

  const q = async <T,>(s: ReturnType<typeof sql>) => ((await db.execute(s)) as unknown as T[])[0];
  const lastMove = (kind: string) =>
    q<{ d: string | null; n: number }>(sql`select to_char(max(movement_date),'YYYY-MM-DD') as d, coalesce(sum(qty),0)::int as n from stock_movement where kind = ${kind} and reversed_by is null ${dc}`);

  const [setup, rec, toDham, toDev, central, store, money, rep, rev, devs, close, sub] = await Promise.all([
    setupProgress(),
    lastMove("received"),
    lastMove("assign_dham"),
    lastMove("assign_devotee"),
    holderStock(H.central),
    dhamId ? holderStock(H.dham(dhamId)) : Promise.resolve(new Map<number, number>()),
    moneySummary({ dhamId }),
    q<{ d: string | null; today: number }>(sql`select to_char(max(report_date),'YYYY-MM-DD') as d, count(*) filter (where report_date = ${today} and status <> 'draft')::int as today from daily_report where status <> 'draft' ${dc}`),
    q<{ d: string | null }>(sql`select to_char(max(reviewed_at at time zone 'Asia/Kolkata'),'YYYY-MM-DD') as d from daily_report where reviewed_at is not null ${dc}`),
    q<{ n: number }>(sql`select count(*)::int as n from "user" where role = 'devotee' and is_active ${dhamId ? sql`and dham_id = ${dhamId}` : sql``}`),
    q<{ d: string | null; today: number; dhams: number }>(sql`select to_char(max(closing_date),'YYYY-MM-DD') as d, count(*) filter (where closing_date = ${today})::int as today, (select count(*) from dham where is_active ${dhamId ? sql`and id = ${dhamId}` : sql``})::int as dhams from daily_closing where true ${dc}`),
    q<{ d: string | null }>(sql`select to_char(max(submission_date),'YYYY-MM-DD') as d from money_submission where status <> 'disputed' ${dc}`),
  ]);
  const next = setup.steps.find((s) => !s.done);
  const notReported = Math.max(devs.n - rep.today, 0);

  const stages: Stage[] = [
    {
      title: "Admin Setup", icon: "✅", who: "Global Admin",
      status: setup.complete ? DONE : setup.done ? { label: `${setup.done} of ${setup.total} done`, tone: "amber" } : NOT_STARTED,
      pending: next ? `Add ${next.title.toLowerCase()}` : "Nothing pending",
      last: null, related: `${setup.done} of ${setup.total} setup steps complete`, href: "/setup",
    },
    {
      title: "Books Received", icon: "📥", who: u.role === "admin" ? "Global Admin / Dham Manager" : "Dham Manager",
      status: rec.n ? DONE : NOT_STARTED,
      pending: rec.n ? "Record new books whenever they arrive" : "Receive the first books",
      last: rec.d, related: `${num(rec.n)} books received in total`, href: "/stock/history?kind=received",
    },
    {
      title: "Books Assigned to Dham", icon: "🛕", who: "Global Admin",
      status: dhamId ? (toDham.n ? DONE : NOT_STARTED) : total(central) > 0 ? ACTION : toDham.n ? DONE : NOT_STARTED,
      pending: dhamId ? "Admin sends books from the Central Store" : total(central) > 0 ? `${num(total(central))} books in the Central Store not yet sent to a Dham` : "Nothing pending",
      last: toDham.d, related: `${num(toDham.n)} books sent to Dhams`, href: "/stock/history?kind=assign_dham",
    },
    {
      title: "Books Assigned to Devotees", icon: "🤲", who: "Dham Manager",
      status: dhamId && total(store) > 0 ? { label: "Books waiting in store", tone: "blue" } : toDev.n ? DONE : NOT_STARTED,
      pending: dhamId && total(store) > 0 ? `${num(total(store))} books in the Dham store can be given to devotees` : "Give books to devotees as needed",
      last: toDev.d, related: `${num(toDev.n)} books given to devotees`, href: u.role === "manager" ? "/stock/assign-devotees" : "/stock/history?kind=assign_devotee",
    },
    {
      title: "Daily Sales Recorded", icon: "📝", who: "Devotees",
      status: devs.n === 0 ? NOT_STARTED : notReported ? ACTION : DONE,
      pending: notReported ? `${notReported} of ${devs.n} devotees have not reported today` : "All devotees reported today",
      last: rep.d, related: `${rep.today} report(s) today`, href: "/pending",
    },
    {
      title: "Money Collected", icon: "🪙", who: "Devotees",
      status: money.collected ? DONE : NOT_STARTED,
      pending: "Recorded automatically with each daily report",
      last: rep.d, related: `${inr(money.collected)} collected in total`, href: "/money",
    },
    {
      title: "Money Submitted", icon: "🏦", who: "Devotees → Dham Manager",
      status: money.pendingMoney > 0 ? ACTION : money.submitted ? DONE : NOT_STARTED,
      pending: money.pendingMoney > 0 ? `${inr(money.pendingMoney)} yet to submit${money.unconfirmedSubmissions ? ` · ${money.unconfirmedSubmissions} to confirm` : ""}` : "All collected money submitted",
      last: sub.d, related: `${inr(money.submitted)} submitted`, href: "/money",
    },
    {
      title: "Manager Review", icon: "🔍", who: "Dham Manager",
      status: money.reportsAwaiting ? ACTION : rev.d ? DONE : NOT_STARTED,
      pending: money.reportsAwaiting ? `${money.reportsAwaiting} report(s) waiting for review` : "No reports waiting",
      last: rev.d, related: `${money.reportsNeedChanges} sent back for correction`, href: "/reports?status=submitted",
    },
    {
      title: "Admin Monitoring", icon: "📊", who: "Global Admin",
      status: { label: "Ongoing", tone: "blue" },
      pending: "Check the overview daily for Dhams needing attention",
      last: today, related: "Sales, stock and money across all Dhams", href: u.role === "admin" ? "/monitor" : "/dashboard",
    },
    {
      title: "Daily Closing", icon: "🔒", who: "Dham Manager / Admin",
      status: close.today >= close.dhams && close.dhams > 0 ? DONE : ACTION,
      pending: close.today >= close.dhams && close.dhams > 0 ? "Today is closed" : `${Math.max(close.dhams - close.today, 0)} Dham(s) not yet closed for today`,
      last: close.d, related: "Book and money summary for each day", href: "/closing",
    },
  ];

  return (
    <>
      <PageHeader
        title="How It Works"
        crumbs={[{ label: "Home", href: "/dashboard" }, { label: "How It Works" }]}
        doHere={`Follow the journey of books and money from start to finish${dhamId ? ` at ${u.dhamName}` : ""}. Each stage shows who is responsible and what is pending.`}
        next="Tap any stage to open the related records and take action."
      />
      <ol className="relative space-y-3">
        {stages.map((s, i) => (
          <li key={s.title}>
            <Link href={s.href} className="group flex gap-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm transition hover:border-brand-300 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-brand-200">
              <div className="flex flex-col items-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-xl ring-2 ring-brand-200" aria-hidden>{s.icon}</span>
                <span className="mt-1 text-xs font-bold text-ink-500">Step {i + 1}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold group-hover:text-brand-800">{s.title}</h2>
                  <Badge tone={s.status.tone}>{s.status.label}</Badge>
                </div>
                <dl className="mt-1 grid gap-x-6 gap-y-0.5 text-sm sm:grid-cols-2">
                  <div><dt className="inline text-ink-500">Responsible: </dt><dd className="inline font-medium">{s.who}</dd></div>
                  <div><dt className="inline text-ink-500">Last completed: </dt><dd className="inline font-medium">{s.last ? fmtDate(s.last) : "—"}</dd></div>
                  <div><dt className="inline text-ink-500">Pending: </dt><dd className="inline font-medium">{s.pending}</dd></div>
                  <div><dt className="inline text-ink-500">Records: </dt><dd className="inline">{s.related}</dd></div>
                </dl>
              </div>
              <span className="self-center text-xl text-ink-500 group-hover:text-brand-700" aria-hidden>›</span>
            </Link>
            {i < stages.length - 1 && <div className="ml-9 h-3 border-l-2 border-dashed border-brand-200" aria-hidden />}
          </li>
        ))}
      </ol>
    </>
  );
}
