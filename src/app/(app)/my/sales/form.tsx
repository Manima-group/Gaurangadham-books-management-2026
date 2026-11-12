"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { saveSalesReport } from "@/app/actions/reports";
import { offlineCapable } from "@/lib/offline-queue";
import { ActionMessage, PendingProvider, SubmitButton, useFormAction } from "@/components/client";
import { BookCover } from "@/components/ui";

type B = { id: number; title: string; language: string; coverUrl: string | null; pricePaise: number; available: number; size?: string };
type Slot = "" | "morning" | "afternoon" | "evening";
export type VenueInit = { name: string; area: string; slot: Slot; sold: Record<number, number> };
type DayInit = Record<number, { returned: number; damaged: number }>;

const rupees = (p: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2, minimumFractionDigits: p % 100 ? 2 : 0 }).format(p / 100);
const SLOTS: { v: Slot; l: string }[] = [
  { v: "morning", l: "🌅 Morning" },
  { v: "afternoon", l: "☀️ Afternoon" },
  { v: "evening", l: "🌇 Evening" },
];

function Stepper({ name, value, onChange, max, label, error }: { name: string; value: number; onChange: (n: number) => void; max: number; label: string; error?: boolean }) {
  return (
    <div className="flex items-center gap-1">
      <button type="button" aria-label={`One less ${label}`} disabled={value <= 0} className="h-11 w-11 rounded-xl border border-stone-300 bg-white text-xl font-bold active:scale-95 disabled:opacity-30" onClick={() => onChange(Math.max(0, value - 1))}>
        −
      </button>
      <input
        name={name}
        aria-label={label}
        inputMode="numeric"
        pattern="[0-9]*"
        value={value === 0 ? "" : String(value)}
        placeholder="0"
        onFocus={(e) => e.target.select()}
        onChange={(e) => onChange(parseInt(e.target.value.replace(/\D/g, "") || "0", 10) || 0)}
        className={`h-11 w-14 rounded-xl border text-center text-lg font-bold tabular-nums focus:outline-none focus:ring-4 ${
          error ? "border-red-500 bg-red-50 focus:ring-red-100" : value ? "border-brand-400 bg-brand-50 focus:ring-brand-100" : "border-stone-300 focus:border-brand-500 focus:ring-brand-100"
        }`}
      />
      <button type="button" aria-label={`One more ${label}`} disabled={value >= max} className="h-11 w-11 rounded-xl border border-stone-300 bg-white text-xl font-bold active:scale-95 disabled:opacity-30" onClick={() => onChange(Math.min(max, value + 1))}>
        +
      </button>
    </div>
  );
}

