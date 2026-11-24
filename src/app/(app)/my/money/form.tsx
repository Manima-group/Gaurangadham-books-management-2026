"use client";

import { useState } from "react";
import { submitMoney } from "@/app/actions/money";
import { offlineCapable } from "@/lib/offline-queue";
import { ActionForm, SubmitButton } from "@/components/client";
import { Field } from "@/components/ui";

export function MoneyForm({ today, remaining, userId, stalls = [] }: { today: string; remaining: number; userId: string; stalls?: { id: number; name: string }[] }) {
  const [method, setMethod] = useState("cash");
  // One key per filled form: a double tap or an offline replay is saved once.
  const [key, setKey] = useState(() => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now()) + Math.random()));
  const [action] = useState(() =>
    offlineCapable(async (st: Parameters<typeof submitMoney>[0], fd: FormData) => { const r = await submitMoney(st, fd); if (r.status === "success") setKey(crypto.randomUUID()); return r; }, {
      kind: "money",
      userId,
      label: (fd) => `₹${fd.get("amount")} money submission`,
      link: () => "/my/money",
    }),
  );
  return (
    <ActionForm action={action}>
      {(s) => (
        <>
          <input type="hidden" name="clientKey" value={key} />
          <Field label="Amount you are submitting (₹)" htmlFor="amount" error={s.fieldErrors?.amount} help={`You can submit all or part of ₹${(remaining / 100).toLocaleString("en-IN")}.`}>
            <input id="amount" name="amount" inputMode="decimal" defaultValue={remaining > 0 ? String(remaining / 100) : ""} className="field-input text-lg font-bold" />
          </Field>
          <fieldset>
            <legend className="mb-1.5 text-sm font-semibold">How are you submitting it?</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["cash", "💵 Cash"],
                ["upi", "📱 UPI"],
                ["split", "💵+📱 Both"],
                ["bank", "🏦 Bank"],
              ].map(([v, l]) => (
                <label key={v} className={`flex min-h-12 cursor-pointer items-center justify-center rounded-xl border text-sm font-semibold ${method === v ? "border-brand-500 bg-brand-50 text-brand-800 ring-2 ring-brand-200" : "border-stone-300 bg-white"}`}>
                  <input type="radio" name="method" value={v} checked={method === v} onChange={() => setMethod(v)} className="sr-only" data-testid={`method-${v}`} />
                  {l}
                </label>
              ))}
            </div>
            {s.fieldErrors?.method && <p className="mt-1 text-sm text-red-700">{s.fieldErrors.method}</p>}
          </fieldset>
          {method === "split" && (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Cash part (₹)" htmlFor="cashPart" error={s.fieldErrors?.cashPart}><input id="cashPart" name="cashPart" inputMode="decimal" className="field-input" /></Field>
              <Field label="UPI part (₹)" htmlFor="upiPart"><input id="upiPart" name="upiPart" inputMode="decimal" className="field-input" /></Field>
            </div>
          )}
          {stalls.length > 0 && (
            <Field label="For a Shared Book Stall?" htmlFor="stallId" optional help="Choose the stall if this money was collected there.">
              <select id="stallId" name="stallId" className="field-input" defaultValue=""><option value="">No — my own distribution</option>{stalls.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
            </Field>
          )}
          {method !== "cash" && (
            <Field label="Transaction / UTR number" htmlFor="reference" optional error={s.fieldErrors?.reference} help="Optional. You'll find this in your UPI app or bank message after paying.">
              <input id="reference" name="reference" className="field-input" autoComplete="off" />
            </Field>
          )}
          <Field label="Date" htmlFor="submissionDate" error={s.fieldErrors?.submissionDate}>
            <input id="submissionDate" type="date" name="submissionDate" defaultValue={today} max={today} className="field-input" />
          </Field>
          <Field label="Remarks" htmlFor="remarks" optional>
            <input id="remarks" name="remarks" className="field-input" placeholder="e.g. Handed over to Madhava Prabhu" />
          </Field>
          <SubmitButton className="w-full min-h-14 text-lg" pending="Submitting…">Submit Money</SubmitButton>
          <p className="text-center text-xs text-ink-500">Your Sector Sevak will confirm once they receive this money.</p>
        </>
      )}
    </ActionForm>
  );
}
