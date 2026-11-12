"use client";

import { addDrive, updateDrive } from "@/app/actions/setup";
import { ActionForm, SubmitButton } from "@/components/client";
import { Field } from "@/components/ui";

type Drive = { id: number; name: string; description: string | null; dhamId: number | null; startDate: string; endDate: string | null };

export function DriveForm({ dhams, today, drive }: { dhams: { id: number; name: string }[]; today: string; drive?: Drive }) {
  const k = drive?.id ?? "new";
  return (
    <ActionForm action={drive ? updateDrive : addDrive} resetOnSuccess={!drive}>
      {(s) => (
        <>
          {drive && <input type="hidden" name="id" value={drive.id} />}
          <Field label="Drive name" htmlFor={`dn-${k}`} error={s.fieldErrors?.name} help={drive ? undefined : "e.g. Kartik Book Marathon 2026"}>
            <input id={`dn-${k}`} name="name" defaultValue={drive?.name} className="field-input" />
          </Field>
          <Field label="Which Dhams?" htmlFor={`dd-${k}`} help={drive ? undefined : "Choose “All Dhams” for an organisation-wide drive."}>
            <select id={`dd-${k}`} name="dhamId" defaultValue={drive?.dhamId ?? ""} className="field-input">
              <option value="">All Dhams</option>
              {dhams.map((d) => <option key={d.id} value={d.id}>{d.name} only</option>)}
            </select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Start date" htmlFor={`ds-${k}`} error={s.fieldErrors?.startDate}><input id={`ds-${k}`} type="date" name="startDate" defaultValue={drive?.startDate ?? today} className="field-input" /></Field>
            <Field label="End date" htmlFor={`de-${k}`} optional error={s.fieldErrors?.endDate}><input id={`de-${k}`} type="date" name="endDate" defaultValue={drive?.endDate ?? ""} className="field-input" /></Field>
          </div>
          <Field label="Description" htmlFor={`dx-${k}`} optional><textarea id={`dx-${k}`} name="description" rows={2} defaultValue={drive?.description ?? ""} className="field-input" /></Field>
          <SubmitButton size={drive ? "sm" : undefined}>{drive ? "Save Changes" : "Create Distribution Drive"}</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
