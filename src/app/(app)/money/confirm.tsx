"use client";

import { useState } from "react";
import { confirmMoney } from "@/app/actions/money";
import { ActionForm, SubmitButton } from "@/components/client";

export function ConfirmMoney({ id }: { id: number }) {
  const [dispute, setDispute] = useState(false);
  return (
    <ActionForm action={confirmMoney} hideOnSuccess resetOnSuccess={false} className="space-y-2">
      {(s) => (
        <>
          <input type="hidden" name="id" value={id} />
          {dispute && (
            <>
              <input name="note" className={`field-input py-2 text-sm ${s.fieldErrors?.note ? "border-red-500" : ""}`} placeholder="What doesn't match? e.g. Received ₹1,800, not ₹2,000" autoFocus />
              {s.fieldErrors?.note && <p className="text-xs text-red-700">{s.fieldErrors.note}</p>}
            </>
          )}
          <div className="flex flex-wrap gap-2">
            {!dispute ? (
              <>
                <SubmitButton name="decision" value="receive" variant="success" size="sm" pending="Saving…">✓ Mark as Received</SubmitButton>
                <button type="button" className="btn-secondary btn-sm" onClick={() => setDispute(true)}>Doesn't match</button>
              </>
            ) : (
              <>
                <SubmitButton name="decision" value="dispute" variant="warn" size="sm" pending="Saving…">Send Back to Devotee</SubmitButton>
                <button type="button" className="btn-secondary btn-sm" onClick={() => setDispute(false)}>Cancel</button>
              </>
            )}
          </div>
        </>
      )}
    </ActionForm>
  );
}
