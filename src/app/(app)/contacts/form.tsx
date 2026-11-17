"use client";

import { useEffect, useState } from "react";
import { ActionForm, SubmitButton } from "@/components/client";
import type { ActionState } from "@/lib/action";
import { addContact, addEvent, updateContact } from "@/app/actions/outreach";

const err = "mt-1 block text-sm font-medium text-red-700";
type Interest = { key: string; label: string; icon: string };
export type ContactValues = {
  id?: number; fullName?: string; mobile?: string; altMobile?: string | null; area?: string; city?: string | null; email?: string | null;
  ageGroup?: string | null; language?: string | null; contactTime?: string | null; location?: string | null; remarks?: string | null;
  childName?: string | null; eventId?: number | null; interests?: string[];
};

const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

/** A fresh one-time key after every successful save, so a double tap never saves twice but the next person can be added. */
function KeyRefresh({ s, onNew }: { s: ActionState; onNew: () => void }) {
  useEffect(() => {
    if (s.status === "success") onNew();
  }, [s.at, s.status, onNew]);
  return null;
}

export function ContactForm({
  interests, ageGroups, events, values, edit,
}: { interests: readonly Interest[]; ageGroups: string[]; events: { id: number; name: string }[]; values?: ContactValues; edit?: boolean }) {
  const [key, setKey] = useState(newKey);
  const [picked, setPicked] = useState<string[]>(values?.interests ?? []);
  const kids = picked.includes("childrens_club");
  const toggle = (k: string) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  return (
    <ActionForm action={edit ? updateContact : addContact} resetOnSuccess={!edit}>
      {(s) => (
        <>
          <KeyRefresh s={s} onNew={() => { if (!edit) { setKey(newKey()); setPicked([]); } }} />
          <input type="hidden" name="clientKey" value={key} />
          {values?.id && <input type="hidden" name="id" value={values.id} />}

          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-ink-900">Interested in <span className="font-normal text-ink-500">(choose all that apply)</span></legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {interests.map((i) => (
                <label key={i.key} className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition ${picked.includes(i.key) ? "border-brand-500 bg-brand-50 text-brand-800" : "border-stone-200 bg-white text-ink-800 hover:border-stone-300"}`}>
                  <input type="checkbox" name="interests" value={i.key} checked={picked.includes(i.key)} onChange={() => toggle(i.key)} className="h-5 w-5 shrink-0 accent-brand-600" data-testid={`interest-${i.key}`} />
                  <span aria-hidden>{i.icon}</span> {i.label}
                </label>
              ))}
            </div>
            {s.fieldErrors?.interests && <span className={err}>{s.fieldErrors.interests}</span>}
          </fieldset>

          <label className="block text-sm font-semibold text-ink-900">
            {kids ? "Parent / guardian's full name" : "Full name"}
            <input name="fullName" defaultValue={values?.fullName} autoComplete="off" className="field-input mt-1" data-testid="c-name" />
            {kids && <span className="mt-1 block text-xs font-normal text-ink-500">For Children's Club we keep the parent or guardian's details, not the child's.</span>}
            {s.fieldErrors?.fullName && <span className={err}>{s.fieldErrors.fullName}</span>}
          </label>
          {kids && (
            <label className="block text-sm font-semibold text-ink-900">
              Child's first name <span className="font-normal text-ink-500">(optional)</span>
              <input name="childName" defaultValue={values?.childName ?? ""} maxLength={40} autoComplete="off" className="field-input mt-1" />
            </label>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-ink-900">
              Mobile number
              <input name="mobile" defaultValue={values?.mobile} inputMode="tel" placeholder="10-digit mobile" autoComplete="off" className="field-input mt-1" data-testid="c-mobile" />
              {s.fieldErrors?.mobile && <span className={err}>{s.fieldErrors.mobile}</span>}
            </label>
            <label className="block text-sm font-semibold text-ink-900">
              Address / area
              <input name="area" defaultValue={values?.area} placeholder="e.g. Kukatpally, near metro" autoComplete="off" className="field-input mt-1" data-testid="c-area" />
              {s.fieldErrors?.area && <span className={err}>{s.fieldErrors.area}</span>}
            </label>
          </div>
          {events.length > 0 && (
            <label className="block text-sm font-semibold text-ink-900">
              Event <span className="font-normal text-ink-500">(optional)</span>
              <select name="eventId" defaultValue={values?.eventId ?? ""} className="field-input mt-1">
                <option value="">Not at a listed event</option>
                {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </label>
          )}

          <details className="group rounded-xl border border-stone-200 [&_summary::-webkit-details-marker]:hidden" open={!!(values?.email || values?.altMobile || values?.remarks)}>
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-3 text-sm font-semibold text-ink-700">
              More details (optional)
              <span aria-hidden className="transition group-open:rotate-180">▾</span>
            </summary>
            <div className="grid gap-3 border-t border-stone-100 p-3 sm:grid-cols-2">
              <label className="text-sm font-semibold text-ink-700">Alternate mobile<input name="altMobile" defaultValue={values?.altMobile ?? ""} inputMode="tel" className="field-input mt-1" />{s.fieldErrors?.altMobile && <span className={err}>{s.fieldErrors.altMobile}</span>}</label>
              <label className="text-sm font-semibold text-ink-700">Email<input name="email" type="email" defaultValue={values?.email ?? ""} className="field-input mt-1" />{s.fieldErrors?.email && <span className={err}>{s.fieldErrors.email}</span>}</label>
              <label className="text-sm font-semibold text-ink-700">Locality / city<input name="city" defaultValue={values?.city ?? ""} className="field-input mt-1" /></label>
              <label className="text-sm font-semibold text-ink-700">Age group
                <select name="ageGroup" defaultValue={values?.ageGroup ?? ""} className="field-input mt-1"><option value="">—</option>{ageGroups.map((a) => <option key={a}>{a}</option>)}</select>
              </label>
              <label className="text-sm font-semibold text-ink-700">Preferred language<input name="language" defaultValue={values?.language ?? ""} placeholder="Telugu, Hindi, English…" className="field-input mt-1" /></label>
              <label className="text-sm font-semibold text-ink-700">Best time to call<input name="contactTime" defaultValue={values?.contactTime ?? ""} placeholder="e.g. Evenings" className="field-input mt-1" /></label>
              <label className="text-sm font-semibold text-ink-700 sm:col-span-2">Where you met<input name="location" defaultValue={values?.location ?? ""} placeholder="e.g. Book table at Ameerpet" className="field-input mt-1" /></label>
              <label className="text-sm font-semibold text-ink-700 sm:col-span-2">Remarks<input name="remarks" defaultValue={values?.remarks ?? ""} maxLength={300} className="field-input mt-1" /></label>
            </div>
          </details>

          {!edit ? (
            <label className="flex items-start gap-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-950 ring-1 ring-amber-200">
              <input type="checkbox" name="consent" className="mt-0.5 h-6 w-6 shrink-0 accent-brand-600" data-testid="c-consent" />
              <span><b>They agreed to be contacted</b> about the activities chosen above.{kids ? " (Parent / guardian agreed.)" : ""}</span>
            </label>
          ) : (
            <input type="hidden" name="consent" value="on" />
          )}
          {s.fieldErrors?.consent && <span className={err}>{s.fieldErrors.consent}</span>}
          <SubmitButton pending="Saving…" className="w-full sm:w-auto">{edit ? "Save changes" : "➕ Save contact"}</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function EventForm({ dhams }: { dhams?: { id: number; name: string }[] }) {
  return (
    <ActionForm action={addEvent} className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
      {(s) => (
        <>
          <label className="text-sm font-semibold text-ink-700">New event name
            <input name="name" placeholder="e.g. Gita Jayanti Satsang, Kondapur" className="field-input mt-1" />
            {s.fieldErrors?.name && <span className={err}>{s.fieldErrors.name}</span>}
          </label>
          {dhams && (
            <label className="text-sm font-semibold text-ink-700">For
              <select name="dhamId" defaultValue="" className="field-input mt-1"><option value="">All Dhams</option>{dhams.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
            </label>
          )}
          <SubmitButton variant="secondary" pending="Adding…">Add event</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
