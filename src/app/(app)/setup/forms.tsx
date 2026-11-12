"use client";

import { saveOrganization } from "@/app/actions/setup";
import { ActionForm, SubmitButton } from "@/components/client";
import { Field } from "@/components/ui";

export function OrgForm({ org }: { org?: { name: string; city: string | null; contactPhone: string | null } }) {
  return (
    <ActionForm action={saveOrganization} resetOnSuccess={false}>
      {(s) => (
        <>
          <Field label="Organisation name" htmlFor="name" error={s.fieldErrors?.name} help="Shown at the top of every page.">
            <input id="name" name="name" defaultValue={org?.name} className="field-input" placeholder="e.g. Gaurangadham Book Distribution" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="City" htmlFor="city" optional><input id="city" name="city" defaultValue={org?.city ?? ""} className="field-input" /></Field>
            <Field label="Contact phone" htmlFor="contactPhone" optional><input id="contactPhone" name="contactPhone" inputMode="tel" defaultValue={org?.contactPhone ?? ""} className="field-input" /></Field>
          </div>
          <SubmitButton>Save Changes</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
