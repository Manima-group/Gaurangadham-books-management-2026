import "server-only";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { movementTotals, scopeStock, total } from "./stock";
import { addDays } from "./format";

export type ClosingFigures = Awaited<ReturnType<typeof computeClosing>>;

/** Daily closing summary for one Dham on one date. Figures are never adjusted to balance. */
export async function computeClosing(dhamId: number, date: string) {
  const [opening, closing, moves] = await Promise.all([
    scopeStock(dhamId, date),
    scopeStock(dhamId, addDays(date, 1)),
    movementTotals({ dhamId, from: date, to: date }),
  ]);
  const openingQty = total(opening);
  const closingQty = total(closing);
  const expectedClosing = openingQty + moves.received - moves.sold - moves.damaged;

  const reports = await db
    .select({
      id: schema.dailyReport.id,
      devoteeId: schema.dailyReport.devoteeId,
      name: schema.user.name,
      status: schema.dailyReport.status,
      salesPaise: schema.dailyReport.salesPaise,
      collectedPaise: schema.dailyReport.collectedPaise,
      totalSold: schema.dailyReport.totalSold,
    })
    .from(schema.dailyReport)
    .innerJoin(schema.user, eq(schema.user.id, schema.dailyReport.devoteeId))
    .where(and(eq(schema.dailyReport.dhamId, dhamId), eq(schema.dailyReport.reportDate, date), ne(schema.dailyReport.status, "draft")));

  const counted = reports.filter((r) => r.status === "submitted" || r.status === "approved");
  const salesValue = counted.reduce((a, r) => a + r.salesPaise, 0);
  const collected = counted.reduce((a, r) => a + r.collectedPaise, 0);

  const [{ submittedToday }] = (await db.execute(sql`
    select coalesce(sum(amount_paise),0)::bigint as "submittedToday" from money_submission
    where dham_id = ${dhamId} and submission_date = ${date} and status <> 'disputed'`)) as unknown as { submittedToday: number }[];

  // Cumulative money position of the Dham up to and including this date
  const [cum] = (await db.execute(sql`
    select
      (select coalesce(sum(collected_paise),0) from daily_report where dham_id = ${dhamId} and report_date <= ${date} and status in ('submitted','approved','changes_required'))::bigint as collected,
      (select coalesce(sum(amount_paise),0) from money_submission where dham_id = ${dhamId} and submission_date <= ${date} and status <> 'disputed')::bigint as submitted,
      (select count(*) from money_submission where dham_id = ${dhamId} and submission_date <= ${date} and status = 'submitted')::int as unconfirmed
  `)) as unknown as { collected: number; submitted: number; unconfirmed: number }[];
  const moneyPending = Math.max(Number(cum.collected) - Number(cum.submitted), 0);

  const devotees = await db
    .select({ id: schema.user.id, name: schema.user.name })
    .from(schema.user)
    .where(and(eq(schema.user.dhamId, dhamId), eq(schema.user.role, "devotee"), eq(schema.user.isActive, true)));
  const reported = new Set(reports.map((r) => r.devoteeId));
  const notReported = devotees.filter((d) => !reported.has(d.id));

  const differences: { text: string; severity: "warn" | "info" }[] = [];
  if (closingQty !== expectedClosing)
    differences.push({ severity: "warn", text: `Book count does not add up: expected ${expectedClosing} books at closing but records show ${closingQty}.` });
  for (const r of counted)
    if (r.collectedPaise !== r.salesPaise)
      differences.push({
        severity: "info",
        text: `${r.name}: money collected (₹${(r.collectedPaise / 100).toLocaleString("en-IN")}) is different from sales value (₹${(r.salesPaise / 100).toLocaleString("en-IN")}).`,
      });
  const waiting = reports.filter((r) => r.status === "submitted");
  if (waiting.length)
    differences.push({ severity: "warn", text: `${waiting.length} report(s) for this day are still waiting for review — their books are not yet counted as sold.` });
  const changes = reports.filter((r) => r.status === "changes_required");
  if (changes.length) differences.push({ severity: "warn", text: `${changes.length} report(s) were sent back for correction and are not yet re-submitted.` });
  if (notReported.length)
    differences.push({ severity: "info", text: `${notReported.length} devotee(s) have not submitted a report: ${notReported.map((d) => d.name).join(", ")}.` });
  if (Number(cum.unconfirmed))
    differences.push({ severity: "info", text: `${cum.unconfirmed} money submission(s) are not yet confirmed as received by the Manager.` });

  const [closed] = await db
    .select()
    .from(schema.dailyClosing)
    .where(and(eq(schema.dailyClosing.dhamId, dhamId), eq(schema.dailyClosing.closingDate, date)));

  return {
    book: {
      opening: openingQty,
      received: moves.received,
      assigned: moves.assign_devotee,
      sold: moves.sold,
      returned: moves.returned,
      damaged: moves.damaged,
      closing: closingQty,
      expectedClosing,
      pendingSold: waiting.reduce((a, r) => a + r.totalSold, 0),
    },
    money: {
      salesValue,
      collected,
      submittedToday: Number(submittedToday),
      pending: moneyPending,
    },
    differences,
    reports: reports.length,
    devotees: devotees.length,
    closed: closed ?? null,
  };
}

export async function closedDates(dhamIds: number[]) {
  if (!dhamIds.length) return [];
  return db.select().from(schema.dailyClosing).where(inArray(schema.dailyClosing.dhamId, dhamIds));
}
