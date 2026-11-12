"use client";

import { useState } from "react";
import { receiveBooks } from "@/app/actions/stock";
import { ActionForm, SubmitButton } from "@/components/client";
import { Field } from "@/components/ui";

type Book = { id: number; title: string; language: string };

export function ReceiveForm({ books, dhams, today, isAdmin, dhamName }: { books: Book[]; dhams: { id: number; name: string }[]; today: string; isAdmin: boolean; dhamName?: string | null }) {
  const [review, setReview] = useState(false);
  const [v, setV] = useState({ bookId: "", qty: "", destination: "central" });
  const book = books.find((b) => String(b.id) === v.bookId);
  const place = isAdmin ? (v.destination === "central" ? "the Central Store" : dhams.find((d) => String(d.id) === v.destination)?.name) : dhamName;
  return (
    <ActionForm action={async (s, fd) => { const r = await receiveBooks(s, fd); setReview(false); if (r.status === "success") setV({ bookId: "", qty: "", destination: v.destination }); return r; }}>
      {(s) => (
        <>
          <div className={review ? "hidden" : "space-y-4"}>
            <Field label="1. Which book arrived?" htmlFor="bookId" error={s.fieldErrors?.bookId}>
              <select id="bookId" name="bookId" className="field-input" value={v.bookId} onChange={(e) => setV({ ...v, bookId: e.target.value })}>
                <option value="">Choose a book…</option>
                {books.map((b) => <option key={b.id} value={b.id}>{b.title} ({b.language})</option>)}
              </select>
            </Field>
            <Field label="2. How many copies arrived?" htmlFor="qty" error={s.fieldErrors?.qty} help="Count the copies in the boxes before entering.">
              <input id="qty" name="qty" inputMode="numeric" pattern="[0-9]*" className="field-input text-lg font-bold" value={v.qty} onChange={(e) => setV({ ...v, qty: e.target.value.replace(/\D/g, "") })} />
            </Field>
            {isAdmin && (
              <Field label="Where did they arrive?" htmlFor="destination" help="Choose Central Store if the books came to the main office. Choose a Dham if they were delivered straight to it.">
                <select id="destination" name="destination" className="field-input" value={v.destination} onChange={(e) => setV({ ...v, destination: e.target.value })}>
                  <option value="central">Central Store</option>
                  {dhams.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </Field>
            )}
            <Field label="3. Date received" htmlFor="date" error={s.fieldErrors?.date}>
              <input id="date" type="date" name="date" defaultValue={today} max={today} className="field-input" />
            </Field>
            <Field label="4. Reference" htmlFor="reference" optional help="For example the invoice or delivery challan number.">
              <input id="reference" name="reference" className="field-input" />
            </Field>
            <Field label="Note" htmlFor="note" optional>
              <input id="note" name="note" className="field-input" placeholder="e.g. 2 boxes, delivered by BBT van" />
            </Field>
            <button type="button" className="btn-primary w-full sm:w-auto" disabled={!v.bookId || !(Number(v.qty) > 0)} onClick={() => setReview(true)}>
              Review →
            </button>
          </div>
          {review && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-brand-200 bg-brand-50/60 p-4">
                <p className="text-sm text-ink-500">5. Please confirm</p>
                <p className="mt-1 text-lg font-semibold">
                  Receive <span className="text-brand-800">{Number(v.qty).toLocaleString("en-IN")} copies</span> of {book?.title} ({book?.language}) at {place}?
                </p>
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <button type="button" className="btn-secondary" onClick={() => setReview(false)}>← Change</button>
                <SubmitButton pending="Saving…">Confirm Receipt</SubmitButton>
              </div>
            </div>
          )}
        </>
      )}
    </ActionForm>
  );
}
