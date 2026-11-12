"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { ActionState } from "@/lib/action";
import { ActionMessage, PendingProvider, SubmitButton, useFormAction } from "./client";
import { BookCover } from "./ui";

export type AllocBook = { id: number; title: string; language: string; available: number; coverUrl?: string | null };

/**
 * Multi-book quantity form with a review step:
 *   1. enter quantities  →  2. review what will change  →  3. confirm.
 */
export function AllocationForm({
  action,
  books,
  hidden,
  sourceLabel,
  targetLabel,
  verb,
  confirmLabel,
  extra,
  emptyText,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  books: AllocBook[];
  hidden: Record<string, string>;
  sourceLabel: string;
  targetLabel: string;
  verb: string; // e.g. "give", "send"
  confirmLabel: string;
  extra?: ReactNode;
  emptyText?: ReactNode;
}) {
  const { state, onSubmit, pending } = useFormAction(action);
  const [qty, setQty] = useState<Record<number, string>>({});
  const [step, setStep] = useState<"enter" | "review">("enter");
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (state.status === "success") {
      setQty({});
      setStep("enter");
    } else if (state.status === "error") setStep("enter");
  }, [state.at, state.status]);

  const chosen = books
    .map((b) => ({ ...b, n: parseInt(qty[b.id] || "0", 10) || 0 }))
    .filter((b) => b.n > 0);
  const over = chosen.filter((b) => b.n > b.available);
  const totalQty = chosen.reduce((a, b) => a + b.n, 0);
  const shown = books.filter((b) => !filter || `${b.title} ${b.language}`.toLowerCase().includes(filter.toLowerCase()));

  if (books.length === 0) return <div className="space-y-4"><ActionMessage state={state} />{emptyText}</div>;

  return (
    <PendingProvider pending={pending}>
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <ActionMessage state={state} />

      <ol className="flex gap-2 text-xs font-semibold" aria-label="Progress">
        <li className={`flex-1 rounded-full px-3 py-1.5 text-center ${step === "enter" ? "bg-brand-600 text-white" : "bg-emerald-100 text-emerald-800"}`}>1. Enter quantities</li>
        <li className={`flex-1 rounded-full px-3 py-1.5 text-center ${step === "review" ? "bg-brand-600 text-white" : "bg-stone-100 text-ink-500"}`}>2. Review &amp; confirm</li>
      </ol>

      <div className={step === "enter" ? "space-y-4" : "hidden"}>
        {books.length > 6 && (
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="🔍 Search books" className="field-input" aria-label="Search books" />
        )}
        <ul className="divide-y divide-stone-100 rounded-2xl border border-stone-200 bg-white">
          {books.map((b) => {
            const n = parseInt(qty[b.id] || "0", 10) || 0;
            const err = state.fieldErrors?.[`qty_${b.id}`] ?? (n > b.available ? `Only ${b.available} available` : undefined);
            return (
              <li key={b.id} className={`flex items-center gap-3 p-3 ${shown.includes(b) ? "" : "hidden"}`}>
                <BookCover title={b.title} url={b.coverUrl} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium leading-snug">{b.title}</p>
                  <p className="text-xs text-ink-500">{b.language} · <span className="font-semibold">{b.available}</span> available</p>
                  {err && <p className="text-xs font-semibold text-red-700">{err}</p>}
                </div>
                <input
                  name={`qty_${b.id}`}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  aria-label={`Copies of ${b.title} (${b.language})`}
                  placeholder="0"
                  value={qty[b.id] ?? ""}
                  onChange={(e) => setQty((q) => ({ ...q, [b.id]: e.target.value.replace(/\D/g, "") }))}
                  className={`h-12 w-20 rounded-xl border text-center text-lg font-bold tabular-nums focus:outline-none focus:ring-4 ${err ? "border-red-500 bg-red-50 focus:ring-red-100" : "border-stone-300 focus:border-brand-500 focus:ring-brand-100"}`}
                />
              </li>
            );
          })}
        </ul>
        {extra}
        <button
          type="button"
          className="btn-primary w-full sm:w-auto"
          disabled={totalQty === 0 || over.length > 0}
          onClick={() => setStep("review")}
        >
          Review {totalQty > 0 ? `${totalQty} books` : ""} →
        </button>
        {totalQty === 0 && <p className="text-sm text-ink-500">Type a quantity next to at least one book.</p>}
      </div>

      {step === "review" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-brand-200 bg-brand-50/60 p-4">
            <p className="font-semibold">
              You are about to {verb} <span className="text-brand-800">{totalQty} books</span> from {sourceLabel} to{" "}
              <span className="text-brand-800">{targetLabel}</span>.
            </p>
            <ul className="mt-3 divide-y divide-stone-100 rounded-xl bg-white px-3">
              {chosen.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="font-medium leading-snug">{b.title} <span className="text-ink-500">({b.language})</span></p>
                    <p className="text-xs text-ink-500">{b.available - b.n} will be left in {sourceLabel}</p>
                  </div>
                  <span className="font-display text-xl font-extrabold tabular-nums">{b.n}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <button type="button" className="btn-secondary" onClick={() => setStep("enter")}>← Change quantities</button>
            <SubmitButton pending="Saving…">{confirmLabel}</SubmitButton>
          </div>
        </div>
      )}
    </form>
    </PendingProvider>
  );
}
