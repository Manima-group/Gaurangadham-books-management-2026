"use client";

import { useState } from "react";
import { createInvite, reviewRegistrations, setAccess } from "@/app/actions/registration";
import { ActionForm, SubmitButton } from "@/components/client";
import { Field } from "@/components/ui";

export function InviteForm({ dhams, isAdmin, ownDham }: { dhams: { id: number; name: string }[]; isAdmin: boolean; ownDham: string | null }) {
  return (
    <ActionForm action={createInvite}>
      {(s) => (
        <>
          {isAdmin ? (
            <Field label="Dham" htmlFor="dhamId" error={s.fieldErrors?.dhamId}>
              <select id="dhamId" name="dhamId" className="field-input" defaultValue="">
                <option value="" disabled>Choose a Dham…</option>
                {dhams.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
          ) : (
            <p className="text-sm text-ink-700">New devotees will be registered under <b>{ownDham}</b>. You approve each one.</p>
          )}
          <Field label="Link works for" htmlFor="days" help="After this, the QR stops working. You can turn it off any time.">
            <select id="days" name="days" className="field-input" defaultValue="90">
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="180">180 days</option>
            </select>
          </Field>
          <SubmitButton pending="Creating…">Create Registration QR</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function ReviewForm({ people }: { people: { id: string; name: string; phone: string | null; dham: string; when: string; dup: boolean }[] }) {
  const [sel, setSel] = useState<string[]>([]);
  const [decision, setDecision] = useState<"approve" | "reject">("approve");
  const all = sel.length === people.length && people.length > 0;
  return (
    <ActionForm action={async (s, fd) => { const r = await reviewRegistrations(s, fd); if (r.status === "success") setSel([]); return r; }}>
      {(s) => (
        <>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={all} onChange={(e) => setSel(e.target.checked ? people.map((p) => p.id) : [])} data-testid="select-all" /> Select all ({people.length})
          </label>
          <ul className="divide-y divide-stone-100 rounded-xl ring-1 ring-stone-200">
            {people.map((p) => (
              <li key={p.id} className="flex items-start gap-3 px-3 py-2.5">
                <input type="checkbox" name="ids" value={p.id} checked={sel.includes(p.id)} aria-label={`Select ${p.name}`}
                  onChange={(e) => setSel((x) => (e.target.checked ? [...x, p.id] : x.filter((i) => i !== p.id)))} className="mt-1" />
                <div className="min-w-0">
                  <p className="font-semibold text-ink-900">{p.name}</p>
                  <p className="text-sm text-ink-500">📱 {p.phone ?? "—"} · {p.dham} · registered {p.when}</p>
                  {p.dup && <p className="text-xs font-semibold text-amber-700">⚠ Same name as an existing devotee in this Dham — check it is not the same person.</p>}
                </div>
              </li>
            ))}
          </ul>
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">Decision</legend>
            <label className="mr-4 inline-flex items-center gap-2"><input type="radio" name="decision" value="approve" checked={decision === "approve"} onChange={() => setDecision("approve")} /> Approve</label>
            <label className="inline-flex items-center gap-2"><input type="radio" name="decision" value="reject" checked={decision === "reject"} onChange={() => setDecision("reject")} /> Do not approve</label>
          </fieldset>
          {decision === "approve" ? (
            <div className="space-y-1.5 rounded-xl bg-stone-50 p-3 text-sm">
              <p className="font-semibold">Also give (optional — off unless you tick):</p>
              <label className="flex items-center gap-2"><input type="checkbox" name="grantDistribute" data-testid="grant-distribute" /> Book Distribution</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="grantDhamSales" data-testid="grant-dhamsales" /> Dham Sales View (read-only totals of own Dham)</label>
            </div>
          ) : (
            <Field label="Reason" htmlFor="reason" error={s.fieldErrors?.reason} help="The person sees this reason.">
              <input id="reason" name="reason" className="field-input" maxLength={300} />
            </Field>
          )}
          <SubmitButton pending="Saving…" variant={decision === "approve" ? "success" : "danger"}>
            {decision === "approve" ? `Approve ${sel.length || ""}`.trim() : `Do not approve ${sel.length || ""}`.trim()}
          </SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function AccessToggle({ id, permission, on, label }: { id: string; permission: "book_distribution" | "dham_sales_view"; on: boolean; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="inline-block">
      <button type="button" className="btn-secondary btn-sm" aria-expanded={open} onClick={() => setOpen((x) => !x)} data-testid={`toggle-${permission}`}>{on ? `Turn off ${label}` : `Turn on ${label}`}</button>
      {open && (
        <div className="mt-2 w-72 rounded-xl bg-white p-3 shadow ring-1 ring-stone-200">
          <ActionForm action={setAccess} className="space-y-2">
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="permission" value={permission} />
            <input type="hidden" name="value" value={on ? "off" : "on"} />
            <Field label="Reason" htmlFor={`r-${permission}-${id}`} optional>
              <input id={`r-${permission}-${id}`} name="reason" className="field-input" maxLength={300} />
            </Field>
            <SubmitButton size="sm" pending="Saving…">{on ? "Turn off" : "Turn on"}</SubmitButton>
          </ActionForm>
        </div>
      )}
    </div>
  );
}
