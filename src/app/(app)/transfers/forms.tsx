"use client";

import { useMemo, useState } from "react";
import { ActionForm, SubmitButton } from "@/components/client";
import {
  acceptTransfer, approveTransfer, cancelTransfer, dispatchTransfer, receiveTransfer, reconcileTransfer, requestTransfer,
} from "@/app/actions/transfers";

type Book = { id: number; title: string; language: string; qty: number };
export type Source = { holder: string; kind: "dham" | "devotee"; name: string; dhamId: number; dhamName: string; phone: string | null; books: Book[] };
const err = "mt-1 block text-sm font-medium text-red-700";

/**
 * Request Books: search a book → see which Dhams and devotees have it available → pick one →
 * enter quantities. Only copies that are free (not reserved for another transfer) are offered.
 */
export function RequestForm({
  sources, dests, defaultDest, presetBook,
}: { sources: Source[]; dests?: { holder: string; label: string }[]; defaultDest?: string; presetBook?: number }) {
  const presetTitle = presetBook ? sources.flatMap((s) => s.books).find((b) => b.id === presetBook)?.title ?? "" : "";
  const [q, setQ] = useState(presetTitle);
  const [dham, setDham] = useState("");
  const [kind, setKind] = useState("");
  const [min, setMin] = useState("");
  const [dest, setDest] = useState(defaultDest ?? "");
  const [pick, setPick] = useState<string>("");
  const match = (b: Book) => !q.trim() || `${b.title} ${b.language}`.toLowerCase().includes(q.trim().toLowerCase());
  const dhams = useMemo(() => [...new Map(sources.map((s) => [s.dhamId, s.dhamName])).entries()], [sources]);
  const list = sources.filter(
    (s) =>
      s.holder !== dest &&
      (!dham || String(s.dhamId) === dham) &&
      (!kind || s.kind === kind) &&
      s.books.some((b) => match(b) && b.qty >= (Number(min) || 1)),
  );
  const chosen = sources.find((s) => s.holder === pick);
  const showBooks = chosen ? chosen.books.filter((b) => match(b) || !q.trim()) : [];

  return (
    <ActionForm action={requestTransfer}>
      {(s) => (
        <>
          {dests && (
            <label className="block text-sm font-semibold text-ink-700">
              Who receives the books?
              <select name="dest" value={dest} onChange={(e) => { setDest(e.target.value); if (e.target.value === pick) setPick(""); }} className="field-input mt-1" data-testid="dest">
                <option value="" disabled>Choose…</option>
                {dests.map((d) => <option key={d.holder} value={d.holder}>{d.label}</option>)}
              </select>
              {s.fieldErrors?.dest && <span className={err}>{s.fieldErrors.dest}</span>}
            </label>
          )}

          <fieldset className="space-y-2 rounded-2xl border border-stone-200 p-3 sm:p-4">
            <legend className="px-1 text-sm font-semibold text-ink-900">1. Find the book</legend>
            <div className="grid gap-2 sm:grid-cols-4">
              <label className="text-xs font-semibold text-ink-600 sm:col-span-2">
                Book name or language
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Bhagavad Gita" className="field-input mt-1" data-testid="book-search" />
              </label>
              <label className="text-xs font-semibold text-ink-600">
                Dham
                <select value={dham} onChange={(e) => setDham(e.target.value)} className="field-input mt-1" data-testid="dham-filter">
                  <option value="">All Dhams</option>
                  {dhams.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs font-semibold text-ink-600">
                  From
                  <select value={kind} onChange={(e) => setKind(e.target.value)} className="field-input mt-1">
                    <option value="">All</option>
                    <option value="dham">Shelves</option>
                    <option value="devotee">Devotees</option>
                  </select>
                </label>
                <label className="text-xs font-semibold text-ink-600">
                  At least
                  <input value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="1" className="field-input mt-1" />
                </label>
              </div>
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-semibold text-ink-900">2. Choose where they come from ({list.length})</legend>
            {s.fieldErrors?.source && <span className={err}>{s.fieldErrors.source}</span>}
            {list.length === 0 ? (
              <p className="rounded-xl bg-stone-50 p-3 text-sm text-ink-600">Nobody has free copies matching this search.</p>
            ) : (
              <ul className="max-h-[22rem] space-y-2 overflow-y-auto pr-1" data-testid="sources">
                {list.map((src) => {
                  const hits = src.books.filter(match);
                  return (
                    <li key={src.holder}>
                      <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${pick === src.holder ? "border-brand-500 bg-brand-50/60 ring-2 ring-brand-200" : "border-stone-200 hover:border-stone-300"}`}>
                        <input type="radio" name="source" value={src.holder} checked={pick === src.holder} onChange={() => setPick(src.holder)} className="mt-1 h-5 w-5 accent-brand-600" />
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold text-ink-900">{src.kind === "dham" ? "🛕" : "🙋"} {src.name}</span>
                          <span className="block text-xs text-ink-500">{src.kind === "devotee" ? `${src.dhamName}${src.phone ? ` · ${src.phone}` : ""}` : "Dham shelf"}</span>
                          <span className="mt-1 block text-sm text-ink-700">{hits.slice(0, 4).map((b) => `${b.title} (${b.language}) ${b.qty}`).join(" · ")}{hits.length > 4 ? ` · +${hits.length - 4} more` : ""}</span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </fieldset>

          {chosen && (
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-semibold text-ink-900">3. How many do you need from {chosen.name}?</legend>
              {showBooks.map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 p-2.5">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink-900">{b.title}</p>
                    <p className="text-xs text-ink-500">{b.language} · {b.qty} available</p>
                    {s.fieldErrors?.[`qty_${b.id}`] && <span className={err}>{s.fieldErrors[`qty_${b.id}`]}</span>}
                  </div>
                  <input
                    name={`qty_${b.id}`} type="number" inputMode="numeric" min={0} max={b.qty}
                    defaultValue={presetBook === b.id ? 1 : undefined}
                    className="field-input w-24 text-right" placeholder="0" aria-label={`Copies of ${b.title}`}
                  />
                </div>
              ))}
            </fieldset>
          )}
          <label className="block text-sm font-semibold text-ink-700">
            Note (optional)
            <input name="note" className="field-input mt-1" placeholder="e.g. For Sunday book table" maxLength={300} />
          </label>
          <SubmitButton pending="Sending request…">Send request</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export type LineView = { bookId: number; title: string; requested: number; approved: number; dispatched: number; remaining: number; available?: number; inHand?: number };

/** Source Sector Sevak: check, approve all or part (reserves them), choose the sender — or reject. */
export function ApproveForm({ id, lines, senders, needsSender }: { id: number; lines: LineView[]; senders: { id: string; name: string }[]; needsSender: boolean }) {
  return (
    <ActionForm action={approveTransfer} resetOnSuccess={false} hideOnSuccess>
      {(s) => (
        <>
          <input type="hidden" name="id" value={id} />
          {lines.map((l) => (
            <div key={l.bookId} className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 p-2.5">
              <div className="min-w-0">
                <p className="font-semibold text-ink-900">{l.title}</p>
                <p className="text-xs text-ink-500">Asked {l.requested} · free to give {Math.max(l.available ?? 0, 0)}</p>
                {s.fieldErrors?.[`approve_${l.bookId}`] && <span className={err}>{s.fieldErrors[`approve_${l.bookId}`]}</span>}
              </div>
              <label className="shrink-0 text-xs font-semibold text-ink-600">
                Approve
                <input name={`approve_${l.bookId}`} type="number" inputMode="numeric" min={0} max={Math.min(l.requested, Math.max(l.available ?? 0, 0))}
                  defaultValue={Math.min(l.requested, Math.max(l.available ?? 0, 0))} className="field-input ml-1 w-20 text-right" data-testid={`approve-${l.bookId}`} />
              </label>
            </div>
          ))}
          {needsSender && (
            <label className="block text-sm font-semibold text-ink-700">
              Who will send the books? (optional)
              <select name="senderId" defaultValue="" className="field-input mt-1" data-testid="sender">
                <option value="">I will send them myself</option>
                {senders.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          )}
          <label className="block text-sm font-semibold text-ink-700">
            Message (optional)
            <input name="reply" className="field-input mt-1" maxLength={300} placeholder="e.g. Can give 5 now" />
          </label>
          <div className="flex flex-wrap gap-2">
            <SubmitButton name="decision" value="approve" variant="success" pending="Approving…">✅ Approve</SubmitButton>
            <SubmitButton name="decision" value="decline" variant="danger" pending="Please wait…">Reject</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}

export function AcceptButton({ id }: { id: number }) {
  return (
    <ActionForm action={acceptTransfer} resetOnSuccess={false} hideOnSuccess className="">
      <input type="hidden" name="id" value={id} />
      <SubmitButton variant="secondary" pending="Saving…">👍 Accept &amp; prepare</SubmitButton>
    </ActionForm>
  );
}

/** Sender: confirm what is actually sent (never more than approved). */
export function DispatchForm({ id, lines }: { id: number; lines: LineView[] }) {
  return (
    <ActionForm action={dispatchTransfer} resetOnSuccess={false} hideOnSuccess>
      {(s) => (
        <>
          <input type="hidden" name="id" value={id} />
          {lines.filter((l) => l.approved > 0).map((l) => (
            <div key={l.bookId} className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 p-2.5">
              <div className="min-w-0">
                <p className="font-semibold text-ink-900">{l.title}</p>
                <p className="text-xs text-ink-500">Approved {l.approved} · in hand {l.inHand ?? 0}</p>
                {s.fieldErrors?.[`send_${l.bookId}`] && <span className={err}>{s.fieldErrors[`send_${l.bookId}`]}</span>}
              </div>
              <label className="shrink-0 text-xs font-semibold text-ink-600">
                Sending
                <input name={`send_${l.bookId}`} type="number" inputMode="numeric" min={0} max={l.approved} defaultValue={Math.min(l.approved, l.inHand ?? 0)} className="field-input ml-1 w-20 text-right" data-testid={`send-${l.bookId}`} />
              </label>
            </div>
          ))}
          <input name="note" className="field-input" maxLength={300} placeholder="Note (optional), e.g. sent with Govinda by bus" />
          <SubmitButton pending="Sending…">🚚 Send books</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

/** Receiver: count and confirm what arrived; report missing / damaged / wrong books. */
export function ReceiveForm({ id, lines }: { id: number; lines: LineView[] }) {
  return (
    <ActionForm action={receiveTransfer} resetOnSuccess={false} hideOnSuccess>
      {(s) => (
        <>
          <input type="hidden" name="id" value={id} />
          {lines.filter((l) => l.remaining > 0).map((l) => (
            <div key={l.bookId} className="space-y-2 rounded-xl border border-stone-200 p-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-ink-900">{l.title}</p>
                  <p className="text-xs text-ink-500">On the way {l.remaining}</p>
                  {s.fieldErrors?.[`recv_${l.bookId}`] && <span className={err}>{s.fieldErrors[`recv_${l.bookId}`]}</span>}
                </div>
                <label className="shrink-0 text-xs font-semibold text-ink-600">
                  Received
                  <input name={`recv_${l.bookId}`} type="number" inputMode="numeric" min={0} max={l.remaining} defaultValue={l.remaining} className="field-input ml-1 w-20 text-right" data-testid={`recv-${l.bookId}`} />
                </label>
              </div>
              <input name={`issue_${l.bookId}`} maxLength={200} className="field-input text-sm" placeholder="Problem? e.g. 2 missing, 1 damaged, wrong language (optional)" data-testid={`issue-${l.bookId}`} />
            </div>
          ))}
          <input name="note" className="field-input" maxLength={300} placeholder="Note (optional)" />
          <SubmitButton variant="success" pending="Saving…">📥 Confirm received</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

/** Source Sector Sevak / Chakra Sevak: settle copies that never arrived. */
export function ReconcileForm({ id, lines, canWriteOff }: { id: number; lines: LineView[]; canWriteOff: boolean }) {
  return (
    <ActionForm action={reconcileTransfer} resetOnSuccess={false} hideOnSuccess>
      {(s) => (
        <>
          <input type="hidden" name="id" value={id} />
          {lines.filter((l) => l.remaining > 0).map((l) => (
            <div key={l.bookId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 p-2.5">
              <div className="min-w-0">
                <p className="font-semibold text-ink-900">{l.title}</p>
                <p className="text-xs text-ink-500">Not yet received {l.remaining}</p>
                {s.fieldErrors?.[`return_${l.bookId}`] && <span className={err}>{s.fieldErrors[`return_${l.bookId}`]}</span>}
              </div>
              <div className="flex gap-2">
                <label className="text-xs font-semibold text-ink-600">
                  Back to sender
                  <input name={`return_${l.bookId}`} type="number" inputMode="numeric" min={0} max={l.remaining} className="field-input mt-1 w-24 text-right" placeholder="0" data-testid={`return-${l.bookId}`} />
                </label>
                {canWriteOff && (
                  <label className="text-xs font-semibold text-ink-600">
                    Write off (lost)
                    <input name={`lost_${l.bookId}`} type="number" inputMode="numeric" min={0} max={l.remaining} className="field-input mt-1 w-24 text-right" placeholder="0" data-testid={`lost-${l.bookId}`} />
                  </label>
                )}
              </div>
            </div>
          ))}
          <label className="block text-sm font-semibold text-ink-700">
            What happened? (required)
            <input name="note" className="field-input mt-1" maxLength={300} placeholder="e.g. 2 copies came back with the sender" />
            {s.fieldErrors?.note && <span className={err}>{s.fieldErrors.note}</span>}
          </label>
          <SubmitButton variant="warn" pending="Saving…">Reconcile</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function CancelButton({ id }: { id: number }) {
  return (
    <ActionForm action={cancelTransfer} resetOnSuccess={false} hideOnSuccess className="">
      <input type="hidden" name="id" value={id} />
      <SubmitButton variant="secondary" pending="Cancelling…">Cancel request</SubmitButton>
    </ActionForm>
  );
}
