import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { holderStock } from "@/lib/stock";
import { fmtDateTime, num } from "@/lib/format";
import { TRANSFER_EVENT, TRANSFER_STATUS } from "@/lib/terms";
import {
  approvedOf, availableFor, canApprove, canCancel, canReceive, canSee, canSend, dispatchedOf, fromHolderOf, holderNames,
  holderUserId, isDevoteeHolder, isSourceManager, ref, remainingOf, toHolderOf,
} from "@/lib/transfers";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";
import { AcceptButton, ApproveForm, CancelButton, DispatchForm, ReceiveForm, ReconcileForm, type LineView } from "../forms";

/** One transfer: its books and quantities at every step, who did what and when, and the next action. */
export default async function TransferPage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser("admin", "manager", "devotee");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [t] = await db.select().from(schema.dhamTransfer).where(eq(schema.dhamTransfer.id, id));
  if (!t || !canSee(u, t)) notFound();
  const [lines, events] = await Promise.all([
    db.select().from(schema.dhamTransferLine).where(eq(schema.dhamTransferLine.transferId, id)),
    db.select().from(schema.dhamTransferEvent).where(eq(schema.dhamTransferEvent.transferId, id)).orderBy(asc(schema.dhamTransferEvent.at), asc(schema.dhamTransferEvent.id)),
  ]);
  const src = fromHolderOf(t);
  const dst = toHolderOf(t);
  const books = await db.select({ id: schema.book.id, title: schema.book.title, language: schema.book.language }).from(schema.book).where(inArray(schema.book.id, lines.map((l) => l.bookId).concat(-1)));
  const uids = [t.requestedBy, t.approvedBy, t.acceptedBy, t.sentBy, t.receivedBy, t.closedBy, t.senderId, ...events.map((e) => e.byUser)].filter(Boolean) as string[];
  const people = await db.select({ id: schema.user.id, name: schema.user.name }).from(schema.user).where(inArray(schema.user.id, uids.concat("-")));
  const who = (x: string | null) => people.find((p) => p.id === x)?.name ?? "—";
  const name = await holderNames([src, dst]);
  const book = (b: number) => books.find((x) => x.id === b);
  const st = TRANSFER_STATUS[t.status] ?? TRANSFER_STATUS.requested;
  const partialApproval = ["approved", "accepted", "sent", "partially_received", "disputed", "received", "completed"].includes(t.status) && lines.some((l) => approvedOf(l) < l.requestedQty);

  const sourceMgr = isSourceManager(u, t);
  const approver = canApprove(u, t);
  const [avail, inHand] = await Promise.all([
    t.status === "requested" && approver ? availableFor(src, db, id) : null,
    (t.status === "approved" || t.status === "accepted") && canSend(u, t) ? holderStock(src) : null,
  ]);
  const view: LineView[] = lines.map((l) => ({
    bookId: l.bookId, title: book(l.bookId)?.title ?? "Book", requested: l.requestedQty, approved: approvedOf(l),
    dispatched: dispatchedOf(t, l), remaining: remainingOf(t, l), available: avail?.get(l.bookId) ?? 0, inHand: inHand?.get(l.bookId) ?? 0,
  }));
  const senders = t.status === "requested" && sourceMgr && !isDevoteeHolder(src)
    ? await db.select({ id: schema.user.id, name: schema.user.name }).from(schema.user)
      .where(and(eq(schema.user.dhamId, t.fromDhamId), eq(schema.user.isActive, true), inArray(schema.user.role, ["devotee", "manager"]))).orderBy(schema.user.name)
    : [];
  const remaining = view.reduce((a, l) => a + l.remaining, 0);

  // Older transfers (before the step log) are shown from their stored dates.
  const timeline = events.length
    ? events.map((e) => ({ key: String(e.id), label: TRANSFER_EVENT[e.status] ?? e.status, by: who(e.byUser), at: e.at, qty: e.qty, note: e.note, bad: ["declined", "disputed", "cancelled"].includes(e.status) }))
    : [
        { key: "r", label: "Requested", by: who(t.requestedBy), at: t.requestedAt, qty: null, note: t.note, bad: false },
        ...(t.approvedBy ? [{ key: "a", label: "Approved", by: who(t.approvedBy), at: t.approvedAt!, qty: null, note: t.reply, bad: false }] : []),
        ...(t.sentBy ? [{ key: "s", label: "Dispatched", by: who(t.sentBy), at: t.sentAt!, qty: null, note: null, bad: false }] : []),
        ...(t.receivedBy ? [{ key: "v", label: "Received", by: who(t.receivedBy), at: t.receivedAt!, qty: null, note: null, bad: false }] : []),
        ...(t.closedBy ? [{ key: "c", label: st.label, by: who(t.closedBy), at: t.closedAt!, qty: null, note: null, bad: t.status !== "completed" && t.status !== "received" }] : []),
      ];
  const STEPS = ["Requested", "Approved", "Accepted", "Dispatched", "Received", "Completed"];
  const reached = { requested: 1, approved: 2, accepted: 3, sent: 4, partially_received: 4, disputed: 4, received: 6, completed: 6, declined: 1, cancelled: 1 }[t.status] ?? 1;
  const stopped = t.status === "declined" || t.status === "cancelled";

  return (
    <>
      <PageHeader
        title={`${ref(t.id)}: ${name(src)} → ${name(dst)}`}
        crumbs={[{ label: "Home", href: "/dashboard" }, { label: "Books Transfer", href: "/transfers" }, { label: ref(t.id) }]}
        doHere={st.help}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone={st.tone}>{st.label}</Badge>
        {partialApproval && <Badge tone="amber">Partially approved</Badge>}
        {t.senderId && <Badge tone="purple">Sender: {who(t.senderId)}</Badge>}
        {t.note && <span className="text-sm text-ink-600">Note: {t.note}</span>}
      </div>

      {/* Progress */}
      <ol className="mb-5 grid grid-cols-3 gap-2 sm:grid-cols-6" aria-label="Progress" data-testid="transfer-progress">
        {STEPS.map((s, i) => {
          const doneStep = !stopped && i + 1 <= reached;
          return (
            <li key={s} className={`rounded-xl px-2 py-2 text-center text-xs font-semibold ring-1 ${doneStep ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : stopped && i === 0 ? "bg-stone-100 text-ink-600 ring-stone-200" : "bg-white text-ink-400 ring-stone-200"}`}>
              {doneStep ? "✓ " : ""}{s}
            </li>
          );
        })}
      </ol>

      <div className="mb-4 space-y-3">
        {t.status === "requested" && approver && (
          <Card
            title={isDevoteeHolder(src) && u.id === holderUserId(src) ? "Someone is asking for your books" : "Check and approve"}
            subtitle={isDevoteeHolder(src) && u.id === holderUserId(src)
              ? "Check how many you have. Approve all, change the number you can give, or reject. Approved copies are kept aside for them."
              : "Approved copies are reserved at once, so they can't be given to anyone else."}
          >
            <ApproveForm id={t.id} lines={view} senders={senders} needsSender={!isDevoteeHolder(src)} />
          </Card>
        )}
        {(t.status === "approved" || t.status === "accepted") && canSend(u, t) && (
          <Card title={t.status === "approved" ? "Accept and send" : "Send the books"} subtitle="Enter what you actually send. You can't send more than was approved.">
            {t.status === "approved" && <div className="mb-3"><AcceptButton id={t.id} /></div>}
            <DispatchForm id={t.id} lines={view} />
          </Card>
        )}
        {["sent", "partially_received", "disputed"].includes(t.status) && canReceive(u, t) && (
          <Card title="Confirm what arrived" subtitle="Count the books. Only what you confirm is added to your stock; the rest stays “on the way”.">
            <ReceiveForm id={t.id} lines={view} />
          </Card>
        )}
        {["partially_received", "disputed"].includes(t.status) && sourceMgr && (
          <Card title="Reconcile what did not arrive" subtitle={u.role === "admin" ? "Return copies to the sender, or write them off as lost." : "Return copies to the sender. Only a Chakra Sevak can write books off as lost."}>
            <ReconcileForm id={t.id} lines={view} canWriteOff={u.role === "admin"} />
          </Card>
        )}
        {["requested", "approved", "accepted"].includes(t.status) && canCancel(u, t) && <CancelButton id={t.id} />}
        {t.status === "sent" && !canReceive(u, t) && <Alert tone="amber" title="On the way">Waiting for {name(dst)} to confirm what arrived.</Alert>}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Books">
          <div className="overflow-x-auto">
            <table className="data-table min-w-[520px]">
              <thead>
                <tr><th>Book</th><th className="text-right">Asked</th><th className="text-right">Approved</th><th className="text-right">Sent</th><th className="text-right">Received</th><th className="text-right">Still on the way</th></tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id}>
                    <td><span className="font-semibold text-ink-900">{book(l.bookId)?.title}</span> <span className="text-ink-500">· {book(l.bookId)?.language}</span>
                      {l.issue && <span className="block text-xs font-semibold text-red-700">⚠ {l.issue}</span>}
                      {(l.returnedQty > 0 || l.lostQty > 0) && <span className="block text-xs text-ink-500">{l.returnedQty ? `${l.returnedQty} returned to sender` : ""}{l.returnedQty && l.lostQty ? " · " : ""}{l.lostQty ? `${l.lostQty} written off` : ""}</span>}
                    </td>
                    <td className="text-right tabular-nums">{num(l.requestedQty)}</td>
                    <td className="text-right tabular-nums">{t.status === "requested" ? "—" : num(approvedOf(l))}</td>
                    <td className="text-right tabular-nums">{dispatchedOf(t, l) ? num(dispatchedOf(t, l)) : "—"}</td>
                    <td className="text-right tabular-nums">{t.status === "received" ? num(dispatchedOf(t, l)) : num(l.receivedQty)}</td>
                    <td className="text-right font-semibold tabular-nums">{num(remainingOf(t, l))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {remaining > 0 && <p className="mt-2 text-xs font-semibold text-amber-700">{num(remaining)} copies are still on the way — not counted at either end until confirmed.</p>}
        </Card>

        <Card title="Who did what">
          <ol className="space-y-3" data-testid="transfer-timeline">
            {timeline.map((s) => (
              <li key={s.key} className="flex gap-3">
                <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${s.bad ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>{s.bad ? "!" : "✓"}</span>
                <div className="min-w-0">
                  <p className="font-semibold text-ink-900">{s.label} by {s.by}{s.qty != null ? <span className="font-normal text-ink-600"> · {num(s.qty)} books</span> : null}</p>
                  <p className="text-xs text-ink-500">{fmtDateTime(s.at)}</p>
                  {s.note && <p className="text-sm text-ink-700">“{s.note}”</p>}
                </div>
              </li>
            ))}
          </ol>
          {t.reply && !events.length && <p className="mt-3 rounded-lg bg-stone-50 p-2 text-sm text-ink-700">Message: {t.reply}</p>}
          {u.role !== "devotee" && <Link href={`/transfers/report?view=audit&ref=${t.id}`} className="tap mt-2 text-sm font-semibold text-brand-700 hover:underline">Stock movement audit →</Link>}
        </Card>
      </div>
    </>
  );
}
