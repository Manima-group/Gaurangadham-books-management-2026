import { DownloadReport } from "@/components/download";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { computeClosing } from "@/lib/closing";
import { activeDhams } from "@/lib/lookups";
import { addDays, fmtDate, fmtDateTime, inr, num, todayIST } from "@/lib/format";
import { Alert, Badge, Card, HelpTip, PageHeader } from "@/components/ui";
import { CloseDayForm } from "./form";
import { DayPicker } from "@/components/daypicker";
import { DeleteButton } from "@/components/delete";
import { reopenDay } from "@/app/actions/closing";

export default async function ClosingPage({ searchParams }: { searchParams: Promise<{ dham?: string; date?: string }> }) {
  const u = await requireUser("admin", "manager");
  const sp = await searchParams;
  const today = todayIST();
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && sp.date <= today ? sp.date : today;
  const dhams = u.role === "admin" ? await activeDhams() : [];
  const dhamId = u.role === "manager" ? u.dhamId! : Number(sp.dham) || dhams[0]?.id;
  if (!dhamId) return <Alert tone="amber" title="Add a Dham first.">Daily closing is done for each Dham.</Alert>;
  const dhamName = u.role === "manager" ? u.dhamName : dhams.find((d) => d.id === dhamId)?.name;
  const [f, history, people] = await Promise.all([
    computeClosing(dhamId, date),
    db.select().from(schema.dailyClosing).where(eq(schema.dailyClosing.dhamId, dhamId)).orderBy(desc(schema.dailyClosing.closingDate)).limit(10),
    db.select({ id: schema.user.id, name: schema.user.name }).from(schema.user),
  ]);
  const who = new Map(people.map((p) => [p.id, p.name]));
  const warn = f.differences.filter((d) => d.severity === "warn");
  const q = (d: string) => `/closing?date=${d}${u.role === "admin" ? `&dham=${dhamId}` : ""}`;

  return (
    <>
      <PageHeader
        title={`Daily Closing — ${dhamName}`}
        crumbs={[{ label: "Home", href: "/dashboard" }, { label: "Daily Closing" }]}
        doHere="At the end of the day, check that books and money add up. Any differences are shown — nothing is adjusted automatically."
        next="Close the day. If there are differences, write a short explanation; the Admin is informed."
      />
      <DayPicker
        action="/closing"
        date={date}
        today={today}
        prev={addDays(date, -1)}
        next={addDays(date, 1)}
        dhams={u.role === "admin" ? dhams.map((d) => ({ id: d.id, name: d.name })) : undefined}
        dham={u.role === "admin" ? String(dhamId) : undefined}
      />

      <div className="mb-4"><DownloadReport kind="closing" params={{ dham: String(dhamId), date }} label="Download Closing Summary" /></div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="📚 Book Summary" subtitle={`${fmtDate(date)} · Dham store + all devotees`}>
          <dl className="divide-y divide-stone-100 text-[15px]">
            <Row k="Opening books" v={num(f.book.opening)} tip="Books in the Dham (store + with devotees) at the start of the day." />
            <Row k="+ Books received" v={num(f.book.received)} tip="Books that arrived at the Dham or were sent by the Admin." />
            <Row k="Books assigned to devotees" v={num(f.book.assigned)} muted tip="Moved from the Dham store to devotees. This does not change the Dham total." />
            <Row k="− Books sold" v={num(f.book.sold)} tip="From approved reports only." />
            <Row k="Books returned to Dham" v={num(f.book.returned)} muted tip="Moved from devotees back to the store. Does not change the Dham total." />
            <Row k="− Damaged / lost books" v={num(f.book.damaged)} />
            <Row k="= Closing books" v={num(f.book.closing)} strong />
          </dl>
          {f.book.pendingSold > 0 && <p className="mt-2 text-sm text-sky-800">{num(f.book.pendingSold)} more books are in reports still being reviewed.</p>}
        </Card>
        <Card title="💰 Money Summary" subtitle={`${f.reports} report(s) from ${f.devotees} devotee(s)`}>
          <dl className="divide-y divide-stone-100 text-[15px]">
            <Row k="Total sales value" v={inr(f.money.salesValue)} tip="Value of books in reports for this day (approved and being reviewed)." />
            <Row k="Total money collected" v={inr(f.money.collected)} />
            <Row k="Money submitted on this day" v={inr(f.money.submittedToday)} />
            <Row k="Money still pending (till this day)" v={inr(f.money.pending)} strong tip="All money collected up to this day minus all money submitted up to this day." />
          </dl>
        </Card>
      </div>

      <Card title="Differences requiring review" className="mt-4">
        {f.differences.length === 0 ? (
          <p className="text-sm text-emerald-800">✅ Everything adds up. No differences found.</p>
        ) : (
          <ul className="space-y-2">
            {f.differences.map((d, i) => (
              <li key={i} className={`rounded-xl px-3 py-2 text-sm ring-1 ring-inset ${d.severity === "warn" ? "bg-amber-50 text-amber-900 ring-amber-200" : "bg-sky-50 text-sky-900 ring-sky-200"}`}>
                {d.severity === "warn" ? "⚠ " : "ℹ "}{d.text}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 border-t border-stone-100 pt-4">
          {f.closed ? (
            <div className="space-y-2">
              <Alert tone="green" title={`This day was closed by ${who.get(f.closed.closedBy) ?? "—"} on ${fmtDateTime(f.closed.createdAt)}.`}>
                {f.closed.note && <>Note: “{f.closed.note}”</>}
              </Alert>
              <DeleteButton action={reopenDay} id={f.closed.id} label="Re-open this day" confirm="Re-open this day? You can close it again." />
            </div>
          ) : (
            <CloseDayForm dhamId={dhamId} date={date} needsNote={warn.length > 0} />
          )}
        </div>
      </Card>

      <Card title="Recently closed days" className="mt-4">
        {history.length === 0 ? (
          <p className="text-sm text-ink-500">No days have been closed yet.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <Link href={q(h.closingDate)} className="tap font-semibold hover:underline">{fmtDate(h.closingDate)}</Link>
                <span className="text-ink-500">by {who.get(h.closedBy)}</span>
                {h.hasDifferences ? <Badge tone="amber">Closed with notes</Badge> : <Badge tone="green">All matched</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function Row({ k, v, strong, muted, tip }: { k: string; v: string; strong?: boolean; muted?: boolean; tip?: string }) {
  return (
    <div className={`flex justify-between py-2 ${strong ? "font-bold" : ""} ${muted ? "text-ink-500" : ""}`}>
      <dt>{k}{tip && <HelpTip>{tip}</HelpTip>}</dt>
      <dd className="tabular-nums">{v}</dd>
    </div>
  );
}
