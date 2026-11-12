"use client";

import { useState } from "react";
import { reviewReport } from "@/app/actions/reports";
import { ActionForm, SubmitButton } from "@/components/client";

export function ReviewForm({ id, hasDifference }: { id: number; hasDifference: boolean }) {
  const [mode, setMode] = useState<"" | "correction" | "reject">("");
  return (
    <ActionForm action={reviewReport} hideOnSuccess resetOnSuccess={false}>
      {(s) => (
        <>
          <input type="hidden" name="id" value={id} />
          {hasDifference && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
              ⚠ Please check the differences highlighted above before approving.
            </p>
          )}
          {mode && (
            <div className="space-y-1.5">
              <label htmlFor="note" className="text-sm font-semibold">
                {mode === "reject" ? "Reason for rejecting" : "What needs to be corrected?"} <span className="text-red-700">*</span>
              </label>
              <textarea id="note" name="note" rows={3} className={`field-input ${s.fieldErrors?.note ? "border-red-500" : ""}`} placeholder={mode === "reject" ? "e.g. This report was sent twice by mistake" : "e.g. Please check the Gita count — I gave you only 10"} autoFocus />
              <p className="text-xs text-ink-500">The devotee will see this note.</p>
              {s.fieldErrors?.note && <p className="text-sm font-medium text-red-700">{s.fieldErrors.note}</p>}
            </div>
          )}
          <div className="grid gap-2">
            {mode === "" ? (
              <>
                <SubmitButton name="decision" value="approve" variant="success" pending="Approving…">✓ Approve Report</SubmitButton>
                <button type="button" className="btn-warn" onClick={() => setMode("correction")}>↩ Request Correction</button>
                <button type="button" className="btn-secondary text-red-700" onClick={() => setMode("reject")}>✕ Reject Report</button>
              </>
            ) : (
              <>
                <SubmitButton name="decision" value={mode} variant={mode === "reject" ? "danger" : "warn"} pending="Sending…">
                  {mode === "reject" ? "Reject Report" : "Send Back for Correction"}
                </SubmitButton>
                <button type="button" className="btn-secondary" onClick={() => setMode("")}>Cancel</button>
              </>
            )}
          </div>
          {mode === "" && <p className="text-xs text-ink-500">Approving marks the books as sold and updates stock. Request Correction lets the devotee fix and resend the report.</p>}
        </>
      )}
    </ActionForm>
  );
}
