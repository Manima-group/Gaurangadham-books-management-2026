import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { AppUser } from "@/lib/session";
import { devoteeBooks } from "@/lib/devotee";
import { moneySummary } from "@/lib/stats";
import { fmtDate, inr, num, todayIST } from "@/lib/format";
import { Alert, EmptyState, ReportStatus } from "@/components/ui";
import { QueuedToday } from "@/components/queued-today";
import { BookList, BookTotals } from "@/components/mybooks";

export async function DevoteeDashboard({ user }: { user: AppUser }) {
  const today = todayIST();
  const [books, money, [todayReport], places] = await Promise.all([
    devoteeBooks(user.id),
    moneySummary({ devoteeId: user.id }),
    db.select().from(schema.dailyReport).where(and(eq(schema.dailyReport.devoteeId, user.id), eq(schema.dailyReport.reportDate, today))),
    db
      .select({ name: schema.dailyReportVenue.name, date: schema.dailyReport.reportDate })
      .from(schema.dailyReportVenue)
      .innerJoin(schema.dailyReport, eq(schema.dailyReport.id, schema.dailyReportVenue.reportId))
      .where(eq(schema.dailyReport.devoteeId, user.id))
      .orderBy(desc(schema.dailyReport.reportDate), desc(schema.dailyReportVenue.id))
      .limit(3),
  ]);
  const sent = todayReport && todayReport.status !== "draft";
  const needsFix = todayReport?.status === "changes_required" || todayReport?.status === "rejected";
  const toHand = Math.max(money.collected - money.submitted, 0);

  return (
    <div className="space-y-5">
      <p className="text-sm font-medium text-ink-500">{fmtDate(today)}</p>

      {/* 1. Today — one clear action */}
      {needsFix ? (
        <Link href={`/my/sales?date=${today}`} className="block rounded-3xl bg-amber-50 p-5 ring-1 ring-amber-200">
          <p className="font-display text-lg font-bold text-amber-900">✏️ Your Manager asked for a change</p>
          {todayReport.reviewNote && <p className="mt-1 text-amber-900">“{todayReport.reviewNote}”</p>}
          <span className="btn-warn mt-3 w-full">Fix today's sales</span>
        </Link>
      ) : sent ? (
        <Link href="/my/sales" className="flex items-center gap-4 rounded-3xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500 text-2xl text-white">✓</span>
          <span className="min-w-0 flex-1">
            <span className="block font-display font-bold text-emerald-900">Today's sales sent</span>
            <span className="block text-sm text-emerald-900">{num(todayReport!.totalSold)} books · {inr(todayReport!.salesPaise)}</span>
          </span>
          <ReportStatus status={todayReport!.status} />
        </Link>
      ) : (
        <div className="rounded-3xl bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800 p-5 text-white shadow-[0_14px_30px_-12px_rgb(217_85_18/0.8)]">
          <QueuedToday userId={user.id} date={today}>
            <p className="font-display text-xl font-bold">Add today's sales</p>
            <p className="mt-0.5 text-sm text-white/85">Where you went and how many books — takes a minute.</p>
            <Link href="/my/sales" className="mt-4 flex min-h-14 w-full items-center justify-center rounded-2xl bg-white text-lg font-bold text-brand-700 shadow">
              ➕ Add Today's Sales
            </Link>
          </QueuedToday>
        </div>
      )}

      {books.length === 0 ? (
        <EmptyState title="You haven't received any books yet.">Once your Manager gives you books, they will appear here.</EmptyState>
      ) : (
        <>
          {/* 2. My books at a glance */}
          <BookTotals books={books} />

          {/* 3. Money — informational, no pressure */}
          <Link href="/my/money" className="flex items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-card ring-1 ring-stone-200/70">
            <span>
              <span className="block text-xs font-semibold text-ink-500">Sales value</span>
              <span className="font-display text-2xl font-extrabold tabular-nums">{inr(money.collected)}</span>
            </span>
            <span className="text-right text-sm text-ink-700">
              Handed over <b>{inr(money.submitted)}</b>
              <span className="block text-xs text-ink-500">{toHand > 0 ? `${inr(toHand)} with you · hand over any time ›` : "All handed over ✓"}</span>
            </span>
          </Link>

          {/* 4. Book by book */}
          <section className="rounded-3xl bg-white p-4 shadow-card ring-1 ring-stone-200/70">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">My books</h2>
              <Link href="/my/books" className="tap text-sm font-semibold text-brand-700">See all ›</Link>
            </div>
            <BookList books={books} limit={4} />
          </section>

          {places.length > 0 && (
            <section className="rounded-3xl bg-white p-4 shadow-card ring-1 ring-stone-200/70">
              <h2 className="mb-2 font-display text-lg font-bold">Recent places</h2>
              <ul className="space-y-1.5 text-sm">
                {places.map((p, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span className="truncate">📍 {p.name}</span>
                    <span className="shrink-0 text-ink-500">{fmtDate(p.date)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      {!user.dhamId && <Alert tone="amber" title="You are not linked to a Dham yet.">Please contact your Admin.</Alert>}
    </div>
  );
}
