"use client";

import { useState } from "react";
import { submitMoney } from "@/app/actions/money";
import { offlineCapable } from "@/lib/offline-queue";
import { ActionForm, SubmitButton } from "@/components/client";
import { Field } from "@/components/ui";

export function MoneyForm({ today, remaining, userId }: { today: string; remaining: number; userId: string }) {
  const [method, setMethod] = useState("cash");
  const [action] = useState(() =>
    offlineCapable(submitMoney, {
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
          <Field label="Amount you are submitting (₹)" htmlFor="amount" error={s.fieldErrors?.amount} help={`You can submit all or part of ₹${(remaining / 100).toLocaleString("en-IN")}.`}>
            <input id="amount" name="amount" inputMode="decimal" defaultValue={remaining > 0 ? String(remaining / 100) : ""} className="field-input text-lg font-bold" />
          </Field>
          <fieldset>
            <legend className="mb-1.5 text-sm font-semibold">How are you submitting it?</legend>
            <div className="grid grid-cols-3 gap-2">
              {[
                ["cash", "💵 Cash"],
                ["upi", "📱 UPI"],
                ["bank", "🏦 Bank"],
              ].map(([v, l]) => (
                <label key={v} className={`flex min-h-12 cursor-pointer items-center justify-center rounded-xl border text-sm font-semibold ${method === v ? "border-brand-500 bg-brand-50 text-brand-800 ring-2 ring-brand-200" : "border-stone-300 bg-white"}`}>
                  <input type="radio" name="method" value={v} checked={method === v} onChange={() => setMethod(v)} className="sr-only" />
                  {l}
                </label>
              ))}
            </div>
            {s.fieldErrors?.method && <p className="mt-1 text-sm text-red-700">{s.fieldErrors.method}</p>}
          </fieldset>
          {method !== "cash" && (
            <Field label="Transaction / UTR number" htmlFor="reference" error={s.fieldErrors?.reference} help="You'll find this in your UPI app or bank message after paying.">
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
          <p className="text-center text-xs text-ink-500">Your Dham Manager will confirm once they receive this money.</p>
        </>
      )}
    </ActionForm>
  );
}
