"use client";

import { registerDevotee } from "@/app/actions/registration";
import { ActionForm, SubmitButton } from "@/components/client";
import { Field } from "@/components/ui";

export function RegisterForm({ token }: { token: string }) {
  return (
    <ActionForm action={registerDevotee} resetOnSuccess={false}>
      {(s) => (
        <>
          <input type="hidden" name="token" value={token} />
          <Field label="Full name" htmlFor="name" error={s.fieldErrors?.name}>
            <input id="name" name="name" autoComplete="name" className="field-input" />
          </Field>
          <Field label="Mobile number" htmlFor="phone" error={s.fieldErrors?.phone} help="You will log in with this number.">
            <input id="phone" name="phone" inputMode="tel" autoComplete="tel" className="field-input" placeholder="98765 43210" />
          </Field>
          <Field label="Choose a password" htmlFor="password" error={s.fieldErrors?.password} help="At least 6 characters.">
            <input id="password" name="password" type="password" autoComplete="new-password" className="field-input" />
          </Field>
          <Field label="Type the password again" htmlFor="confirm" error={s.fieldErrors?.confirm}>
            <input id="confirm" name="confirm" type="password" autoComplete="new-password" className="field-input" />
          </Field>
          <label className="flex items-start gap-3 rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm text-ink-700">
            <input type="checkbox" name="consent" className="mt-0.5 h-5 w-5 accent-brand-600" />
            <span>I agree that my name and mobile number are kept in this app for book distribution seva and shared only with my Sector Sevak and Chakra Sevaks.</span>
          </label>
          {s.fieldErrors?.consent && <p className="text-sm font-medium text-red-700">{s.fieldErrors.consent}</p>}
          <SubmitButton className="w-full min-h-14 text-lg" pending="Registering…">Register</SubmitButton>
          <p className="text-center text-xs text-ink-500">After registering you can log in at once. Your Sector Sevak approves you and turns on what you need.</p>
        </>
      )}
    </ActionForm>
  );
}
