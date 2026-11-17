import { notFound } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { H, holderStock } from "@/lib/stock";
import { fmtDateTime, num } from "@/lib/format";
import { TRANSFER_STATUS } from "@/lib/terms";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";
import { ApproveForm, CancelButton, ReceiveButton, SendButton } from "../forms";

/** One transfer: books, and who requested, approved, sent and received it — with times. */
export default async function TransferPage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser("admin", "manager");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [t] = await db.select().from(schema.dhamTransfer).where(eq(schema.dhamTransfer.id, id));
  if (!t) notFound();
  if (u.role === "manager" && u.dhamId !== t.fromDhamId && u.dhamId !== t.toDhamId) notFound();
  const lines = await db.select().from(schema.dhamTransferLine).where(eq(schema.dhamTransferLine.transferId, id));
  const books = await db.select({ id: schema.book.id, title: schema.book.title, language: schema.book.language }).from(schema.book).where(inArray(schema.book.id, lines.map((l) => l.bookId).concat(-1)));
  const dhams = await db.select({ id: schema.dham.id, name: schema.dham.name }).from(schema.dham).where(inArray(schema.dham.id, [t.fromDhamId, t.toDhamId]));
  const ppl = [t.requestedBy, t.approvedBy, t.sentBy, t.receivedBy, t.closedBy].filter(Boolean) as string[];
  const people = await db.select({ id: schema.user.id, name: schema.user.name }).from(schema.user).where(inArray(schema.user.id, ppl.concat("-")));
  const who = (x: string | null) => people.find((p) => p.id === x)?.name ?? "—";
  const dn = (d: number) => dhams.find((x) => x.id === d)?.name ?? "Dham";
  const book = (b: number) => books.find((x) => x.id === b);
  const st = TRANSFER_STATUS[t.status];
  const isSender = u.role === "admin" || u.dhamId === t.fromDhamId;
  const isAsker = u.role === "admin" || u.dhamId === t.toDhamId;
  const shelf = t.status === "requested" && isSender ? await holderStock(H.dham(t.fromDhamId)) : null;

  const steps = [
    { label: "Requested", by: who(t.requestedBy), at: t.requestedAt, dham: dn(t.toDhamId) },
    { label: "Approved", by: t.approvedBy ? who(t.approvedBy) : null, at: t.approvedAt, dham: dn(t.fromDhamId) },
    { label: "Sent", by: t.sentBy ? who(t.sentBy) : null, at: t.sentAt, dham: dn(t.fromDhamId) },
    { label: "Received", by: t.receivedBy ? who(t.receivedBy) : null, at: t.receivedAt, dham: dn(t.toDhamId) },
  ];

  return (
    <>
      <PageHeader
        title={`Transfer #${t.id}: ${dn(t.fromDhamId)} → ${dn(t.toDhamId)}`}
        crumbs={[{ label: "Home", href: "/dashboard" }, { label: "Dham Transfers", href: "/transfers" }, { label: `#${t.id}` }]}
        doHere={st.help}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone={st.tone}>{st.label}</Badge>
        {t.note && <span className="text-sm text-ink-600">Note: {t.note}</span>}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Books">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-500">
                <th className="py-2 pr-3 font-semibold">Book</th>
                <th className="py-2 pr-3 text-right font-semibold">Asked</th>
                <th className="py-2 text-right font-semibold">Given</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {lines.map((l) => (
                <tr key={l.id}>
                  <td className="py-2 pr-3"><span className="font-semibold text-ink-900">{book(l.bookId)?.title}</span> <span className="text-ink-500">· {book(l.bookId)?.language}</span></td>
                  <td className="py-2 pr-3 text-right tabular-nums">{num(l.requestedQty)}</td>
                  <td className="py-2 text-right tabular-nums">{l.sentQty == null ? "—" : num(l.sentQty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Who did what">
          <ol className="space-y-3" data-testid="transfer-timeline">
            {steps.map((s) => (
              <li key={s.label} className="flex gap-3">
                <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${s.by ? "bg-emerald-100 text-emerald-700" : "bg-stone-100 text-ink-400"}`}>{s.by ? "✓" : "•"}</span>
                <div>
                  <p className="font-semibold text-ink-900">{s.label} {s.by ? <>by {s.by}</> : <span className="font-normal text-ink-400">— not yet</span>}</p>
                  {s.by && <p className="text-xs text-ink-500">{s.dham} · {fmtDateTime(s.at)}</p>}
                </div>
              </li>
            ))}
            {(t.status === "declined" || t.status === "cancelled") && (
              <li className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-100 text-xs font-bold text-red-700">✕</span>
                <div>
                  <p className="font-semibold text-ink-900">{st.label} by {who(t.closedBy)}</p>
                  <p className="text-xs text-ink-500">{fmtDateTime(t.closedAt)}</p>
                </div>
              </li>
            )}
          </ol>
          {t.reply && <p className="mt-3 rounded-lg bg-stone-50 p-2 text-sm text-ink-700">Message from {dn(t.fromDhamId)}: {t.reply}</p>}
        </Card>
      </div>

      <div className="mt-4 space-y-3">
        {t.status === "requested" && isSender && shelf && (
          <Card title="Check and approve">
            <ApproveForm id={t.id} lines={lines.map((l) => ({ bookId: l.bookId, title: book(l.bookId)?.title ?? "Book", asked: l.requestedQty, shelf: shelf.get(l.bookId) ?? 0 }))} />
          </Card>
        )}
        {t.status === "approved" && isSender && (
          <Alert tone="amber" title="Approved — ready to send">
            Pack the books. Tap below when they leave {dn(t.fromDhamId)}; they will leave your shelf then.
            <div className="mt-3"><SendButton id={t.id} /></div>
          </Alert>
        )}
        {t.status === "sent" && isAsker && (
          <Alert tone="amber" title="Books are on the way">
            When the books reach {dn(t.toDhamId)}, count them and tap below. They will be added to your shelf.
            <div className="mt-3"><ReceiveButton id={t.id} /></div>
          </Alert>
        )}
        {(t.status === "requested" || t.status === "approved") && isAsker && u.dhamId !== t.fromDhamId && (
          <div><CancelButton id={t.id} /></div>
        )}
      </div>
    </>
  );
}
