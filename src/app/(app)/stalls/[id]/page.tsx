import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireApproved } from "@/lib/session";
import { participants, participatingDhams, ref, stallAccess, stallMoney, stallStock } from "@/lib/stalls";
import { availableFor } from "@/lib/transfers";
import { H, pendingReportedQty } from "@/lib/stock";
import { SOURCE_LABEL, type Source } from "@/lib/lots";
import { PAY_MODE_LABEL, STALL_STATUS } from "@/lib/terms";
import { fmtDate, fmtDateTime, inr, num } from "@/lib/format";
import { Alert, Badge, Card, EmptyState, PageHeader, StatCard } from "@/components/ui";
import {
  AllocationEditForm, CancelForm, ConfirmAllocationForm, ContributeForm, CountForm, InviteForm, QuickSellForm, RespondForm, SmallAction, UndoSaleForm,
} from "../forms";

type R = Record<string, unknown>;
const rows = async <T = R>(q: ReturnType<typeof sql>) => (await db.execute(q)) as unknown as T[];

export default async function StallPage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireApproved("devotee", "manager", "admin");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [s] = await db.select().from(schema.bookStall).where(eq(schema.bookStall.id, id));
  if (!s) notFound();
  const acc = await stallAccess(u, s);
  if (!acc.view) notFound();
  const st = STALL_STATUS[s.status];
  const selling = s.status === "draft" || s.status === "active";
  const closingPhase = s.status === "closing" || s.status === "disputed";

  const [people, stock, contribs, sales, counts, alloc, xfers, confs, approvals, dhams, money, events] = await Promise.all([
    participants(id),
    stallStock(id),
    rows<{ id: number; user_id: string; name: string; title: string; qty: number; status: string; proposed_by: string }>(sql`
      select c.id, c.user_id, u.name, b.title, c.qty, c.status, c.proposed_by from stall_contribution c join "user" u on u.id = c.user_id join book b on b.id = c.book_id
      where c.stall_id = ${id} and c.status <> 'withdrawn' order by u.name, b.title`),
    rows<{ id: number; operator: string; operator_id: string; recipient: string; mode: string; total_paise: number; cash_paise: number; upi_paise: number; reversal_of: number | null; reversed_by: number | null; created_at: string; items: string }>(sql`
      select ss.id, op.name as operator, ss.operator_id, rc.name as recipient, ss.mode, ss.total_paise, ss.cash_paise, ss.upi_paise, ss.reversal_of, ss.reversed_by, ss.created_at,
        (select string_agg(abs(l.qty) || ' × ' || b.title, ', ' order by b.title) from stall_sale_line l join book b on b.id = l.book_id where l.sale_id = ss.id) as items
      from stall_sale ss join "user" op on op.id = ss.operator_id join "user" rc on rc.id = ss.recipient_id
      where ss.stall_id = ${id} order by ss.id desc limit 100`),
    db.select().from(schema.stallCount).where(eq(schema.stallCount.stallId, id)),
    db.select().from(schema.stallAllocation).where(and(eq(schema.stallAllocation.stallId, id), eq(schema.stallAllocation.version, s.allocationVersion))),
    db.select().from(schema.stallTransferLine).where(and(eq(schema.stallTransferLine.stallId, id), eq(schema.stallTransferLine.version, s.allocationVersion))),
    db.select().from(schema.stallConfirmation).where(and(eq(schema.stallConfirmation.stallId, id), eq(schema.stallConfirmation.version, s.allocationVersion))),
    db.select().from(schema.stallApproval).where(and(eq(schema.stallApproval.stallId, id), eq(schema.stallApproval.version, s.allocationVersion))),
    participatingDhams(id),
    stallMoney(id),
    rows<{ action: string; name: string; created_at: string }>(sql`select e.action, u.name, e.created_at from stall_event e join "user" u on u.id = e.actor_id where e.stall_id = ${id} order by e.id desc limit 40`),
  ]);
  const nameOf = new Map(people.map((p) => [p.user_id, p.name]));
  const titleOf = new Map(stock.map((b) => [b.book_id, b.title]));
  const me = people.find((p) => p.user_id === u.id);
  const accepted = people.filter((p) => p.status === "accepted");
  const dhamNames = new Map((dhams.length ? await db.select({ id: schema.dham.id, name: schema.dham.name }).from(schema.dham).where(inArray(schema.dham.id, dhams)) : []).map((d) => [d.id, d.name]));
  const owners = [...new Map(alloc.map((a) => [a.userId, { id: a.userId, name: nameOf.get(a.userId) ?? "—" }])).values()];
  const myAlloc = alloc.filter((a) => a.userId === u.id);
  const myConf = confs.find((c) => c.userId === u.id);
  const totals = sales.reduce((a, x) => ({ t: a.t + Number(x.total_paise), c: a.c + Number(x.cash_paise), p: a.p + Number(x.upi_paise) }), { t: 0, c: 0, p: 0 });

  // My free books (for adding to the stall).
  let myBooks: { id: number; title: string; language: string; free: number }[] = [];
  if (acc.participant && selling && u.canDistribute) {
    const [avail, pend] = await Promise.all([availableFor(H.devotee(u.id)), pendingReportedQty(u.id)]);
    const ids = [...avail].filter(([b, q]) => q - (pend.get(b) ?? 0) > 0).map(([b]) => b);
    const bk = ids.length ? await db.select().from(schema.book).where(inArray(schema.book.id, ids)).orderBy(asc(schema.book.title)) : [];
    myBooks = bk.map((b) => ({ id: b.id, title: b.title, language: b.language, free: (avail.get(b.id) ?? 0) - (pend.get(b.id) ?? 0) }));
  }
  // People of the organizing Dham who can be invited.
  const invitable = acc.coordinator && selling
    ? (await db.select({ id: schema.user.id, name: schema.user.name }).from(schema.user)
        .where(and(eq(schema.user.dhamId, s.organizingDhamId), eq(schema.user.isActive, true), eq(schema.user.approvalStatus, "approved"),
          sql`(${schema.user.role} = 'manager' or (${schema.user.role} = 'devotee' and ${schema.user.canDistributeBooks}))`)).orderBy(asc(schema.user.name)))
        .filter((x) => !people.some((p) => p.user_id === x.id && (p.status === "accepted" || p.status === "invited")))
    : [];
  // Stock source of what this stall sold — Sevaks only (never devotees).
  const bySource = acc.seeSources && s.postedAt
    ? await rows<{ source: Source; kind: string; qty: number }>(sql`
        select coalesce(l.source, 'unknown') as source, m.kind, sum(m.qty)::int as qty from stock_movement m left join stock_lot l on l.id = m.lot_id
        where m.stall_id = ${id} group by 1, 2 order by 1, 2`)
    : [];
  const canApprove = s.status === "pending_approval" && (u.role === "admin" ? dhams.some((d) => !approvals.some((a) => a.dhamId === d)) : u.role === "manager" && u.dhamId != null && dhams.includes(u.dhamId) && !approvals.some((a) => a.dhamId === u.dhamId));

  return (
    <>
      <PageHeader title={s.name} crumbs={[{ label: "Home", href: "/dashboard" }, { label: "Shared Book Stall", href: "/stalls" }, { label: ref(s.id) }]}
        doHere={st?.help ?? ""} next={`${fmtDate(s.eventDate)}${s.location ? ` · ${s.location}` : ""} · coordinator ${nameOf.get(s.coordinatorId) ?? "—"}`} />
      <div className="mb-4 flex flex-wrap items-center gap-2" data-testid="stall-status">
        <Badge tone={st?.tone}>{st?.label}</Badge>
        <Badge tone={s.mode === "multi_dham" ? "purple" : "gray"}>{s.mode === "multi_dham" ? "Several Dhams" : "One Dham"}</Badge>
        {acc.coordinator && <Badge tone="green">You coordinate</Badge>}
      </div>

      {me?.status === "invited" && (
        <div className="mb-4"><Alert tone="amber" title="You are invited to this stall.">Join to add your books and sell together.</Alert><div className="mt-2"><RespondForm stallId={id} /></div></div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Copies on stall" value={num(stock.reduce((a, b) => a + b.contributed, 0))} />
        <StatCard label="Sold" value={num(stock.reduce((a, b) => a + b.sold, 0))} />
        <StatCard label="Money received" value={inr(totals.t)} hint={`Cash ${inr(totals.c)} · UPI ${inr(totals.p)}`} />
        <StatCard label="People" value={num(accepted.length)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {s.status === "active" && acc.participant && stock.some((b) => b.left > 0) && (
          <Card title="Quick Sell" subtitle="No need to choose whose book — it is shared at closing" className="lg:col-span-2">
            <QuickSellForm stallId={id} me={u.id} books={stock.filter((b) => b.left > 0).map((b) => ({ id: b.book_id, title: b.title, language: b.language, price: b.price_paise, left: b.left }))}
              recipients={accepted.map((p) => ({ id: p.user_id, name: p.name }))} />
          </Card>
        )}

        <Card title="Books on the stall">
          {stock.length === 0 ? <EmptyState icon="📚" title="No books yet.">Participants add their own books.</EmptyState> : (
            <table className="data-table" data-testid="stall-stock"><thead><tr><th>Book</th><th className="text-right">Given</th><th className="text-right">Sold</th><th className="text-right">Left</th></tr></thead>
              <tbody>{stock.map((b) => <tr key={b.book_id}><td>{b.title}</td><td className="text-right">{b.contributed}</td><td className="text-right">{b.sold}</td><td className="text-right">{b.left}</td></tr>)}</tbody></table>
          )}
          {contribs.length > 0 && (
            <details className="mt-3"><summary className="tap cursor-pointer text-sm font-semibold text-brand-700">Who gave what ({contribs.length})</summary>
              <ul className="mt-2 space-y-1 text-sm">
                {contribs.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-2">
                    <span><b>{c.name}</b> · {c.qty} × {c.title}</span>
                    {c.status === "proposed" && <Badge tone="amber">Waiting for owner</Badge>}
                    {c.status === "proposed" && c.user_id === u.id && selling && (<>
                      <SmallAction action="confirmContribution" fields={{ id: c.id, stallId: id }} label="Confirm" variant="success" />
                      <SmallAction action="rejectContribution" fields={{ id: c.id, stallId: id }} label="Reject" />
                    </>)}
                    {selling && (c.user_id === u.id || acc.coordinator) && c.status === "confirmed" && <SmallAction action="withdrawContribution" fields={{ id: c.id, stallId: id }} label="Take back" />}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Card>

        {acc.participant && selling && u.canDistribute && (
          <Card title="Add my books" subtitle="They stay yours; they are only kept aside for this stall">
            <ContributeForm stallId={id} me={u.id} isCoordinator={acc.coordinator} books={myBooks} owners={accepted.map((p) => ({ id: p.user_id, name: p.name }))} />
          </Card>
        )}

        <Card title={`People (${people.filter((p) => p.status !== "removed").length})`}>
          <ul className="space-y-1 text-sm" data-testid="stall-people">
            {people.filter((p) => p.status !== "removed").map((p) => (
              <li key={p.user_id} className="flex flex-wrap items-center gap-2"><b>{p.name}</b><span className="text-ink-500">{p.dham}</span>
                {p.user_id === s.coordinatorId && <Badge tone="green">Coordinator</Badge>}
                {p.status !== "accepted" && <Badge tone={p.status === "invited" ? "amber" : "gray"}>{p.status === "invited" ? "Invited" : "Declined"}</Badge>}</li>
            ))}
          </ul>
          {acc.coordinator && selling && <div className="mt-3 border-t border-stone-100 pt-3"><InviteForm stallId={id} members={invitable} multi={s.mode === "multi_dham"} /></div>}
        </Card>

        {acc.coordinator && selling && (
          <Card title="Coordinator">
            <div className="flex flex-wrap gap-2">
              {s.status === "draft" && <SmallAction action="openStall" fields={{ stallId: id }} label="Open Stall — Start Selling" variant="primary" />}
              {s.status === "active" && <SmallAction action="startClosing" fields={{ stallId: id }} label="Stop Selling — Start Closing" variant="primary" />}
            </div>
            <div className="mt-3"><CancelForm stallId={id} /></div>
          </Card>
        )}

        {closingPhase && acc.coordinator && (
          <Card title="1. Count the books left" className="lg:col-span-2">
            <CountForm stallId={id} books={stock.map((b) => ({ id: b.book_id, title: b.title, contributed: b.contributed, sold: b.sold, left: b.left, counted: counts.find((c) => c.bookId === b.book_id)?.remaining }))} />
          </Card>
        )}

        {s.status === "disputed" && <div className="lg:col-span-2"><Alert tone="red" title="Someone disagreed with the closing.">{confs.filter((c) => c.decision === "disputed").map((c) => `${nameOf.get(c.userId)}: ${c.reason}`).join(" · ")}. The coordinator can recount or change the take-home copies.</Alert></div>}

        {alloc.length > 0 && (
          <Card title={s.postedAt ? "Closing (posted)" : "2. Who takes home what"} subtitle={`Version ${s.allocationVersion}`} className="lg:col-span-2">
            <div className="overflow-x-auto"><table className="data-table" data-testid="stall-allocation">
              <thead><tr><th>Owner</th><th>Book</th><th className="text-right">Gave</th><th className="text-right">Suggested</th><th className="text-right">Takes home</th><th className="text-right">Sold (counted as theirs)</th><th className="text-right">Missing</th><th className="text-right">Value sold</th></tr></thead>
              <tbody>{alloc.map((a) => (
                <tr key={a.id} data-testid={`alloc-${a.userId}-${a.bookId}`}><td>{nameOf.get(a.userId)}</td><td>{titleOf.get(a.bookId)}</td><td className="text-right">{a.contributed}</td><td className="text-right">{a.suggestedTakeHome}</td>
                  <td className="text-right font-semibold">{a.takeHome}{a.transferIn ? <span className="text-xs text-purple-700"> (+{a.transferIn} from others)</span> : null}</td>
                  <td className="text-right" data-testid={`sold-${a.userId}-${a.bookId}`}>{a.attributedSold}</td><td className="text-right">{a.loss || ""}</td><td className="text-right">{inr(a.attributedValuePaise)}</td></tr>
              ))}</tbody>
            </table></div>
            {xfers.length > 0 && <p className="mt-2 text-sm text-purple-800">Books changing owner: {xfers.map((t) => `${t.qty} × ${titleOf.get(t.bookId)} from ${nameOf.get(t.fromUserId)} to ${nameOf.get(t.toUserId)}`).join("; ")}.</p>}
            {s.closingNote && <p className="mt-2 text-sm text-ink-600">Note: {s.closingNote}</p>}
            {closingPhase && acc.coordinator && (
              <details className="mt-3"><summary className="tap cursor-pointer text-sm font-semibold text-brand-700">Change take-home copies</summary>
                <div className="mt-2"><AllocationEditForm stallId={id} rows={alloc.map((a) => ({ userId: a.userId, bookId: a.bookId, takeHome: a.takeHome }))}
                  books={counts.map((c) => ({ id: c.bookId, title: titleOf.get(c.bookId) ?? "", remaining: c.remaining }))} owners={owners} /></div>
              </details>
            )}
            <div className="mt-3 border-t border-stone-100 pt-3">
              <p className="mb-2 text-sm font-semibold">Confirmations</p>
              <ul className="flex flex-wrap gap-2 text-sm">{owners.map((o) => { const c = confs.find((x) => x.userId === o.id); return <li key={o.id}><Badge tone={c?.decision === "confirmed" ? "green" : c?.decision === "disputed" ? "red" : "gray"}>{o.name}: {c?.decision === "confirmed" ? "Confirmed" : c?.decision === "disputed" ? "Disagrees" : "Waiting"}</Badge></li>; })}</ul>
              {s.status === "closing" && myAlloc.length > 0 && myConf?.decision !== "confirmed" && (
                <div className="mt-3"><p className="mb-2 text-sm">You take home: <b>{myAlloc.map((a) => `${a.takeHome} × ${titleOf.get(a.bookId)}`).join(", ")}</b>.</p><ConfirmAllocationForm stallId={id} version={s.allocationVersion} /></div>
              )}
            </div>
          </Card>
        )}

        {(s.status === "pending_approval" || approvals.length > 0) && (
          <Card title="3. Sector Sevak approval">
            <ul className="space-y-1 text-sm">{dhams.map((d) => <li key={d}><Badge tone={approvals.some((a) => a.dhamId === d) ? "green" : "amber"}>{dhamNames.get(d)}: {approvals.some((a) => a.dhamId === d) ? "Approved" : "Waiting"}</Badge></li>)}</ul>
            {canApprove && <div className="mt-3"><SmallAction action="approveClosing" fields={{ stallId: id }} label="Approve Closing" variant="success" /></div>}
          </Card>
        )}

        {money.length > 0 && (
          <Card title="Money — who received it">
            <p className="mb-2 text-xs text-ink-500">Money received is kept separate from whose books were sold. Each person hands over what they received (Submit Money → choose this stall).</p>
            <table className="data-table" data-testid="stall-money"><thead><tr><th>Received by</th><th className="text-right">Cash</th><th className="text-right">UPI</th><th className="text-right">Total</th><th className="text-right">Handed over</th></tr></thead>
              <tbody>{money.map((m) => <tr key={m.user_id}><td>{m.name}</td><td className="text-right">{inr(m.cash)}</td><td className="text-right">{inr(m.upi)}</td><td className="text-right">{inr(m.collected)}</td>
                <td className="text-right">{inr(m.received)}{m.submitted ? <span className="text-xs text-amber-700"> (+{inr(m.submitted)} waiting)</span> : null}</td></tr>)}</tbody></table>
            {s.status === "pending_settlement" && (
              <div className="mt-3 flex flex-wrap gap-2">
                {money.some((m) => m.user_id === u.id && m.received + m.submitted < m.collected) && <Link href="/my/money" className="btn-primary btn-sm">Hand over my stall money</Link>}
                <SmallAction action="checkSettlement" fields={{ stallId: id }} label="Check if settled" />
              </div>
            )}
          </Card>
        )}

        {bySource.length > 0 && (
          <Card title="By stock source" subtitle="Only Sevaks see this">
            <table className="data-table" data-testid="stall-sources"><thead><tr><th>Source</th><th>Movement</th><th className="text-right">Copies</th></tr></thead>
              <tbody>{bySource.map((b, i) => <tr key={i}><td>{SOURCE_LABEL[b.source]}</td><td>{b.kind === "stall_transfer" ? "Changed owner" : b.kind === "damaged" ? "Missing" : "Sold"}</td><td className="text-right">{num(b.qty)}</td></tr>)}</tbody></table>
          </Card>
        )}

        <Card title="Sales" subtitle="Newest first. An undo adds an opposite entry; nothing is deleted." className="lg:col-span-2">
          {sales.length === 0 ? <p className="text-sm text-ink-500">No sales yet.</p> : (
            <ul className="divide-y divide-stone-100 text-sm" data-testid="stall-sales">
              {sales.map((x) => (
                <li key={x.id} className={`flex flex-wrap items-center gap-2 py-2 ${x.reversed_by ? "text-ink-400 line-through" : ""}`}>
                  <span className="font-semibold tabular-nums">{inr(x.total_paise)}</span>
                  <span>{x.items}</span>
                  <Badge tone={x.reversal_of ? "red" : "gray"}>{x.reversal_of ? "Undo" : x.mode === "split" ? `Cash ${inr(x.cash_paise)} + UPI ${inr(x.upi_paise)}` : PAY_MODE_LABEL[x.mode]}</Badge>
                  <span className="text-xs text-ink-500">by {x.operator}{x.recipient !== x.operator ? ` · money with ${x.recipient}` : ""} · {fmtDateTime(x.created_at)}</span>
                  {s.status === "active" && !x.reversal_of && !x.reversed_by && (x.operator_id === u.id || acc.coordinator) && <UndoSaleForm stallId={id} saleId={x.id} />}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="History">
          <ul className="space-y-1 text-xs text-ink-600">{events.map((e, i) => <li key={i}>{fmtDateTime(e.created_at)} · {e.name} · {e.action.replace("status:", "→ ").replaceAll("_", " ")}</li>)}</ul>
        </Card>
      </div>
    </>
  );
}

export const dynamic = "force-dynamic";

