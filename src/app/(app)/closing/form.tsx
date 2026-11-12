"use client";

import { closeDay } from "@/app/actions/closing";
import { ActionForm, SubmitButton } from "@/components/client";
import { Field } from "@/components/ui";

export function CloseDayForm({ dhamId, date, needsNote }: { dhamId: number; date: string; needsNote: boolean }) {
  return (
    <ActionForm action={closeDay} hideOnSuccess resetOnSuccess={false}>
      {(s) => (
        <>
          <input type="hidden" name="dhamId" value={dhamId} />
          <input type="hidden" name="date" value={date} />
          <Field
            label={needsNote ? "Explain the differences" : "Closing note"}
            htmlFor="note"
            optional={!needsNote}
            error={s.fieldErrors?.note}
            help={needsNote ? "Required. Figures are never adjusted automatically — your explanation is saved with the day's record and shared with the Admin." : undefined}
          >
            <textarea id="note" name="note" rows={3} className="field-input" />
          </Field>
          <SubmitButton pending="Closing…">🔒 Close This Day</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
