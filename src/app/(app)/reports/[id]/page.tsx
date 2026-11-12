import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { moneySummary } from "@/lib/stats";
import { fmtDate, fmtDateTime, inr, num } from "@/lib/format";
import { REPORT_STATUS } from "@/lib/terms";
import { Alert, BookCover, Card, PageHeader, ReportStatus } from "@/components/ui";
import { ReviewForm } from "./review";
import { VenueBreakdown } from "@/components/venues";
import { DeleteButton } from "@/components/delete";
import { deleteReport } from "@/app/actions/reports";

export default async function ReportDetail({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser("admin", "manager");
  const id = Number((await params).id);
  const [row] = await db
    .select({ r: schema.dailyReport, name: schema.user.name, phone: schema.user.phone, dham: schema.dham.name })
    .from(schema.dailyReport)
    .innerJoin(schema.user, eq(schema.user.id, schema.dailyReport.devoteeId))
    .innerJoin(schema.dham, eq(schema.dham.id, schema.dailyReport.dhamId))
    .where(eq(schema.dailyReport.id, id));
  if (!row) redirect("/reports");
  if (u.role === "manager" && row.r.dhamId !== u.dhamId) notFound();
  const { r } = row;
  const [rawLines, money, reviewer, venues] = await Promise.all([
    db.select({ l: schema.dailyReportLine, b: schema.book }).from(schema.dailyReportLine).innerJoin(schema.book, eq(schema.book.id, schema.dailyReportLine.bookId)).where(eq(schema.dailyReportLine.reportId, id)),
    moneySummary({ devoteeId: r.devoteeId }),
    r.reviewedBy ? db.select({ name: schema.user.name }).from(schema.user).where(eq(schema.user.id, r.reviewedBy)) : Promise.resolve([]),
    db.select().from(schema.dailyReportVenue).where(eq(schema.dailyReportVenue.reportId, id)).orderBy(asc(schema.dailyReportVenue.sort)),
  ]);
  // One row per book: add up that book's lines across all places.
  const agg = new Map<number, { l: typeof rawLines[number]["l"]; b: typeof rawLines[number]["b"] }>();
  for (const { l, b } of rawLines) {
    const cur = agg.get(b.id);
    if (!cur) agg.set(b.id, { l: { ...l }, b });
    else {
      cur.l.soldQty += l.soldQty;
      cur.l.returnedQty += l.returnedQty;
      cur.l.damagedQty += l.damagedQty;
      cur.l.amountPaise += l.amountPaise;
      cur.l.openingQty = Math.max(cur.l.openingQty, l.openingQty);
    }
  }
  const lines = [...agg.values()];
  const titles = new Map(rawLines.map(({ b }) => [b.id, `${b.title} (${b.language})`]));
  const active = lines.filter(({ l }) => l.soldQty + l.returnedQty + l.damagedQty > 0);
  const returned = lines.reduce((a, { l }) => a + l.returnedQty, 0);
  const damaged = lines.reduce((a, { l }) => a + l.damagedQty, 0);
  const remaining = lines.reduce((a, { l }) => a + l.openingQty - l.soldQty - l.returnedQty - l.damagedQty, 0);
  const diffs: string[] = [];
  if (r.collectedPaise !== r.salesPaise)
    diffs.push(`Money collected (${inr(r.collectedPaise)}) is ${r.collectedPaise > r.salesPaise ? "more" : "less"} than the sales amount (${inr(r.salesPaise)}) by ${inr(Math.abs(r.collectedPaise - r.salesPaise))}.`);
  if (damaged) diffs.push(`${damaged} book(s) reported as damaged or lost.`);
  for (const { l, b } of lines) if (l.pricePaise !== b.pricePaise) diffs.push(`${b.title}: sold at ${inr(l.pricePaise)}, current price is ${inr(b.pricePaise)}.`);
  const pending = Math.max(money.collected - money.submitted, 0);

  return (
    <>
      <PageHeader
        title={`Daily Report — ${row.name}`}
        crumbs={[{ label: "Home", href: "/dashboard" }, { label: "Daily Reports", href: "/reports" }, { label: fmtDate(r.reportDate) }]}
        doHere={r.status === "submitted" ? "Check the books sold and the money collected. Then approve, or ask for a correction." : "This report has already been reviewed."}
        next={r.status === "submitted" ? "When you approve, books are marked as sold and stock is updated. The devotee gets a notification." : REPORT_STATUS[r.status].help}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <Card title="Summary" actions={<ReportStatus status={r.status} />}>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
              <Item k="Devotee" v={row.name} />
              <Item k="Report date" v={fmtDate(r.reportDate)} />
              <Item k="Books sold" v={num(r.totalSold)} />
              <Item k="Remaining books" v={num(remaining)} />
              <Item k="Sales amount" v={inr(r.salesPaise)} />
              <Item k="Money collected" v={inr(r.collectedPaise)} warn={r.collectedPaise !== r.salesPaise} />
              <Item k="Money submitted (all time)" v={inr(money.submitted)} />
              <Item k="Money yet to submit" v={inr(pending)} warn={pending > 0} />
            </dl>
            {(returned > 0 || damaged > 0) && <p className="mt-3 text-sm text-ink-700">Also reported: {returned} returned to Dham · {damaged} damaged/lost</p>}
            {r.remarks && <p className="mt-3 rounded-xl bg-stone-50 px-3 py-2 text-sm">Devotee's note: “{r.remarks}”</p>}
            <p className="mt-3 text-xs text-ink-500">Sent {fmtDateTime(r.submittedAt)} · {row.dham}{row.phone ? <> · <a href={`tel:${row.phone}`} className="tap underline">📞 {row.phone}</a></> : null}</p>
          </Card>
          {diffs.length > 0 && (
            <Alert tone="amber" title="Differences requiring attention">
              <ul className="list-inside list-disc">{diffs.map((d) => <li key={d}>{d}</li>)}</ul>
            </Alert>
          )}
          <Card title={`Places (${venues.length || 1})`} subtitle="Where the books were distributed">
            <VenueBreakdown venues={venues} lines={rawLines.map(({ l }) => l)} titles={titles} />
          </Card>
          <Card title="Books in this report">
            <ul className="divide-y divide-stone-100 md:hidden">
              {(active.length ? active : lines).map(({ l, b }) => (
                <li key={l.id} className="py-3">
                  <div className="flex items-start gap-3">
                    <BookCover title={b.title} url={b.coverUrl} size={28} />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium leading-snug">{b.title} <span className="text-ink-500">({b.language})</span></p>
                      <p className="text-xs text-ink-500">
                        Had {l.openingQty} · <b className="text-ink-900">Sold {l.soldQty}</b>
                        {l.returnedQty + l.damagedQty ? ` · Returned/damaged ${l.returnedQty + l.damagedQty}` : ""} · Left {l.openingQty - l.soldQty - l.returnedQty - l.damagedQty}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold tabular-nums">{inr(l.amountPaise)}</p>
                      <p className="text-[11px] text-ink-500">@ {inr(l.pricePaise)}</p>
                    </div>
                  </div>
                </li>
              ))}
              <li className="flex justify-between pt-3 font-bold"><span>Total</span><span>{inr(r.salesPaise)}</span></li>
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="data-table">
                <thead><tr><th>Book</th><th className="text-right">Had</th><th className="text-right">Sold</th><th className="text-right">Returned / damaged</th><th className="text-right">Remaining</th><th className="text-right">Price</th><th className="text-right">Amount</th></tr></thead>
                <tbody>
                  {(active.length ? active : lines).map(({ l, b }) => (
                    <tr key={l.id}>
                      <td><div className="flex items-center gap-2"><BookCover title={b.title} url={b.coverUrl} size={22} />{b.title} <span className="text-ink-500">({b.language})</span></div></td>
                      <td className="text-right tabular-nums">{l.openingQty}</td>
                      <td className="text-right font-bold tabular-nums">{l.soldQty}</td>
                      <td className="text-right tabular-nums">{l.returnedQty + l.damagedQty || "—"}</td>
                      <td className="text-right tabular-nums">{l.openingQty - l.soldQty - l.returnedQty - l.damagedQty}</td>
                      <td className="text-right tabular-nums">{inr(l.pricePaise)}</td>
                      <td className="text-right font-semibold tabular-nums">{inr(l.amountPaise)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><td colSpan={6} className="text-right font-semibold">Total</td><td className="text-right font-bold">{inr(r.salesPaise)}</td></tr></tfoot>
              </table>
            </div>
          </Card>
        </div>
        <div className="min-w-0 space-y-4">
          <Card title={r.status === "submitted" ? "Your decision" : "Review"}>
            {r.status === "submitted" ? (
              <ReviewForm id={r.id} hasDifference={diffs.length > 0} />
            ) : (
              <div className="space-y-2 text-sm">
                <ReportStatus status={r.status} />
                <p className="font-medium">
                  {r.status === "approved"
                    ? "This report is approved. The books are marked as sold, stock is updated and the devotee has been informed."
                    : r.status === "changes_required"
                      ? "Sent back to the devotee for correction. It will come back to you when they submit again."
                      : "This report was rejected. The devotee has been informed with the reason."}
                </p>
                <p>Reviewed by {reviewer[0]?.name ?? "—"} on {fmtDateTime(r.reviewedAt)}</p>
                {r.reviewNote && <p className="rounded-xl bg-stone-50 px-3 py-2">“{r.reviewNote}”</p>}
              </div>
            )}
          </Card>
          <Link href="/reports?status=submitted" className="btn-secondary w-full">← Back to reports waiting for review</Link>
          <DeleteButton action={deleteReport} id={r.id} after="/reports" extra={{ after: "/reports" }} label="Delete report" confirm={r.status === "approved" ? "Delete? Its sold books go back to the devotee." : "Delete this report?"} />
        </div>
      </div>
    </>
  );
}

function Item({ k, v, warn }: { k: string; v: string; warn?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-ink-500">{k}</dt>
      <dd className={`font-bold tabular-nums ${warn ? "text-amber-700" : ""}`}>{v}</dd>
    </div>
  );
}
