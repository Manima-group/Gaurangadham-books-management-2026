"use client";

import { changePasswordAction } from "@/app/actions/auth";
import { ActionForm, SubmitButton } from "@/components/client";
import { Field } from "@/components/ui";

export function PasswordForm() {
  return (
    <ActionForm action={changePasswordAction}>
      {(s) => (
        <>
          <Field label="Current password" htmlFor="current" error={s.fieldErrors?.current}><input id="current" name="current" type="password" className="field-input" autoComplete="current-password" /></Field>
          <Field label="New password" htmlFor="next" error={s.fieldErrors?.next} help="At least 6 characters."><input id="next" name="next" type="password" className="field-input" autoComplete="new-password" /></Field>
          <Field label="Type the new password again" htmlFor="confirm" error={s.fieldErrors?.confirm}><input id="confirm" name="confirm" type="password" className="field-input" autoComplete="new-password" /></Field>
          <SubmitButton>Change Password</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
