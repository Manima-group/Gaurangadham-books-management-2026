import "server-only";
import { and, asc, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import type { AppUser } from "@/lib/session";
import { REPORT_STATUS, MONEY_STATUS, METHOD_LABEL, moneyPosition } from "@/lib/terms";
import { bookWise, devoteeWise, dhamWise, PERIOD_LABEL, type Period } from "@/lib/distribution";
import { computeClosing } from "@/lib/closing";
import { devoteeBalances } from "@/lib/balances";
import { H, holderStock, scopeStock, devoteeStocksForDham } from "@/lib/stock";
import { todayIST } from "@/lib/format";
import type { ReportSpec } from "./render";

type P = Record<string, string | undefined>;
const dateLabel = (d?: string) => (d ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(d + "T00:00:00+05:30")) : "");

async function dhamName(id: number | null | undefined) {
  if (!id) return "All Dhams";
  const [d] = await db.select().from(schema.dham).where(eq(schema.dham.id, id));
  return d?.name ?? "—";
}
/** Managers only ever export their own Dham. */
const scopeDham = (u: AppUser, p: P) => (u.role === "manager" ? u.dhamId! : p.dham ? Number(p.dham) : null);

/* ---------------- Daily reports ---------------- */
export async function reportsExport(u: AppUser, p: P): Promise<ReportSpec> {
  const dhamId = scopeDham(u, p);
  const c: SQL[] = [sql`r.status <> 'draft'`];
  if (dhamId) c.push(sql`r.dham_id = ${dhamId}`);
  if (p.drive) c.push(sql`r.campaign_id = ${Number(p.drive)}`);
  if (p.devotee) c.push(sql`r.devotee_id = ${p.devotee}`);
  if (p.status) c.push(sql`r.status = ${p.status}`);
  if (p.from) c.push(sql`r.report_date >= ${p.from}`);
  if (p.to) c.push(sql`r.report_date <= ${p.to}`);
  const rows = (await db.execute(sql`
    select to_char(r.report_date,'YYYY-MM-DD') as date, u.name as devotee, d.name as dham, r.status,
      r.total_sold as sold,
      coalesce((select sum(l.sold_qty) from daily_report_line l join book b on b.id = l.book_id where l.report_id = r.id and b.size = 'big'),0)::int as big,
      coalesce((select sum(l.sold_qty) from daily_report_line l join book b on b.id = l.book_id where l.report_id = r.id and b.size = 'small'),0)::int as small,
      r.sales_paise as sales, r.collected_paise as collected, (r.collected_paise - r.sales_paise) as diff,
      coalesce((select string_agg(v.name, ', ' order by v.sort) from daily_report_venue v where v.report_id = r.id), '') as places,
      coalesce(r.review_note, r.remarks, '') as note
    from daily_report r join "user" u on u.id = r.devotee_id join dham d on d.id = r.dham_id
    where ${sql.join(c, sql` and `)} order by r.report_date desc, u.name`)) as unknown as Record<string, unknown>[];
  for (const r of rows) r.status = REPORT_STATUS[String(r.status)]?.label ?? r.status;
  const meta: [string, string][] = [["Dham", await dhamName(dhamId)]];
  if (p.from || p.to) meta.push(["Dates", `${dateLabel(p.from) || "start"} – ${dateLabel(p.to) || "today"}`]);
  if (p.status) meta.push(["Status", REPORT_STATUS[p.status]?.label ?? p.status]);
  return {
    title: "Daily Sales Reports",
    filename: `daily-reports-${todayIST()}`,
    meta,
    sections: [
      {
        name: "Reports",
        columns: [
          { header: "Date", key: "date", kind: "date" },
          { header: "Devotee", key: "devotee" },
          ...(u.role === "admin" && !dhamId ? [{ header: "Dham", key: "dham" }] : []),
          { header: "Places", key: "places", width: 30 },
          { header: "Books sold", key: "sold", kind: "int" as const },
          { header: "Big", key: "big", kind: "int" as const },
          { header: "Small", key: "small", kind: "int" as const },
          { header: "Sales", key: "sales", kind: "money" as const },
          { header: "Collected", key: "collected", kind: "money" as const },
          { header: "Difference", key: "diff", kind: "money" as const },
          { header: "Status", key: "status" },
          { header: "Note", key: "note", width: 36 },
        ],
        rows,
        totals: ["sold", "big", "small", "sales", "collected", "diff"],
      },
    ],
  };
}

