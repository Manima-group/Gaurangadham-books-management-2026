import { DownloadReport } from "@/components/download";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { bookWise, devoteeWise, PERIOD_LABEL, type Period } from "@/lib/distribution";
import { fmtDate, inr, num } from "@/lib/format";
import { Badge, Card, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { ChipLinks } from "@/components/chips";

const PERIODS: Period[] = ["today", "week", "month", "all"];
const MEDAL = ["🥇", "🥈", "🥉"];

export default async function DhamDistribution({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ period?: string; size?: string }>;
}) {
  const u = await requireUser("admin", "manager");
  const id = Number((await params).id);
  if (u.role === "manager" && id !== u.dhamId) notFound();
  const [dham] = await db.select().from(schema.dham).where(eq(schema.dham.id, id));
  if (!dham) notFound();
  const sp = await searchParams;
  const period = (PERIODS.includes(sp.period as Period) ? sp.period : "today") as Period;
  const size = sp.size === "big" || sp.size === "small" ? sp.size : undefined;
  const [people, books, everyone] = await Promise.all([
    devoteeWise(id, period, size),
    bookWise(id, period, size),
    size ? devoteeWise(id, period) : Promise.resolve(null),
  ]);
  const active = people.filter((p) => p.total > 0);
  const idle = people.filter((p) => p.total === 0);
  // The Big / Small cards always show the real split, even while one size is selected
  const split = (everyone ?? people).reduce((a, p) => ({ big: a.big + p.big, small: a.small + p.small }), { big: 0, small: 0 });
  const tot = active.reduce((a, p) => ({ big: a.big + p.big, small: a.small + p.small, amt: a.amt + p.amount }), { big: 0, small: 0, amt: 0 });
  const max = Math.max(...active.map((p) => p.total), 1);
  const q = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const v = { period, size, ...o };
    if (v.period && v.period !== "today") p.set("period", v.period);
    if (v.size) p.set("size", v.size);
    const s = p.toString();
    return s ? `/distribution/${id}?${s}` : `/distribution/${id}`;
  };
  const what = size === "big" ? "big books" : size === "small" ? "small books" : "books";

  return (
    <>
      <PageHeader
        title={`${dham.name} — Who distributed?`}
        crumbs={[{ label: "Home", href: "/dashboard" }, ...(u.role === "admin" ? [{ label: "Dham-wise Distribution", href: "/distribution" }] : []), { label: dham.name }]}
        doHere={`See how many ${what} each devotee of ${dham.name} distributed. Change the period or book size with the buttons.`}
        next="Tap a devotee to open their daily reports."
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
      <div className="mb-4"><DownloadReport kind="distribution" params={{ period, size, dham: String(id) }} /></div>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={`${size === "big" ? "Big books" : size === "small" ? "Small books" : "Books"} · ${PERIOD_LABEL[period]}`} value={num(tot.big + tot.small)} tone="green" />
        <StatCard label="📕 Big books" value={num(split.big)} tone="purple" href={q({ size: "big" })} />
        <StatCard label="📗 Small books" value={num(split.small)} tone="blue" href={q({ size: "small" })} />
        <StatCard label="Devotees distributed" value={`${active.length} of ${people.length}`} hint={inr(tot.amt)} />
      </div>

      <Card title={`Devotees · ${PERIOD_LABEL[period]}`} subtitle={`Ranked by ${what} distributed`}>
        {active.length === 0 ? (
          <EmptyState icon="🙏" title={`No ${what} distributed ${period === "today" ? "today" : "in this period"} yet.`}>
            Numbers appear here as devotees send their daily sales reports.
          </EmptyState>
        ) : (
          <ol className="space-y-2">
            {active.map((p, i) => (
              <li key={p.id}>
                <a href={`/reports?devotee=${p.id}`} className="block rounded-xl border border-stone-200/80 p-3 transition hover:border-brand-300 hover:bg-brand-50/40">
                  <div className="flex items-center gap-3">
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold ${i < 3 ? "bg-brand-50 text-xl" : "bg-stone-100 text-sm text-ink-700"}`} aria-label={`Rank ${i + 1}`}>
                      {i < 3 ? MEDAL[i] : i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{p.name}</p>
                      <p className="text-xs text-ink-500">📕 Big {num(p.big)} · 📗 Small {num(p.small)} · {inr(p.amount)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-2xl font-extrabold tabular-nums text-brand-700">{num(p.total)}</p>
                      <p className="text-[11px] text-ink-500">{period === "today" ? "books" : `${p.days} day${p.days === 1 ? "" : "s"}`}</p>
                    </div>
                  </div>
                  <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-stone-100">
                    <div className="bg-violet-500" style={{ width: `${(p.big / max) * 100}%` }} />
                    <div className="bg-sky-400" style={{ width: `${(p.small / max) * 100}%` }} />
                  </div>
                  {period !== "today" && p.last && <p className="mt-1 text-[11px] text-ink-500">Last distributed {fmtDate(p.last)}</p>}
                </a>
              </li>
            ))}
          </ol>
        )}
        {active.length > 0 && (
          <p className="mt-3 flex items-center gap-3 text-xs text-ink-500">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded-sm bg-violet-500" /> Big</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded-sm bg-sky-400" /> Small</span>
          </p>
        )}
        {idle.length > 0 && (
          <div className="mt-4 border-t border-stone-100 pt-3">
            <p className="mb-2 text-sm font-semibold text-ink-700">No {what} {period === "today" ? "today" : "in this period"} ({idle.length})</p>
            <ul className="flex flex-wrap gap-2">
              {idle.map((p) => (
                <li key={p.id} className="flex items-center gap-1 rounded-full bg-stone-100 py-1 pl-3 pr-1 text-sm text-ink-700">
                  {p.name}
                  {p.phone ? <a href={`tel:${p.phone}`} aria-label={`Call ${p.name}`} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white">📞</a> : <span className="w-2" />}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card title="Which books?" subtitle={`${dham.name} · ${PERIOD_LABEL[period]}`} className="mt-4">
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
