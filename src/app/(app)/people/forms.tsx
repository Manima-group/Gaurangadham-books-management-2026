"use client";

import { useEffect, useState } from "react";
import { addPerson, resetPassword, updatePerson } from "@/app/actions/setup";
import { ActionForm, SubmitButton } from "@/components/client";
import { Field } from "@/components/ui";

function suggest() {
  const words = ["krishna", "govinda", "madhava", "keshava", "radha", "gopal"];
  return words[Math.floor(Math.random() * words.length)] + (100 + Math.floor(Math.random() * 900));
}

export function PersonForm({ role, dhams, isAdmin }: { role: string; dhams: { id: number; name: string }[]; isAdmin: boolean }) {
  const [r, setR] = useState(role);
  // Suggest a password only in the browser (a random value during server render would not match)
  const [pw, setPw] = useState("");
  useEffect(() => setPw(suggest()), []);
  return (
    <ActionForm action={async (s, fd) => { const res = await addPerson(s, fd); if (res.status === "success") setPw(suggest()); return res; }}>
      {(s) => (
        <>
          {isAdmin ? (
            <Field label="Role" htmlFor="role" help={r === "manager" ? "Runs one Dham: receives books, gives them to devotees, reviews reports." : r === "admin" ? "Sees and manages everything." : r === "contact" ? "Only collects contacts of interested people at book tables and programmes. Sees nothing about books or money." : "Distributes books and reports daily sales from their phone."}>
              <select id="role" name="role" value={r} onChange={(e) => setR(e.target.value)} className="field-input">
                <option value="devotee">Devotee</option>
                <option value="manager">Sector Sevak</option>
                <option value="admin">Chakra Sevak</option>
                <option value="contact">Contact Collection Sevak</option>
              </select>
            </Field>
          ) : (
            <Field label="Add as" htmlFor="role" help={r === "manager" ? "A Co-Sevak helps you run this Dham. They get the same screens as you and show a Co-Sevak badge." : r === "contact" ? "Only collects contacts of interested people at book tables and programmes. Sees nothing about books or money." : "Distributes books and reports daily sales from their phone."}>
              <select id="role" name="role" value={r} onChange={(e) => setR(e.target.value)} className="field-input">
                <option value="devotee">Devotee</option>
                <option value="manager">Sector Sevak (Co-Sevak)</option>
                <option value="contact">Contact Collection Sevak</option>
              </select>
            </Field>
          )}
          <Field label="Full name" htmlFor="pname" error={s.fieldErrors?.name}>
            <input id="pname" name="name" className="field-input" autoComplete="off" />
          </Field>
          <Field label="Mobile number" htmlFor="phone" error={s.fieldErrors?.phone} help="They will log in with this number.">
            <input id="phone" name="phone" inputMode="tel" className="field-input" placeholder="10-digit number" autoComplete="off" />
          </Field>
          {isAdmin && r !== "admin" && (
            <Field label="Dham" htmlFor="dhamId" error={s.fieldErrors?.dhamId}>
              <select id="dhamId" name="dhamId" className="field-input" defaultValue="">
                <option value="">Choose a Dham…</option>
                {dhams.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
          )}
          <Field label="Email" htmlFor="email" optional error={s.fieldErrors?.email} help="Not required. They can also log in with email if you add one.">
            <input id="email" name="email" type="email" className="field-input" autoComplete="off" />
          </Field>
          <Field label="Starting password" htmlFor="password" error={s.fieldErrors?.password} help="Share this with them personally. They can change it later in My Account.">
            <input id="password" name="password" value={pw} onChange={(e) => setPw(e.target.value)} className="field-input font-mono" autoComplete="off" />
          </Field>
          {isAdmin && r === "manager" && (
            <label className="flex items-center gap-3 text-sm">
              <input type="checkbox" name="coSevak" className="h-9 w-9 shrink-0 accent-brand-600" />
              <span><b>Co-Sevak</b> — an extra Sector Sevak who helps maintain this Dham (shown with a badge).</span>
            </label>
          )}
          {isAdmin && r === "admin" && (
            <p className="rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet-900">A Chakra Sevak you add is shown as <b>Co-Sevak</b>, so everyone can tell the main Chakra Sevak apart.</p>
          )}
          {isAdmin && r !== "admin" && (
            <label className="flex items-center gap-3 text-sm">
              <input type="checkbox" name="canSeeAvailability" className="h-9 w-9 shrink-0 accent-brand-600" />
              <span><b>Can see Book Availability</b> in all Dhams (which Dham and which devotee has each book, with mobile numbers).</span>
            </label>
          )}
          <SubmitButton>{r === "manager" ? "Add Sector Sevak" : r === "admin" ? "Add Chakra Sevak" : r === "contact" ? "Add Contact Collection Sevak" : "Add Devotee"}</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function ResetPasswordForm({ id }: { id: string }) {
  return (
    <ActionForm action={resetPassword} className="flex flex-wrap items-start gap-2">
      {(s) => (
        <>
          <input type="hidden" name="id" value={id} />
          <div>
            <input name="password" aria-label="New password" placeholder="New password (6+ characters)" className="field-input py-2 text-sm" autoComplete="off" />
            {s.fieldErrors?.password && <p className="text-xs text-red-700">{s.fieldErrors.password}</p>}
          </div>
          <SubmitButton variant="secondary" size="sm">Reset Password</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function EditPersonForm({
  p,
  dhams,
  isAdmin,
}: {
  p: { id: string; name: string; phone: string | null; email: string; role: string; dhamId: number | null };
  dhams: { id: number; name: string }[];
  isAdmin: boolean;
}) {
  const [r, setR] = useState(p.role);
  return (
    <ActionForm action={updatePerson} resetOnSuccess={false}>
      {(s) => (
        <>
          <input type="hidden" name="id" value={p.id} />
          <Field label="Full name" htmlFor={`n-${p.id}`} error={s.fieldErrors?.name}>
            <input id={`n-${p.id}`} name="name" defaultValue={p.name} className="field-input" />
          </Field>
          <Field label="Mobile number (for login)" htmlFor={`ph-${p.id}`} error={s.fieldErrors?.phone}>
            <input id={`ph-${p.id}`} name="phone" inputMode="tel" defaultValue={p.phone ?? ""} className="field-input" />
          </Field>
          <Field label="Email" htmlFor={`e-${p.id}`} optional error={s.fieldErrors?.email}>
            <input id={`e-${p.id}`} name="email" type="email" defaultValue={p.email.endsWith(".local") ? "" : p.email} className="field-input" />
          </Field>
          {isAdmin && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Role" htmlFor={`r-${p.id}`}>
                <select id={`r-${p.id}`} name="role" value={r} onChange={(e) => setR(e.target.value)} className="field-input">
                  <option value="devotee">Devotee</option>
                  <option value="manager">Sector Sevak</option>
                  <option value="admin">Chakra Sevak</option>
                  <option value="contact">Contact Collection Sevak</option>
                </select>
              </Field>
              {r !== "admin" && (
                <Field label="Dham" htmlFor={`d-${p.id}`} error={s.fieldErrors?.dhamId}>
                  <select id={`d-${p.id}`} name="dhamId" defaultValue={p.dhamId ?? ""} className="field-input">
                    <option value="">Choose…</option>
                    {dhams.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </Field>
              )}
            </div>
          )}
          <SubmitButton size="sm">Save Changes</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