/* ---------------- Dham-wise distribution ---------------- */
export async function distributionExport(u: AppUser, p: P): Promise<ReportSpec> {
  const period = (["today", "week", "month", "all"].includes(p.period ?? "") ? p.period : "today") as Period;
  const size = p.size === "big" || p.size === "small" ? p.size : undefined;
  const dhamId = scopeDham(u, p);
  const sizeLabel = size === "big" ? "Big books" : size === "small" ? "Small books" : "All books";
  const meta: [string, string][] = [["Dham", await dhamName(dhamId)], ["Period", PERIOD_LABEL[period]], ["Books", sizeLabel]];
  const sections: ReportSpec["sections"] = [];
  const dhams = (await dhamWise(period)).filter((d) => !dhamId || d.id === dhamId);
  if (!dhamId)
    sections.push({
      name: "By Dham",
      columns: [
        { header: "Dham", key: "name" },
        { header: "Big", key: "big", kind: "int" },
        { header: "Small", key: "small", kind: "int" },
        { header: "Total books", key: "total", kind: "int" },
        { header: "Value", key: "amount", kind: "money" },
        { header: "Devotees out", key: "people", kind: "int" },
      ],
      rows: dhams.map((d) => ({ name: d.name, ...d.period })),
      totals: ["big", "small", "total", "amount", "people"],
    });
  const people: Record<string, unknown>[] = [];
  for (const d of dhams) for (const x of await devoteeWise(d.id, period, size)) if (x.total > 0) people.push({ dham: d.name, ...x });
  people.sort((a, b) => Number(b.total) - Number(a.total));
  sections.push({
    name: "By devotee",
    note: "Ranked by books distributed. Counts come from daily reports that are approved or being reviewed.",
    columns: [
      { header: "Devotee", key: "name" },
      ...(!dhamId ? [{ header: "Dham", key: "dham" }] : []),
      { header: "Big", key: "big", kind: "int" as const },
      { header: "Small", key: "small", kind: "int" as const },
      { header: "Total books", key: "total", kind: "int" as const },
      { header: "Value", key: "amount", kind: "money" as const },
      { header: "Days out", key: "days", kind: "int" as const },
    ],
    rows: people,
    totals: ["big", "small", "total", "amount"],
  });
  const books = await bookWise(dhamId, period, size);
  sections.push({
    name: "By book",
    columns: [
      { header: "Book", key: "title" },
      { header: "Language", key: "language" },
      { header: "Size", key: "sizeLabel" },
      { header: "Copies", key: "qty", kind: "int" },
      { header: "Value", key: "amt", kind: "money" },
    ],
    rows: books.map((b) => ({ ...b, sizeLabel: b.size === "big" ? "Big" : "Small" })),
    totals: ["qty", "amt"],
  });
  return { title: "Book Distribution Report", filename: `distribution-${period}-${todayIST()}`, meta, sections };
}

