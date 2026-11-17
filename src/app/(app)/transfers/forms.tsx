"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/client";
import {
  approveTransfer,
  cancelTransfer,
  receiveTransfer,
  requestTransfer,
  sendTransfer,
} from "@/app/actions/transfers";

type Shelf = { dhamId: number; dhamName: string; books: { id: number; title: string; language: string; qty: number }[] };

/** Ask another Dham: choose the Dham, then only the books it has on its shelf are listed, with the count. */
export function RequestForm({ shelves, toDhams, presetBook }: { shelves: Shelf[]; toDhams?: { id: number; name: string }[]; presetBook?: number }) {
  const first = presetBook ? shelves.find((s) => s.books.some((b) => b.id === presetBook)) : undefined;
  const [from, setFrom] = useState<number>(first?.dhamId ?? 0);
  const shelf = shelves.find((s) => s.dhamId === from);
  return (
    <ActionForm action={requestTransfer}>
      {(s) => (
        <>
          {toDhams && (
            <label className="block text-sm font-semibold text-ink-700">
              Dham that needs the books
              <select name="toDhamId" className="field-input mt-1" defaultValue="" required>
                <option value="" disabled>Choose…</option>
                {toDhams.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              {s.fieldErrors?.toDhamId && <span className="mt-1 block text-sm font-medium text-red-700">{s.fieldErrors.toDhamId}</span>}
            </label>
          )}
          <label className="block text-sm font-semibold text-ink-700">
            Ask which Dham?
            <select name="fromDhamId" className="field-input mt-1" value={from || ""} onChange={(e) => setFrom(Number(e.target.value))} required data-testid="from-dham">
              <option value="" disabled>Choose a Dham…</option>
              {shelves.map((d) => (
                <option key={d.dhamId} value={d.dhamId}>{d.dhamName} ({d.books.reduce((a, b) => a + b.qty, 0)} books)</option>
              ))}
            </select>
            {s.fieldErrors?.fromDhamId && <span className="mt-1 block text-sm font-medium text-red-700">{s.fieldErrors.fromDhamId}</span>}
          </label>
          {shelf && (
            shelf.books.length === 0 ? (
              <p className="rounded-lg bg-stone-50 p-3 text-sm text-ink-600">{shelf.dhamName} has no books on its shelf right now.</p>
            ) : (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-ink-700">How many do you need? (only books {shelf.dhamName} has)</p>
                {shelf.books.map((b) => (
                  <div key={b.id} className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 p-2.5">
                    <div>
                      <p className="font-semibold text-ink-900">{b.title}</p>
                      <p className="text-xs text-ink-500">{b.language} · they have {b.qty}</p>
                      {s.fieldErrors?.[`qty_${b.id}`] && <span className="mt-1 block text-sm font-medium text-red-700">{s.fieldErrors[`qty_${b.id}`]}</span>}
                    </div>
                    <input
                      name={`qty_${b.id}`} type="number" inputMode="numeric" min={0} max={b.qty}
                      defaultValue={presetBook === b.id ? 1 : undefined}
                      className="field-input w-24 text-right" placeholder="0" aria-label={`Copies of ${b.title}`}
                    />
                  </div>
                ))}
              </div>
            )
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

/** Sending Dham: check quantity, change how many to give, then approve — or decline. */
export function ApproveForm({ id, lines }: { id: number; lines: { bookId: number; title: string; asked: number; shelf: number }[] }) {
  return (
    <ActionForm action={approveTransfer} resetOnSuccess={false} hideOnSuccess>
      {(s) => (
        <>
          <input type="hidden" name="id" value={id} />
          {lines.map((l) => (
            <div key={l.bookId} className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 p-2.5">
              <div>
                <p className="font-semibold text-ink-900">{l.title}</p>
                <p className="text-xs text-ink-500">Asked {l.asked} · on your shelf {l.shelf}</p>
                {s.fieldErrors?.[`send_${l.bookId}`] && <span className="mt-1 block text-sm font-medium text-red-700">{s.fieldErrors[`send_${l.bookId}`]}</span>}
              </div>
              <label className="text-xs font-semibold text-ink-600">
                Give
                <input name={`send_${l.bookId}`} type="number" inputMode="numeric" min={0} max={Math.min(l.asked, l.shelf)}
                  defaultValue={Math.min(l.asked, l.shelf)} className="field-input ml-1 w-20 text-right" />
              </label>
            </div>
          ))}
          <label className="block text-sm font-semibold text-ink-700">
            Message (optional)
            <input name="reply" className="field-input mt-1" maxLength={300} placeholder="e.g. Will send on Friday" />
          </label>
          <div className="flex flex-wrap gap-2">
            <SubmitButton name="decision" value="approve" variant="success" pending="Approving…">✅ Approve</SubmitButton>
            <SubmitButton name="decision" value="decline" variant="danger" pending="Please wait…">Decline</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}

function OneButton({ action, id, label, pending, variant }: { action: typeof sendTransfer; id: number; label: string; pending: string; variant: "primary" | "success" | "secondary" }) {
  return (
    <ActionForm action={action} resetOnSuccess={false} hideOnSuccess className="">
      <input type="hidden" name="id" value={id} />
      <SubmitButton variant={variant} pending={pending}>{label}</SubmitButton>
    </ActionForm>
  );
}

export const SendButton = ({ id }: { id: number }) => <OneButton action={sendTransfer} id={id} label="🚚 Send books" pending="Sending…" variant="primary" />;
export const ReceiveButton = ({ id }: { id: number }) => <OneButton action={receiveTransfer} id={id} label="📥 Books received" pending="Saving…" variant="success" />;
export const CancelButton = ({ id }: { id: number }) => <OneButton action={cancelTransfer} id={id} label="Cancel request" pending="Cancelling…" variant="secondary" />;
