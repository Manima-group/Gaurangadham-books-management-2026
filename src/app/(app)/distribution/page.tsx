import { DownloadReport } from "@/components/download";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { dhamWise, bookWise, PERIOD_LABEL, type Period } from "@/lib/distribution";
import { inr, num } from "@/lib/format";
import { Card, EmptyState, PageHeader, StatCard, Badge } from "@/components/ui";
import { ChipLinks } from "@/components/chips";

const PERIODS: Period[] = ["today", "week", "month", "all"];

export default async function DistributionPage({ searchParams }: { searchParams: Promise<{ period?: string; size?: string }> }) {
  const u = await requireUser("admin", "manager");
  const sp = await searchParams;
  if (u.role === "manager") redirect(`/distribution/${u.dhamId}${sp.period ? `?period=${sp.period}` : ""}`);
  const period = (PERIODS.includes(sp.period as Period) ? sp.period : "today") as Period;
  const size = sp.size === "big" || sp.size === "small" ? sp.size : undefined;
  const [rows, books] = await Promise.all([dhamWise(period), bookWise(null, period, size)]);
  const pick = (r: (typeof rows)[number]) => (size === "big" ? r.period.big : size === "small" ? r.period.small : r.period.total);
  const tot = rows.reduce((a, r) => ({ big: a.big + r.period.big, small: a.small + r.period.small, amt: a.amt + r.period.amount, people: a.people + r.period.people }), { big: 0, small: 0, amt: 0, people: 0 });
  const max = Math.max(...rows.map(pick), 1);
  const q = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const v = { period, size, ...o };
    if (v.period && v.period !== "today") p.set("period", v.period);
    if (v.size) p.set("size", v.size);
    const s = p.toString();
    return s ? `/distribution?${s}` : "/distribution";
  };

  return (
    <>
      <PageHeader
        title="Dham-wise Distribution"
        crumbs={[{ label: "Home", href: "/dashboard" }, { label: "Dham-wise Distribution" }]}
        doHere="See how many books each Dham distributed. Choose a period and Big or Small books. Tap a Dham to see each devotee."
        next="Counts come from devotees' daily reports (approved and being reviewed)."
      />
      <div className="mb-4 space-y-2">
        <ChipLinks label="Period" items={PERIODS.map((p) => ({ href: q({ period: p }), label: PERIOD_LABEL[p], active: p === period }))} />
        <ChipLinks
          label="Book size"
          items={[
            { href: q({ size: undefined }), label: "All books", active: !size },
            { href: q({ size: "big" }), label: "📕 Big books", active: size === "big" },
            { href: q({ size: "small" }), label: "📗 Small books", active: size === "small" },
          ]}
        />
      </div>
      <div className="mb-4"><DownloadReport kind="distribution" params={{ period, size }} /></div>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={`Books distributed · ${PERIOD_LABEL[period]}`} value={num(size === "big" ? tot.big : size === "small" ? tot.small : tot.big + tot.small)} tone="green" />
        <StatCard label="📕 Big books" value={num(tot.big)} tone="purple" href={q({ size: "big" })} />
        <StatCard label="📗 Small books" value={num(tot.small)} tone="blue" href={q({ size: "small" })} />
        <StatCard label="Value" value={inr(tot.amt)} hint={`${tot.people} devotees distributed`} />
      </div>

      <Card title={`Dhams · ${PERIOD_LABEL[period]}${size ? ` · ${size === "big" ? "Big" : "Small"} books` : ""}`} subtitle="Tap a Dham to see who distributed how many books">
        {rows.length === 0 ? (
          <EmptyState icon="🛕" title="No active Dhams yet." />
        ) : (
          <ul className="space-y-2">
            {[...rows].sort((a, b) => pick(b) - pick(a)).map((r) => (
              <li key={r.id}>
                <Link href={`/distribution/${r.id}?period=${period}${size ? `&size=${size}` : ""}`} className="block rounded-xl border border-stone-200/80 p-3 transition hover:border-brand-300 hover:bg-brand-50/40">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold">🛕 {r.name}</p>
                    <p className="font-display text-2xl font-extrabold tabular-nums text-brand-700">{num(pick(r))}</p>
                  </div>
                  <div className="mt-1.5 h-2 rounded-full bg-stone-100">
                    <div className="h-2 rounded-full bg-gradient-to-r from-brand-500 to-brand-400" style={{ width: `${(pick(r) / max) * 100}%` }} />
                  </div>
                  <p className="mt-1.5 text-xs text-ink-500">
                    📕 Big {num(r.period.big)} · 📗 Small {num(r.period.small)} · {inr(r.period.amount)} · {r.period.people} of {r.devotees} devotees <span aria-hidden>›</span>
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Books distributed" subtitle="All Dhams, most distributed first" className="mt-4">
        {books.length === 0 ? (
          <p className="text-sm text-ink-500">No books distributed in this period yet.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {books.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="font-medium leading-snug">{b.title} <span className="text-ink-500">({b.language})</span></p>
                  <Badge tone={b.size === "big" ? "purple" : "blue"}>{b.size === "big" ? "Big" : "Small"}</Badge>
                </div>
                <div className="text-right">
                  <p className="font-display text-lg font-extrabold tabular-nums">{num(b.qty)}</p>
                  <p className="text-xs text-ink-500">{inr(b.amt)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
