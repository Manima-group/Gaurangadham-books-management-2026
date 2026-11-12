import Link from "next/link";
import { requireUser } from "@/lib/session";
import { dhamHealth, moneySummary, salesByDay, type Filters } from "@/lib/stats";
import { movementTotals, scopeStock, total } from "@/lib/stock";
import { allCampaigns, allDevotees, allDhams } from "@/lib/lookups";
import { addDays, fmtDate, inr, num, todayIST } from "@/lib/format";
import { BarChart, Card, PageHeader, StatCard, Badge } from "@/components/ui";
import { FilterBar } from "@/components/filters";

export default async function MonitorPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireUser("admin");
  const sp = await searchParams;
  const today = todayIST();
  const f: Filters = {
    dhamId: sp.dham ? Number(sp.dham) : null,
    campaignId: sp.drive ? Number(sp.drive) : undefined,
    devoteeId: sp.devotee || undefined,
    from: sp.from || undefined,
    to: sp.to || undefined,
  };
  const end = f.to && f.to < today ? f.to : today;
  const days = f.from ? Math.min(Math.max(Math.round((Date.parse(end) - Date.parse(f.from)) / 86400000) + 1, 1), 60) : 30;
  const [money, moves, stock, chart, health, dhams, drives, devotees] = await Promise.all([
    moneySummary(f),
    movementTotals(f),
    scopeStock(f.dhamId ?? null),
    salesByDay(f, days, end),
    dhamHealth(today),
    allDhams(),
    allCampaigns(),
    allDevotees(),
  ]);
  const todaySales = chart.at(-1);
  const filtered = Object.values(sp).some(Boolean);

  return (
    <>
      <PageHeader
        title="All Dhams Overview"
        crumbs={[{ label: "Home", href: "/dashboard" }, { label: "All Dhams Overview" }]}
        doHere="Monitor sales, books and money across every Dham. Use the filters to look at one Dham, drive, devotee or period."
        next="Tap a Dham to see its reports, or open Daily Closing to check a day's figures."
      />
      <Card className="mb-4">
        <FilterBar
          action="/monitor"
          values={sp}
          dhams={dhams.map((d) => ({ value: d.id, label: d.name }))}
          drives={drives.map((d) => ({ value: d.id, label: d.name }))}
          devotees={devotees.map((d) => ({ value: d.id, label: d.name }))}
        />
        {filtered && <p className="mt-3 text-sm text-ink-500">Showing filtered figures. Book stock always shows the current position.</p>}
      </Card>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={`Sales on ${fmtDate(end)}`} value={inr(todaySales?.amount ?? 0)} tone="green" hint={`${num(todaySales?.qty ?? 0)} books`} />
        <StatCard label="Books distributed" value={num(moves.assign_devotee - moves.returned)} tone="purple" hint="Given to devotees" />
        <StatCard label="Books sold" value={num(money.soldApproved)} tone="green" hint={money.soldPending ? `+ ${num(money.soldPending)} being reviewed` : undefined} />
        <StatCard label="Books available" value={num(total(stock))} tone="blue" />
        <StatCard label="Money collected" value={inr(money.collected)} tone="green" />
        <StatCard label="Money submitted" value={inr(money.submitted)} tone="blue" />
        <StatCard label="Money yet to submit" value={inr(money.pendingMoney)} tone={money.pendingMoney ? "amber" : "green"} href="/pending" />
        <StatCard label="Reports waiting for review" value={num(money.reportsAwaiting)} tone={money.reportsAwaiting ? "red" : "gray"} href="/reports?status=submitted" />
      </div>
      <Card title={`Daily sales — last ${days} days`} className="mb-4">
        <BarChart data={chart.map((d) => ({ label: d.date.slice(8), value: d.amount, sub: `${d.qty} books` }))} format={(n) => inr(n)} />
      </Card>
      <Card title="Dham by Dham">
        <ul className="space-y-3 md:hidden">
          {health.map((h) => (
            <li key={h.id} className="rounded-xl border border-stone-200/80 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">{h.name} {!h.isActive && <Badge>Inactive</Badge>}</p>
                {h.awaiting ? <Badge tone="red">{h.awaiting} to review</Badge> : null}
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <div className="flex justify-between"><dt className="text-ink-500">Reported today</dt><dd className="font-semibold">{h.reportedToday}/{h.devotees}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-500">Sales</dt><dd className="font-semibold tabular-nums">{inr(h.sales)}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-500">Collected</dt><dd className="font-semibold tabular-nums">{inr(h.collected)}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-500">Submitted</dt><dd className="font-semibold tabular-nums">{inr(h.submitted)}</dd></div>
                <div className="col-span-2 flex justify-between"><dt className="text-ink-500">Money yet to submit</dt><dd className={`font-bold tabular-nums ${h.pending ? "text-amber-700" : ""}`}>{inr(h.pending)}</dd></div>
              </dl>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Link href={`/reports?dham=${h.id}`} className="btn-secondary btn-sm">Reports</Link>
                <Link href={`/closing?dham=${h.id}`} className="btn-secondary btn-sm">Daily Closing</Link>
              </div>
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto md:block">
          <table className="data-table">
            <thead><tr><th>Dham</th><th className="text-right">Devotees</th><th className="text-right">Reported today</th><th className="text-right">Sales (approved)</th><th className="text-right">Collected</th><th className="text-right">Submitted</th><th className="text-right">Yet to submit</th><th className="text-right">Waiting review</th><th></th></tr></thead>
            <tbody>
              {health.map((h) => (
                <tr key={h.id}>
                  <td className="font-semibold">{h.name} {!h.isActive && <Badge>Inactive</Badge>}</td>
                  <td className="text-right">{h.devotees}</td>
                  <td className="text-right">{h.reportedToday} / {h.devotees}</td>
                  <td className="text-right tabular-nums">{inr(h.sales)}</td>
                  <td className="text-right tabular-nums">{inr(h.collected)}</td>
                  <td className="text-right tabular-nums">{inr(h.submitted)}</td>
                  <td className={`text-right tabular-nums ${h.pending ? "font-semibold text-amber-700" : ""}`}>{inr(h.pending)}</td>
                  <td className="text-right">{h.awaiting ? <Badge tone="red">{h.awaiting}</Badge> : "—"}</td>
                  <td className="whitespace-nowrap text-right">
                    <Link href={`/reports?dham=${h.id}`} className="btn-secondary btn-sm">Reports</Link>{" "}
                    <Link href={`/closing?dham=${h.id}&date=${addDays(today, 0)}`} className="btn-secondary btn-sm">Closing</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
