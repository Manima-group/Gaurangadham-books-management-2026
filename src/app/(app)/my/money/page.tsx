import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { moneySummary } from "@/lib/stats";
import { fmtDate, inr, todayIST } from "@/lib/format";
import { METHOD_LABEL, moneyPosition } from "@/lib/terms";
import { Badge, Card, EmptyState, MoneyStatus, PageHeader } from "@/components/ui";
import { MoneyForm } from "./form";
import { DeleteButton } from "@/components/delete";
import { deleteMoney } from "@/app/actions/money";

export default async function MyMoney() {
  const u = await requireUser("devotee", "manager");
  const [m, rows] = await Promise.all([
    moneySummary({ devoteeId: u.id }),
    db.select().from(schema.moneySubmission).where(eq(schema.moneySubmission.devoteeId, u.id)).orderBy(desc(schema.moneySubmission.createdAt)),
  ]);
  const remaining = Math.max(m.collected - m.submitted, 0);
  const pos = moneyPosition(m.collected, m.submitted);
  return (
    <>
      <PageHeader
        title="Hand Over Money"
        crumbs={[{ label: "Home", href: "/dashboard" }, { label: "Submit Money" }]}
        doHere="Record money when you hand it over to your Manager — cash, UPI or bank. It's optional and you can do it any time, in parts."
        next="Your Manager confirms when the money is received, and you get a notification."
      />
      <div className="mb-5 grid grid-cols-3 gap-2 rounded-2xl border border-stone-200 bg-white p-4 text-center shadow-sm">
        <div><p className="text-xs text-ink-500">Money collected</p><p className="text-lg font-bold tabular-nums sm:text-2xl">{inr(m.collected)}</p></div>
        <div><p className="text-xs text-ink-500">Already submitted</p><p className="text-lg font-bold tabular-nums sm:text-2xl">{inr(m.submitted)}</p></div>
        <div className="rounded-xl bg-brand-50"><p className="text-xs text-ink-500">Remaining to submit</p><p className="text-lg font-bold tabular-nums text-brand-700 sm:text-2xl">{inr(remaining)}</p></div>
        <div className="col-span-3 mt-1"><Badge tone={pos.tone}>{pos.label}</Badge></div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="New money submission">
          {remaining > 0 ? (
            <MoneyForm today={todayIST()} remaining={remaining} userId={u.id} />
          ) : (
            <EmptyState icon="✅" title="Nothing to submit right now.">
              All the money you collected has been submitted. After you submit your next sales report, the amount will appear here.
            </EmptyState>
          )}
        </Card>
        <Card title="My submissions">
          {rows.length === 0 ? (
            <p className="py-4 text-sm text-ink-500">You haven't submitted any money yet.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {rows.map((r) => (
                <li key={r.id} className="py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-lg font-bold tabular-nums">{inr(r.amountPaise)}</span>
                    <MoneyStatus status={r.status} />
                  </div>
                  <p className="text-sm text-ink-500">{fmtDate(r.submissionDate)} · {METHOD_LABEL[r.method]}{r.reference ? ` · ${r.reference}` : ""}</p>
                  {r.reviewNote && <p className="mt-1 text-sm text-amber-800">Manager's note: {r.reviewNote}</p>}
                  {r.status !== "received" && <div className="mt-2"><DeleteButton action={deleteMoney} id={r.id} label="Delete" confirm={`Delete this ${inr(r.amountPaise)} entry?`} /></div>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