/* ---------------- Daily closing ---------------- */
export async function closingExport(u: AppUser, p: P): Promise<ReportSpec> {
  const dhamId = u.role === "manager" ? u.dhamId! : Number(p.dham) || (await db.select().from(schema.dham).orderBy(asc(schema.dham.name)))[0]?.id;
  const date = p.date && /^\d{4}-\d{2}-\d{2}$/.test(p.date) ? p.date : todayIST();
  const f = await computeClosing(dhamId, date);
  const kv = (label: string, value: number, kind: "int" | "money") => ({ label, value, kind });
  const book = [
    kv("Opening books", f.book.opening, "int"),
    kv("+ Books received", f.book.received, "int"),
    kv("Books assigned to devotees", f.book.assigned, "int"),
    kv("− Books sold", f.book.sold, "int"),
    kv("Books returned to Dham", f.book.returned, "int"),
    kv("− Damaged / lost", f.book.damaged, "int"),
    kv("= Closing books", f.book.closing, "int"),
  ];
  const money = [
    kv("Total sales value", f.money.salesValue, "money"),
    kv("Total money collected", f.money.collected, "money"),
    kv("Money submitted on this day", f.money.submittedToday, "money"),
    kv("Money still pending (till this day)", f.money.pending, "money"),
  ];
  return {
    title: "Daily Closing Summary",
    filename: `daily-closing-${date}`,
    meta: [["Dham", await dhamName(dhamId)], ["Date", dateLabel(date)], ["Status", f.closed ? `Closed${f.closed.note ? ` — “${f.closed.note}”` : ""}` : "Not yet closed"]],
    sections: [
      { name: "Book summary", columns: [{ header: "Item", key: "label" }, { header: "Books", key: "value", kind: "int" }], rows: book },
      { name: "Money summary", columns: [{ header: "Item", key: "label" }, { header: "Amount", key: "value", kind: "money" }], rows: money },
      {
        name: "Differences requiring review",
        note: "Figures are never adjusted automatically.",
        columns: [{ header: "Type", key: "severity" }, { header: "Detail", key: "text", width: 90 }],
        rows: f.differences.map((d) => ({ severity: d.severity === "warn" ? "Needs review" : "For information", text: d.text })),
      },
    ],
  };
}

/* ---------------- Collected money ---------------- */
export async function moneyExport(u: AppUser, p: P): Promise<ReportSpec> {
  const dhamId = scopeDham(u, p);
  const m = schema.moneySubmission;
  const c: SQL[] = [];
  if (dhamId) c.push(eq(m.dhamId, dhamId));
  if (p.status) c.push(eq(m.status, p.status as "submitted"));
  if (p.from) c.push(gte(m.submissionDate, p.from));
  if (p.to) c.push(lte(m.submissionDate, p.to));
  const subs = await db
    .select({ m, name: schema.user.name, dham: schema.dham.name })
    .from(m)
    .innerJoin(schema.user, eq(schema.user.id, m.devoteeId))
    .innerJoin(schema.dham, eq(schema.dham.id, m.dhamId))
    .where(c.length ? and(...c) : undefined)
    .orderBy(desc(m.submissionDate));
  const bal = await devoteeBalances(dhamId);
  return {
    title: "Collected Money Report",
    filename: `collected-money-${todayIST()}`,
    meta: [["Dham", await dhamName(dhamId)], ...(p.status ? [["Status", MONEY_STATUS[p.status]?.label ?? p.status] as [string, string]] : [])],
    sections: [
      {
        name: "Money position by devotee",
        columns: [
          { header: "Devotee", key: "name" },
          ...(!dhamId ? [{ header: "Dham", key: "dham" }] : []),
          { header: "Collected", key: "collected", kind: "money" as const },
          { header: "Submitted", key: "submitted", kind: "money" as const },
          { header: "Confirmed received", key: "received", kind: "money" as const },
          { header: "Yet to submit", key: "pending", kind: "money" as const },
          { header: "Position", key: "position" },
        ],
        rows: bal.map((b) => ({ ...b, position: moneyPosition(b.collected, b.submitted).label })),
        totals: ["collected", "submitted", "received", "pending"],
      },
      {
        name: "Money submissions",
        columns: [
          { header: "Date", key: "date", kind: "date" },
          { header: "Devotee", key: "name" },
          ...(!dhamId ? [{ header: "Dham", key: "dham" }] : []),
          { header: "Amount", key: "amount", kind: "money" as const },
          { header: "Method", key: "method" },
          { header: "Reference", key: "reference" },
          { header: "Status", key: "status" },
          { header: "Note", key: "note", width: 30 },
        ],
        rows: subs.map(({ m: r, name, dham }) => ({
          date: r.submissionDate,
          name,
          dham,
          amount: r.amountPaise,
          method: METHOD_LABEL[r.method],
          reference: r.reference ?? "",
          status: MONEY_STATUS[r.status]?.label ?? r.status,
          note: r.reviewNote ?? r.remarks ?? "",
        })),
        totals: ["amount"],
      },
    ],
  };
}