export function SalesForm({
  books,
  date,
  initVenues,
  initDay,
  initCollected,
  initRemarks,
  userId,
  pastVenues,
}: {
  books: B[];
  date: string;
  initVenues: VenueInit[];
  initDay: DayInit;
  initCollected?: number;
  initRemarks?: string;
  userId: string;
  pastVenues: string[];
}) {
  const [action] = useState(() =>
    offlineCapable(saveSalesReport, {
      kind: "sales",
      userId,
      label: (fd) => `Sales for ${new Date(String(fd.get("reportDate")) + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`,
      link: (fd) => `/my/sales?date=${fd.get("reportDate")}`,
    }),
  );
  const { state, onSubmit, pending } = useFormAction(action);
  const [venues, setVenues] = useState<VenueInit[]>(() => (initVenues.length ? initVenues : [{ name: "", area: "", slot: "", sold: {} }]));
  const [day, setDay] = useState<DayInit>(initDay);
  const [showDay, setShowDay] = useState(() => Object.values(initDay).some((v) => v.returned || v.damaged));
  const [showMoney, setShowMoney] = useState(initCollected != null);
  const [collected, setCollected] = useState(initCollected != null ? String(initCollected / 100) : "");
  const [open, setOpen] = useState(0); // which place card is expanded

  const usedOf = (bookId: number, skipVenue?: number) =>
    venues.reduce((a, v, i) => a + (i === skipVenue ? 0 : v.sold[bookId] ?? 0), 0) + (day[bookId]?.returned ?? 0) + (day[bookId]?.damaged ?? 0);
  const left = (b: B) => b.available - usedOf(b.id);

  const totals = useMemo(() => {
    let qty = 0, amount = 0;
    for (const b of books) {
      const s = venues.reduce((a, v) => a + (v.sold[b.id] ?? 0), 0);
      qty += s;
      amount += s * b.pricePaise;
    }
    return { qty, amount };
  }, [venues, books]);

  const setSold = (vi: number, bookId: number, n: number) =>
    setVenues((vs) => vs.map((v, i) => (i === vi ? { ...v, sold: { ...v.sold, [bookId]: n } } : v)));
  const setVenue = (vi: number, patch: Partial<VenueInit>) => setVenues((vs) => vs.map((v, i) => (i === vi ? { ...v, ...patch } : v)));

  if (state.status === "success" && state.next) {
    return (
      <div className="space-y-4">
        <div className="rounded-3xl bg-gradient-to-b from-emerald-50 to-white p-6 text-center ring-1 ring-emerald-200">
          <div className="text-5xl" aria-hidden>🙏</div>
          <p className="mt-2 font-display text-xl font-bold text-emerald-900">{state.message}</p>
          <p className="mt-1 text-emerald-900">{state.detail}</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Link href={state.next.href} className="btn-primary">{state.next.label}</Link>
          <Link href="/dashboard" className="btn-secondary">Back to Home</Link>
        </div>
      </div>
    );
  }

  return (
    <PendingProvider pending={pending}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <input type="hidden" name="reportDate" value={date} />
        <input type="hidden" name="venueCount" value={venues.length} />
        <datalist id="past-venues">{pastVenues.map((v) => <option key={v} value={v} />)}</datalist>
        <ActionMessage state={state} />

        {venues.map((v, vi) => {
          const placeQty = books.reduce((a, b) => a + (v.sold[b.id] ?? 0), 0);
          const placeAmt = books.reduce((a, b) => a + (v.sold[b.id] ?? 0) * b.pricePaise, 0);
          const isOpen = open === vi;
          const nameErr = state.fieldErrors?.[`venue_${vi}_name`];
          return (
            <section key={vi} className={`rounded-3xl border bg-white shadow-card ${nameErr ? "border-red-300" : "border-stone-200/80"}`}>
              <header className="flex items-center gap-3 p-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-lg font-bold text-brand-700 ring-1 ring-brand-100">📍</span>
                <button type="button" onClick={() => setOpen(isOpen ? -1 : vi)} className="min-w-0 flex-1 text-left" aria-expanded={isOpen}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Place {vi + 1}</p>
                  <p className="truncate font-display text-base font-bold text-ink-900">{v.name || "Where did you distribute?"}</p>
                  <p className="text-xs text-ink-500">{placeQty} book{placeQty === 1 ? "" : "s"} · {rupees(placeAmt)}</p>
                </button>
                {venues.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Remove place ${vi + 1}`}
                    className="h-10 w-10 rounded-xl text-ink-400 hover:bg-red-50 hover:text-red-600"
                    onClick={() => {
                      setVenues((vs) => vs.filter((_, i) => i !== vi));
                      setOpen(0);
                    }}
                  >
                    ✕
                  </button>
                )}
                <span aria-hidden className={`text-ink-400 transition ${isOpen ? "rotate-180" : ""}`}>▾</span>
              </header>

              {/* Inputs stay in the form even when the card is folded, so nothing is lost */}
              <div className={isOpen ? "space-y-4 border-t border-stone-100 p-4 pt-3" : "hidden"}>
                <div className="space-y-1.5">
                  <label htmlFor={`venue_${vi}_name`} className="text-sm font-semibold text-ink-900">Place name</label>
                  <input
                    id={`venue_${vi}_name`}
                    name={`venue_${vi}_name`}
                    list="past-venues"
                    value={v.name}
                    onChange={(e) => setVenue(vi, { name: e.target.value })}
                    placeholder="e.g. Ameerpet Metro Station"
                    className={`field-input ${nameErr ? "border-red-500" : ""}`}
                    autoComplete="off"
                  />
                  {nameErr && <p className="text-sm font-medium text-red-700">{nameErr}</p>}
                  <input
                    name={`venue_${vi}_area`}
                    value={v.area}
                    onChange={(e) => setVenue(vi, { area: e.target.value })}
                    placeholder="Landmark / area (optional)"
                    aria-label="Landmark or area (optional)"
                    className="field-input py-2.5 text-sm"
                  />
                  <input type="hidden" name={`venue_${vi}_slot`} value={v.slot} />
                  <div className="flex gap-2 overflow-x-auto pt-1" role="group" aria-label="Time of day (optional)">
                    {SLOTS.map((s) => (
                      <button
                        key={s.v}
                        type="button"
                        aria-pressed={v.slot === s.v}
                        onClick={() => setVenue(vi, { slot: v.slot === s.v ? "" : s.v })}
                        className={`min-h-10 shrink-0 rounded-full px-3.5 text-sm font-semibold transition ${
                          v.slot === s.v ? "bg-navy-800 text-white" : "border border-stone-300 bg-white text-ink-700"
                        }`}
                      >
                        {s.l}
                      </button>
                    ))}
                  </div>
                </div>

                <ul className="divide-y divide-stone-100">
                  {books.map((b) => {
                    const val = v.sold[b.id] ?? 0;
                    const max = b.available - usedOf(b.id, vi);
                    const err = state.fieldErrors?.[`book_${b.id}`];
                    return (
                      <li key={b.id} className="flex items-center gap-3 py-2.5">
                        <BookCover title={b.title} url={b.coverUrl} size={30} />
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-sm font-semibold leading-snug">{b.title}</p>
                          <p className={`text-xs ${err ? "font-semibold text-red-700" : "text-ink-500"}`}>
                            {b.language} · {rupees(b.pricePaise)} · <b className={left(b) < 0 ? "text-red-700" : "text-ink-700"}>{left(b)} left</b>
                          </p>
                        </div>
                        <Stepper name={`sold_${vi}_${b.id}`} value={val} onChange={(n) => setSold(vi, b.id, n)} max={Math.max(max, 0)} label={`${b.title} (${b.language}) sold at place ${vi + 1}`} error={!!err || left(b) < 0} />
                      </li>
                    );
                  })}
                </ul>
              </div>
            </section>
          );
        })}

        <button
          type="button"
          onClick={() => {
            setVenues((vs) => [...vs, { name: "", area: "", slot: "", sold: {} }]);
            setOpen(venues.length);
          }}
          className="flex min-h-14 w-full items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-brand-300 bg-brand-50/50 font-semibold text-brand-700 transition hover:bg-brand-50"
        >
          ➕ Add another place
        </button>

        {/* Day-level: returned / damaged */}
        <section className="rounded-3xl border border-stone-200/80 bg-white p-4">
          <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setShowDay((s) => !s)} aria-expanded={showDay}>
            <span className="font-semibold text-ink-800">↩ Returned or damaged books? <span className="font-normal text-ink-500">(optional)</span></span>
            <span aria-hidden className={`text-ink-400 transition ${showDay ? "rotate-180" : ""}`}>▾</span>
          </button>
          <ul className={showDay ? "mt-3 divide-y divide-stone-100" : "hidden"}>
            {books.map((b) => (
              <li key={b.id} className="py-2.5">
                <p className="text-sm font-semibold">{b.title} <span className="font-normal text-ink-500">({b.language})</span></p>
                <div className="mt-1.5 flex flex-wrap gap-4">
                  <div>
                    <p className="mb-1 text-xs text-ink-500">Returned to Dham</p>
                    <Stepper
                      name={`returned_${b.id}`}
                      value={day[b.id]?.returned ?? 0}
                      onChange={(n) => setDay((d) => ({ ...d, [b.id]: { returned: n, damaged: d[b.id]?.damaged ?? 0 } }))}
                      max={Math.max(left(b) + (day[b.id]?.returned ?? 0), 0)}
                      label={`${b.title} (${b.language}) returned`}
                    />
                  </div>
                  <div>
                    <p className="mb-1 text-xs text-ink-500">Damaged / lost</p>
                    <Stepper
                      name={`damaged_${b.id}`}
                      value={day[b.id]?.damaged ?? 0}
                      onChange={(n) => setDay((d) => ({ ...d, [b.id]: { damaged: n, returned: d[b.id]?.returned ?? 0 } }))}
                      max={Math.max(left(b) + (day[b.id]?.damaged ?? 0), 0)}
                      label={`${b.title} (${b.language}) damaged`}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Money: optional */}
        <section className="space-y-3 rounded-3xl border border-stone-200/80 bg-white p-4">
          {!showMoney ? (
            <button type="button" className="tap w-full text-left text-sm text-ink-700" onClick={() => { setShowMoney(true); setCollected(String(totals.amount / 100)); }}>
              💰 Money collected: <b>{rupees(totals.amount)}</b> (same as sales). <span className="font-semibold text-brand-700 underline">Change</span>
            </button>
          ) : (
            <div className="space-y-1.5">
              <label htmlFor="collected" className="text-sm font-semibold">Money collected today (₹) <span className="font-normal text-ink-500">— optional</span></label>
              <input id="collected" name="collected" inputMode="decimal" value={collected} onChange={(e) => setCollected(e.target.value)} placeholder="Leave empty = same as sales" className="field-input text-lg font-bold" />
            </div>
          )}
          <div className="space-y-1.5">
            <label htmlFor="remarks" className="text-sm font-semibold">Note <span className="font-normal text-ink-500">(optional)</span></label>
            <textarea id="remarks" name="remarks" rows={2} defaultValue={initRemarks} className={`field-input ${state.fieldErrors?.remarks ? "border-red-500" : ""}`} placeholder="e.g. Rain in the evening, a donation of ₹100" />
            {state.fieldErrors?.remarks && <p className="text-sm font-medium text-red-700">{state.fieldErrors.remarks}</p>}
          </div>
        </section>

        {/* Sticky totals + send */}
        <div className="sticky bottom-20 z-10 rounded-3xl bg-gradient-to-r from-navy-900 to-navy-800 p-3 text-white shadow-2xl lg:bottom-4">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1 pl-1">
              <p className="text-xs text-white/70">{venues.length} place{venues.length === 1 ? "" : "s"} · {totals.qty} book{totals.qty === 1 ? "" : "s"}</p>
              <p className="font-display text-2xl font-extrabold tabular-nums">{rupees(totals.amount)}</p>
            </div>
            <SubmitButton name="intent" value="submit" className="min-h-14 shrink-0 px-6 text-lg" pending="Sending…">
              Send ✓
            </SubmitButton>
          </div>
        </div>
        <div className="flex justify-center">
          <SubmitButton name="intent" value="draft" variant="secondary" size="sm" pending="Saving…">
            Save without sending
          </SubmitButton>
        </div>
      </form>
    </PendingProvider>
  );
}
