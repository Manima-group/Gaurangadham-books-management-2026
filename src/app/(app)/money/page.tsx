import Link from "next/link";
import { and, desc, eq, gte, lte, or, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { moneySummary } from "@/lib/stats";
import { devoteeBalances } from "@/lib/balances";
import { allDhams } from "@/lib/lookups";
import { fmtDate, fmtDateTime, inr } from "@/lib/format";
import { METHOD_LABEL, MONEY_STATUS, moneyPosition } from "@/lib/terms";
import { Badge, Card, EmptyState, HelpTip, MoneyStatus, PageHeader, StatCard } from "@/components/ui";
import { DownloadReport } from "@/components/download";
import { FilterBar } from "@/components/filters";
import { ConfirmMoney } from "./confirm";
import { DeleteButton } from "@/components/delete";
import { deleteMoney } from "@/app/actions/money";

export default async function MoneyPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await requireUser("admin", "manager");
  const sp = await searchParams;
  const dhamId = u.role === "manager" ? u.dhamId! : sp.dham ? Number(sp.dham) : null;
  const m = schema.moneySubmission;
  const c: SQL[] = [];
  if (dhamId != null) c.push(eq(m.dhamId, dhamId));
  if (sp.status === "submitted")
    // keep entries confirmed in the last 10 minutes visible, so the Manager sees the result of their action
    c.push(or(eq(m.status, "submitted"), gte(m.receivedAt, new Date(Date.now() - 10 * 60 * 1000)))!);
  else if (sp.status) c.push(eq(m.status, sp.status as "received"));
  if (sp.from) c.push(gte(m.submissionDate, sp.from));
  if (sp.to) c.push(lte(m.submissionDate, sp.to));
  const [sum, balances, rows, dhams] = await Promise.all([
    moneySummary({ dhamId }),
    devoteeBalances(dhamId),
    db.select({ m, name: schema.user.name, dham: schema.dham.name }).from(m).innerJoin(schema.user, eq(schema.user.id, m.devoteeId)).innerJoin(schema.dham, eq(schema.dham.id, m.dhamId)).where(c.length ? and(...c) : undefined).orderBy(desc(m.createdAt)).limit(150),
    u.role === "admin" ? allDhams() : Promise.resolve([]),
  ]);
  const people = await db.select({ id: schema.user.id, name: schema.user.name }).from(schema.user);
  const who = new Map(people.map((p) => [p.id, p.name]));
  const toConfirm = sum.unconfirmedSubmissions;

  return (
    <>
      <PageHeader
        title="Collected Money"
        crumbs={[{ label: "Home", href: "/dashboard" }, { label: "Collected Money" }]}
        doHere={u.role === "manager" ? "Confirm money that devotees have handed over to you, and see who still has money to submit." : "See money collected, submitted and still pending across Dhams."}
        next="When you mark money as received, the devotee is informed. If it doesn't match, send it back with a note."
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Money collected" value={inr(sum.collected)} tone="green" hint="As reported in daily reports" />
        <StatCard label="Money submitted" value={inr(sum.submitted)} tone="blue" />
        <StatCard label="Confirmed as received" value={inr(sum.receivedConfirmed)} hint={toConfirm ? `${toConfirm} waiting for confirmation` : "All confirmed"} />
        <StatCard label="Money yet to submit" value={inr(sum.pendingMoney)} tone={sum.pendingMoney ? "amber" : "green"} />
      </div>

      <div className="mb-4"><DownloadReport kind="money" params={sp} /></div>
      <div className="grid gap-4 xl:grid-cols-5">
        <Card title="Money submissions" className="xl:col-span-3">
          <div className="mb-4">
            <FilterBar
              action="/money"
              values={sp}
              dhams={u.role === "admin" ? dhams.map((d) => ({ value: d.id, label: d.name })) : undefined}
              statuses={[
                { value: "submitted", label: `To confirm${toConfirm ? ` (${toConfirm})` : ""}` },
                { value: "received", label: MONEY_STATUS.received.label },
                { value: "disputed", label: MONEY_STATUS.disputed.label },
              ]}
            />
          </div>
          {rows.length === 0 ? (
            <EmptyState icon="💰" title={sp.status === "submitted" ? "No money is waiting for confirmation." : "No money submissions found."}>
              When devotees submit collected money, it appears here for you to confirm.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-stone-100">
              {rows.map(({ m: r, name, dham }) => (
                <li key={r.id} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold">{name} <span className="text-lg tabular-nums">· {inr(r.amountPaise)}</span></p>
                      <p className="text-sm text-ink-500">{fmtDate(r.submissionDate)} · {METHOD_LABEL[r.method]}{r.reference ? ` · Ref ${r.reference}` : ""}{u.role === "admin" ? ` · ${dham}` : ""}</p>
                      {r.remarks && <p className="text-sm text-ink-700">“{r.remarks}”</p>}
                      {r.reviewNote && <p className="text-sm text-amber-800">Note: {r.reviewNote}</p>}
                    </div>
                    <MoneyStatus status={r.status} />
                  </div>
                  <div className="mt-2 flex justify-end"><DeleteButton action={deleteMoney} id={r.id} label="Delete" confirm={`Delete ${inr(r.amountPaise)} from ${name}?`} /></div>
                  {r.status === "submitted" ? (
                    <div className="mt-2"><ConfirmMoney id={r.id} /></div>
                  ) : r.receivedAt ? (
                    <p className="mt-1 text-xs text-ink-500">{r.status === "received" ? "✓ Confirmed as received" : "Sent back to the devotee"} by {who.get(r.receivedBy ?? "") ?? "—"} · {fmtDateTime(r.receivedAt)}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Money position of each devotee" subtitle={<>Collected − submitted = yet to submit<HelpTip>“Collected” comes from daily reports. “Submitted” is what the devotee has handed over (entries sent back as not matching are not counted).</HelpTip></>} className="xl:col-span-2">
          {balances.length === 0 ? (
            <p className="text-sm text-ink-500">No devotees yet.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {balances.map((b) => {
                const pos = moneyPosition(b.collected, b.submitted);
                return (
                  <li key={b.id} className="py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <Link href={`/reports?devotee=${b.id}`} className="tap font-medium hover:underline">{b.name}</Link>
                      <Badge tone={pos.tone}>{pos.label}</Badge>
                    </div>
                    <p className="text-xs text-ink-500">
                      Collected {inr(b.collected)} · Submitted {inr(b.submitted)}
                      {b.pending > 0 && <> · <span className="font-semibold text-amber-700">To submit {inr(b.pending)}</span></>}
                      {u.role === "admin" && ` · ${b.dham}`}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
