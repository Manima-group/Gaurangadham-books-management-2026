import Link from "next/link";
import { inr, num } from "@/lib/format";
import type { dhamWise } from "@/lib/distribution";

type D = Awaited<ReturnType<typeof dhamWise>>[number];

function Split({ big, small, light }: { big: number; small: number; light?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${light ? "bg-white/15 text-white" : "bg-violet-50 text-violet-800 ring-1 ring-violet-200"}`}>
        📕 Big <b className="tabular-nums">{num(big)}</b>
      </span>
      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${light ? "bg-white/15 text-white" : "bg-sky-50 text-sky-800 ring-1 ring-sky-200"}`}>
        📗 Small <b className="tabular-nums">{num(small)}</b>
      </span>
    </div>
  );
}

/** Dham-wise distribution cards: today's books and the running total. Tap a card to see who distributed. */
export function DhamWidgets({ rows, title = "Dham-wise distribution", showAllCard = true }: { rows: D[]; title?: string; showAllCard?: boolean }) {
  const sum = rows.reduce(
    (a, r) => ({
      tBig: a.tBig + r.today.big, tSmall: a.tSmall + r.today.small, tAmt: a.tAmt + r.today.amount, people: a.people + r.today.people, devotees: a.devotees + r.devotees,
      aBig: a.aBig + r.all.big, aSmall: a.aSmall + r.all.small,
    }),
    { tBig: 0, tSmall: 0, tAmt: 0, people: 0, devotees: 0, aBig: 0, aSmall: 0 },
  );
  return (
    <section aria-labelledby="dw" className="mb-6">
      <div className="mb-3 flex items-end justify-between gap-2">
        <h2 id="dw" className="font-display text-lg font-bold text-ink-900">{title}</h2>
        <Link href="/distribution" className="tap text-sm font-semibold text-brand-700 hover:underline">More filters →</Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {showAllCard && rows.length > 1 && (
          <Link href="/distribution" className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-navy-800 via-navy-900 to-navy-950 p-4 text-white shadow-lift transition hover:-translate-y-0.5">
            <span aria-hidden className="pointer-events-none absolute -top-10 right-0 h-32 w-32 rounded-full bg-brand-500/30 blur-2xl" />
            <p className="text-sm font-semibold text-blue-100/80">All Dhams · Today</p>
            <p className="mt-1 font-display text-4xl font-extrabold tabular-nums">{num(sum.tBig + sum.tSmall)}</p>
            <p className="text-sm text-blue-100/80">books distributed · {inr(sum.tAmt)}</p>
            <div className="mt-3"><Split big={sum.tBig} small={sum.tSmall} light /></div>
            <div className="mt-3 border-t border-white/15 pt-3 text-sm">
              <span className="text-blue-100/70">Total so far </span>
              <b className="tabular-nums">{num(sum.aBig + sum.aSmall)}</b>
              <span className="text-blue-100/70"> · Big {num(sum.aBig)} · Small {num(sum.aSmall)}</span>
            </div>
            <span aria-hidden className="absolute right-4 top-4 text-xl text-white/60 transition group-hover:translate-x-0.5 group-hover:text-white">›</span>
          </Link>
        )}
        {rows.map((d) => (
          <Link
            key={d.id}
            href={`/distribution/${d.id}`}
            className="group relative rounded-2xl border border-stone-200/70 bg-white p-4 shadow-card transition duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lift"
          >
            <div className="flex items-start justify-between gap-2 pr-5">
              <p className="font-display text-base font-bold leading-snug text-ink-900">🛕 {d.name}</p>
            </div>
            <p className="text-xs text-ink-500">{d.today.people} of {d.devotees} devotees distributed today</p>
            <div className="mt-2 flex items-end gap-2">
              <p className="font-display text-4xl font-extrabold tabular-nums text-brand-700">{num(d.today.total)}</p>
              <p className="pb-1.5 text-sm text-ink-500">today · {inr(d.today.amount)}</p>
            </div>
            <div className="mt-2"><Split big={d.today.big} small={d.today.small} /></div>
            <div className="mt-3 flex items-center justify-between border-t border-stone-100 pt-3 text-sm">
              <span className="text-ink-500">Total so far</span>
              <span>
                <b className="font-display text-lg tabular-nums text-ink-900">{num(d.all.total)}</b>
                <span className="text-xs text-ink-500"> · Big {num(d.all.big)} · Small {num(d.all.small)}</span>
              </span>
            </div>
            <span aria-hidden className="absolute right-4 top-4 text-xl text-ink-400 transition group-hover:translate-x-0.5 group-hover:text-brand-600">›</span>
            <span className="sr-only">See who distributed books in {d.name}</span>
          </Link>
        ))}
      </div>
      {rows.length === 0 && <p className="rounded-2xl border border-dashed border-stone-300 p-6 text-center text-sm text-ink-500">No active Dhams yet. Add a Dham to see its distribution here.</p>}
    </section>
  );
}
