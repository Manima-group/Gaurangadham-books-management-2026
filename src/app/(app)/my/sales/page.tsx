import Link from "next/link";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { devoteeBooks } from "@/lib/devotee";
import { addDays, fmtDate, inr, num, todayIST } from "@/lib/format";
import { REPORT_STATUS } from "@/lib/terms";
import { Alert, Card, EmptyState, PageHeader, ReportStatus } from "@/components/ui";
import { DeleteButton } from "@/components/delete";
import { deleteReport } from "@/app/actions/reports";
import { SalesForm, type VenueInit } from "./form";
import { VenueBreakdown } from "@/components/venues";

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const u = await requireUser("devotee", "manager");
  const sp = await searchParams;
  const today = todayIST();
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && sp.date <= today && sp.date >= addDays(today, -7) ? sp.date : today;
  const isToday = date === today;

  const [[report], books, past] = await Promise.all([
    db.select().from(schema.dailyReport).where(and(eq(schema.dailyReport.devoteeId, u.id), eq(schema.dailyReport.reportDate, date))),
    devoteeBooks(u.id),
    // Places this person used before, most recent first — offered as suggestions
    db
      .select({ name: schema.dailyReportVenue.name, last: sql<string>`max(${schema.dailyReport.reportDate})` })
      .from(schema.dailyReportVenue)
      .innerJoin(schema.dailyReport, eq(schema.dailyReport.id, schema.dailyReportVenue.reportId))
      .where(eq(schema.dailyReport.devoteeId, u.id))
      .groupBy(schema.dailyReportVenue.name)
      .orderBy(desc(sql`max(${schema.dailyReport.reportDate})`))
      .limit(20),
  ]);
  const [lines, venues] = report
    ? await Promise.all([
        db.select().from(schema.dailyReportLine).where(eq(schema.dailyReportLine.reportId, report.id)),
        db.select().from(schema.dailyReportVenue).where(eq(schema.dailyReportVenue.reportId, report.id)).orderBy(asc(schema.dailyReportVenue.sort)),
      ])
    : [[], []];
  const locked = report && (report.status === "submitted" || report.status === "approved");
  const titles = lines.length
    ? new Map((await db.select().from(schema.book).where(inArray(schema.book.id, [...new Set(lines.map((l) => l.bookId))]))).map((b) => [b.id, `${b.title} (${b.language})`]))
    : new Map<number, string>();

  const header = (
    <PageHeader
      title={isToday ? "Today's Sales" : `Sales · ${fmtDate(date)}`}
      crumbs={[{ label: "Home", href: "/dashboard" }, { label: "Sales" }]}
      doHere="Add each place you went to, and how many of each book you gave there. Add as many places as you like."
      next={u.role === "manager" ? "Your own sales are saved and your stock updates at once." : "Your Dham Manager checks it. Money can be handed over any time."}
    />
  );
  const otherDay = (
    <form className="flex flex-wrap items-end gap-2 text-sm" action="/my/sales">
      <label className="flex flex-col gap-1">
        <span className="text-ink-500">Add for another day (last 7 days)</span>
        <input type="date" name="date" defaultValue={date} min={addDays(today, -7)} max={today} className="field-input py-2" />
      </label>
      <button className="btn-secondary btn-sm">Open</button>
    </form>
  );

  if (locked) {
    return (
      <>
        {header}
        <Alert tone={report.status === "approved" ? "green" : "blue"} title={report.status === "approved" ? `Sales for ${fmtDate(date)} are approved ✅` : `Sales for ${fmtDate(date)} are sent 🙏`}>
          {REPORT_STATUS[report.status].help}
        </Alert>
        <Card className="mt-4" title={`${num(report.totalSold)} books · ${inr(report.salesPaise)}`} subtitle={`${venues.length || 1} place${venues.length === 1 ? "" : "s"}`} actions={<ReportStatus status={report.status} />}>
          <VenueBreakdown venues={venues} lines={lines} titles={titles} />
          {report.collectedPaise !== report.salesPaise && <p className="mt-2 text-sm text-ink-500">Money collected: {inr(report.collectedPaise)}</p>}
          {report.remarks && <p className="mt-2 rounded-xl bg-stone-50 px-3 py-2 text-sm">“{report.remarks}”</p>}
        </Card>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Link href="/my/books" className="btn-primary">📚 See my books</Link>
          <Link href="/my/money" className="btn-secondary">💰 Hand over money</Link>
          {(report.status === "submitted" || u.role === "manager") && (
            <DeleteButton action={deleteReport} id={report.id} label="Delete this report" confirm={report.status === "approved" ? "Delete? Stock goes back to you." : "Delete this report? You can add it again."} />
          )}
        </div>
        <div className="mt-6">{otherDay}</div>
      </>
    );
  }

  const inReport = new Set(lines.map((l) => l.bookId));
  const usable = books
    .filter((b) => b.available > 0 || inReport.has(b.id))
    .map((b) => ({ id: b.id, title: b.title, language: b.language, coverUrl: b.coverUrl, pricePaise: b.pricePaise, available: Math.max(b.available, 0), size: b.size }));

  // Rebuild places for a saved draft / report sent back for changes
  const initVenues: VenueInit[] = venues.map((v) => ({
    name: v.name,
    area: v.area ?? "",
    slot: (v.timeSlot ?? "") as VenueInit["slot"],
    sold: Object.fromEntries(lines.filter((l) => l.venueId === v.id && l.soldQty).map((l) => [l.bookId, l.soldQty])),
  }));
  const oldStyle = lines.filter((l) => !l.venueId && l.soldQty);
  if (oldStyle.length) initVenues.push({ name: "", area: "", slot: "", sold: Object.fromEntries(oldStyle.map((l) => [l.bookId, l.soldQty])) });
  const initDay = Object.fromEntries(lines.filter((l) => l.returnedQty || l.damagedQty).map((l) => [l.bookId, { returned: l.returnedQty, damaged: l.damagedQty }]));

  return (
    <>
      {header}
      {report?.status === "changes_required" || report?.status === "rejected" ? (
        <div className="mb-4">
          <Alert tone="amber" title={report.status === "rejected" ? "Your Manager rejected this report" : "Your Manager asked for changes"}>
            {report.reviewNote ? <>“{report.reviewNote}”. </> : null}Please fix and send again.
          </Alert>
        </div>
      ) : report?.status === "draft" ? (
        <div className="mb-4">
          <Alert tone="gray" title="Saved earlier, not sent yet.">Check and press Send.</Alert>
        </div>
      ) : null}
      {usable.length === 0 ? (
        <EmptyState title="You have no books to sell right now.">
          {books.length === 0 ? "Once your Manager gives you books, they will appear here." : "All your books are sold or waiting for review. Ask your Manager for more books."}
        </EmptyState>
      ) : (
        <SalesForm
          key={date}
          books={usable}
          date={date}
          initVenues={initVenues}
          initDay={initDay}
          initCollected={report && report.collectedPaise !== report.salesPaise ? report.collectedPaise : undefined}
          initRemarks={report?.remarks ?? undefined}
          userId={u.id}
          pastVenues={past.map((p) => p.name)}
        />
      )}
      {report && report.status !== "approved" && (
        <div className="mt-4 flex justify-center">
          <DeleteButton action={deleteReport} id={report.id} label="Delete this day's report" confirm="Delete this report?" />
        </div>
      )}
      <div className="mt-8 border-t border-stone-200 pt-4">{otherDay}</div>
    </>
  );
}
