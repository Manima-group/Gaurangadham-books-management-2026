"use client";

import { addDham, updateDham } from "@/app/actions/setup";
import { ActionForm, SubmitButton } from "@/components/client";
import { Field } from "@/components/ui";

export function DhamForm({ dham }: { dham?: { id: number; name: string; city: string | null; address: string | null } }) {
  return (
    <ActionForm action={dham ? updateDham : addDham} resetOnSuccess={!dham}>
      {(s) => (
        <>
          {dham && <input type="hidden" name="id" value={dham.id} />}
          <Field label="Dham name" htmlFor={`name-${dham?.id ?? "new"}`} error={s.fieldErrors?.name} help="e.g. Hyderabad Dham">
            <input id={`name-${dham?.id ?? "new"}`} name="name" defaultValue={dham?.name} className="field-input" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="City" htmlFor={`city-${dham?.id ?? "new"}`} optional><input id={`city-${dham?.id ?? "new"}`} name="city" defaultValue={dham?.city ?? ""} className="field-input" /></Field>
            <Field label="Address or area" htmlFor={`addr-${dham?.id ?? "new"}`} optional><input id={`addr-${dham?.id ?? "new"}`} name="address" defaultValue={dham?.address ?? ""} className="field-input" /></Field>
          </div>
          <SubmitButton>{dham ? "Save Changes" : "Add Dham"}</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
