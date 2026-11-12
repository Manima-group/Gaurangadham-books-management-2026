"use client";

import { loginAction } from "@/app/actions/auth";
import { ActionForm, SubmitButton } from "@/components/client";
import { Field } from "@/components/ui";

export function LoginForm() {
  return (
    <ActionForm action={loginAction} resetOnSuccess={false}>
      {(s) => (
        <>
          <Field label="Mobile number or email" htmlFor="identifier" error={s.fieldErrors?.identifier}>
            <input id="identifier" name="identifier" className="field-input" autoComplete="username" placeholder="e.g. 98765 43210" required />
          </Field>
          <Field label="Password" htmlFor="password" error={s.fieldErrors?.password}>
            <input id="password" name="password" type="password" className="field-input" autoComplete="current-password" required />
          </Field>
          <SubmitButton className="w-full" pending="Logging in…">
            Log in
          </SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