/* ---------------- Book stock ---------------- */
export async function stockExport(u: AppUser): Promise<ReportSpec> {
  const books = await db.select().from(schema.book).orderBy(asc(schema.book.title), asc(schema.book.language));
  if (u.role === "admin") {
    const dhams = await db.select().from(schema.dham).orderBy(asc(schema.dham.name));
    const [central, org, ...per] = await Promise.all([holderStock(H.central), scopeStock(null), ...dhams.map((d) => scopeStock(d.id))]);
    const rows = books
      .filter((b) => (org.get(b.id) ?? 0) !== 0)
      .map((b) => {
        const r: Record<string, unknown> = { title: b.title, language: b.language, size: b.size === "big" ? "Big" : "Small", central: central.get(b.id) ?? 0, total: org.get(b.id) ?? 0, value: (org.get(b.id) ?? 0) * b.pricePaise };
        dhams.forEach((d, i) => (r[`d${d.id}`] = per[i].get(b.id) ?? 0));
        return r;
      });
    return {
      title: "Book Stock Report",
      filename: `book-stock-${todayIST()}`,
      meta: [["Scope", "All Dhams"], ["As of", dateLabel(todayIST())]],
      sections: [
        {
          name: "Stock by location",
          note: "Each Dham column = books in the Dham store + books with its devotees (not yet sold).",
          columns: [
            { header: "Book", key: "title" },
            { header: "Language", key: "language" },
            { header: "Size", key: "size" },
            { header: "Central Store", key: "central", kind: "int" },
            ...dhams.map((d) => ({ header: d.name, key: `d${d.id}`, kind: "int" as const })),
            { header: "Total", key: "total", kind: "int" },
            { header: "Value", key: "value", kind: "money" },
          ],
          rows,
          totals: ["central", ...dhams.map((d) => `d${d.id}`), "total", "value"],
        },
      ],
    };
  }
  const dhamId = u.dhamId!;
  const [store, scope, devs, people] = await Promise.all([
    holderStock(H.dham(dhamId)),
    scopeStock(dhamId),
    devoteeStocksForDham(dhamId),
    db.select().from(schema.user).where(eq(schema.user.dhamId, dhamId)),
  ]);
  const name = new Map(books.map((b) => [b.id, `${b.title} (${b.language})`]));
  const holding: Record<string, unknown>[] = [];
  for (const pp of people) for (const [bid, q] of devs.get(pp.id) ?? []) if (q) holding.push({ devotee: pp.name, book: name.get(bid), qty: q });
  return {
    title: "Book Stock Report",
    filename: `book-stock-${todayIST()}`,
    meta: [["Dham", u.dhamName ?? ""], ["As of", dateLabel(todayIST())]],
    sections: [
      {
        name: "Books in my Dham",
        columns: [
          { header: "Book", key: "title" },
          { header: "Language", key: "language" },
          { header: "Size", key: "size" },
          { header: "In store", key: "store", kind: "int" },
          { header: "With devotees", key: "withDev", kind: "int" },
          { header: "Total", key: "total", kind: "int" },
          { header: "Value", key: "value", kind: "money" },
        ],
        rows: books
          .filter((b) => (scope.get(b.id) ?? 0) !== 0)
          .map((b) => {
            const s = store.get(b.id) ?? 0, t = scope.get(b.id) ?? 0;
            return { title: b.title, language: b.language, size: b.size === "big" ? "Big" : "Small", store: s, withDev: t - s, total: t, value: t * b.pricePaise };
          }),
        totals: ["store", "withDev", "total", "value"],
      },
      { name: "Books with each devotee", columns: [{ header: "Devotee", key: "devotee" }, { header: "Book", key: "book" }, { header: "Copies", key: "qty", kind: "int" }], rows: holding, totals: ["qty"] },
    ],
  };
}
