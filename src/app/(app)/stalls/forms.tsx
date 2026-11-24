"use client";

import { useMemo, useState } from "react";
import {
  approveClosing, cancelStall, checkSettlement, confirmAllocation, confirmContribution, contribute, createStall, editAllocation,
  inviteToStall, openStall, quickSell, respondInvite, reverseSale, saveCounts, startClosing, withdrawContribution,
} from "@/app/actions/stalls";
import { ActionForm, SubmitButton } from "@/components/client";
import { Field } from "@/components/ui";

const rupees = (p: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2, minimumFractionDigits: p % 100 ? 2 : 0 }).format(p / 100);
const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

export function CreateStallForm({ today, canMulti }: { today: string; canMulti: boolean }) {
  return (
    <ActionForm action={createStall}>
      {(s) => (
        <>
          <Field label="Stall name" htmlFor="name" error={s.fieldErrors?.name}><input id="name" name="name" className="field-input" placeholder="e.g. Sunday Book Table — Ameerpet" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date" htmlFor="eventDate" error={s.fieldErrors?.eventDate}><input id="eventDate" name="eventDate" type="date" defaultValue={today} className="field-input" /></Field>
            <Field label="Who can join" htmlFor="mode">
              <select id="mode" name="mode" className="field-input" defaultValue="same_dham">
                <option value="same_dham">Only my Dham</option>
                {canMulti && <option value="multi_dham">Several Dhams</option>}
              </select>
            </Field>
          </div>
          <Field label="Place" htmlFor="location" optional><input id="location" name="location" className="field-input" placeholder="e.g. Metro station Gate 2" /></Field>
          <Field label="Note" htmlFor="description" optional><input id="description" name="description" className="field-input" /></Field>
          <SubmitButton pending="Creating…">Create Stall</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function InviteForm({ stallId, members, multi }: { stallId: number; members: { id: string; name: string }[]; multi: boolean }) {
  return (
    <ActionForm action={inviteToStall} className="space-y-2">
      {(s) => (
        <>
          <input type="hidden" name="stallId" value={stallId} />
          {members.length > 0 && (
            <Field label="Invite from your Dham" htmlFor="userId">
              <select id="userId" name="userId" className="field-input" defaultValue="">
                <option value="">— choose —</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </Field>
          )}
          {multi && (
            <Field label="…or by mobile number (any Dham)" htmlFor="phone" error={s.fieldErrors?.phone} optional>
              <input id="phone" name="phone" inputMode="tel" className="field-input" placeholder="10-digit mobile" />
            </Field>
          )}
          <SubmitButton size="sm" pending="Inviting…">Invite</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function RespondForm({ stallId }: { stallId: number }) {
  return (
    <ActionForm action={respondInvite} className="flex flex-wrap gap-2">
      <input type="hidden" name="stallId" value={stallId} />
      <SubmitButton name="decision" value="accept" variant="success" pending="Joining…">Accept & Join</SubmitButton>
      <SubmitButton name="decision" value="decline" variant="secondary" pending="…">Decline</SubmitButton>
    </ActionForm>
  );
}

export function ContributeForm({ stallId, books, owners, isCoordinator, me }: {
  stallId: number; books: { id: number; title: string; language: string; free: number }[]; owners: { id: string; name: string }[]; isCoordinator: boolean; me: string;
}) {
  const [key, setKey] = useState(newKey);
  const [owner, setOwner] = useState(me);
  return (
    <ActionForm action={async (st, fd) => { const r = await contribute(st, fd); if (r.status === "success") setKey(newKey()); return r; }} className="space-y-3">
      {(s) => (
        <>
          <input type="hidden" name="stallId" value={stallId} />
          <input type="hidden" name="clientKey" value={key} />
          {isCoordinator && owners.length > 1 && (
            <Field label="Whose books?" htmlFor="ownerId" help="Books of someone else are only proposed — that owner confirms.">
              <select id="ownerId" name="ownerId" value={owner} onChange={(e) => setOwner(e.target.value)} className="field-input">
                {owners.map((o) => <option key={o.id} value={o.id}>{o.id === me ? "My books" : o.name}</option>)}
              </select>
            </Field>
          )}
          {owner === me && books.length === 0 ? (
            <p className="text-sm text-ink-500">You have no free copies to add.</p>
          ) : (
            <ul className="divide-y divide-stone-100 rounded-xl ring-1 ring-stone-200">
              {books.map((b) => (
                <li key={b.id} className="flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{b.title}</p><p className="text-xs text-ink-500">{b.language}{owner === me ? ` · ${b.free} free` : ""}</p></div>
                  <input name={`qty_${b.id}`} inputMode="numeric" aria-label={`Copies of ${b.title}`} className={`field-input w-20 text-center ${s.fieldErrors?.[`qty_${b.id}`] ? "border-red-500" : ""}`} placeholder="0" data-testid={`contrib-${b.id}`} />
                </li>
              ))}
            </ul>
          )}
          <SubmitButton pending="Adding…">{owner === me ? "Add to Stall" : "Propose to Owner"}</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function SmallAction({ action, fields, label, variant = "secondary", pending }: {
  action: "confirmContribution" | "rejectContribution" | "withdrawContribution" | "openStall" | "startClosing" | "approveClosing" | "checkSettlement";
  fields: Record<string, string | number>; label: string; variant?: "primary" | "secondary" | "success" | "danger"; pending?: string;
}) {
  const fn = { confirmContribution, rejectContribution: confirmContribution, withdrawContribution, openStall, startClosing, approveClosing, checkSettlement }[action];
  return (
    <ActionForm action={fn} className="inline-flex flex-col gap-1">
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {action === "rejectContribution" && <input type="hidden" name="decision" value="reject" />}
      <SubmitButton size="sm" variant={variant} pending={pending ?? "…"}>{label}</SubmitButton>
    </ActionForm>
  );
}

export function CancelForm({ stallId }: { stallId: number }) {
  return (
    <details>
      <summary className="tap cursor-pointer text-sm font-semibold text-red-700">Cancel this stall</summary>
      <ActionForm action={cancelStall} className="mt-2 space-y-2">
        <input type="hidden" name="stallId" value={stallId} />
        <Field label="Reason" htmlFor="cancel-reason" optional><input id="cancel-reason" name="reason" className="field-input" /></Field>
        <SubmitButton size="sm" variant="danger" pending="Cancelling…">Cancel Stall</SubmitButton>
      </ActionForm>
    </details>
  );
}

export function QuickSellForm({ stallId, books, recipients, me }: {
  stallId: number; books: { id: number; title: string; language: string; price: number; left: number }[]; recipients: { id: string; name: string }[]; me: string;
}) {
  const [key, setKey] = useState(newKey);
  const [q, setQ] = useState<Record<number, number>>({});
  const [mode, setMode] = useState<"cash" | "upi" | "split">("cash");
  const total = useMemo(() => books.reduce((a, b) => a + (q[b.id] ?? 0) * b.price, 0), [q, books]);
  const reset = () => { setKey(newKey()); setQ({}); setMode("cash"); };
  return (
    <ActionForm action={async (st, fd) => { const r = await quickSell(st, fd); if (r.status === "success") reset(); return r; }} resetOnSuccess className="space-y-3">
      {(s) => (
        <>
          <input type="hidden" name="stallId" value={stallId} />
          <input type="hidden" name="clientKey" value={key} />
          <ul className="divide-y divide-stone-100 rounded-xl ring-1 ring-stone-200">
            {books.map((b) => (
              <li key={b.id} className="flex items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{b.title}</p><p className="text-xs text-ink-500">{rupees(b.price)} · {b.left} left</p></div>
                <button type="button" aria-label={`One less ${b.title}`} className="h-11 w-11 rounded-xl border border-stone-300 bg-white text-xl font-bold disabled:opacity-30" disabled={!(q[b.id] > 0)} onClick={() => setQ((x) => ({ ...x, [b.id]: Math.max((x[b.id] ?? 0) - 1, 0) }))}>−</button>
                <input name={`sell_${b.id}`} value={q[b.id] ?? ""} readOnly aria-label={`Copies of ${b.title}`} className={`field-input w-14 text-center ${s.fieldErrors?.[`sell_${b.id}`] ? "border-red-500" : ""}`} placeholder="0" data-testid={`sell-${b.id}`} />
                <button type="button" aria-label={`One more ${b.title}`} className="h-11 w-11 rounded-xl border border-stone-300 bg-white text-xl font-bold disabled:opacity-30" disabled={(q[b.id] ?? 0) >= b.left} onClick={() => setQ((x) => ({ ...x, [b.id]: Math.min((x[b.id] ?? 0) + 1, b.left) }))} data-testid={`plus-${b.id}`}>+</button>
              </li>
            ))}
          </ul>
          <fieldset className="grid grid-cols-3 gap-2">
            <legend className="mb-1 text-sm font-semibold">Payment</legend>
            {([["cash", "💵 Cash"], ["upi", "📲 UPI"], ["split", "💵+📲 Both"]] as const).map(([m, l]) => (
              <label key={m} className={`tap flex cursor-pointer items-center justify-center rounded-xl border px-2 py-2.5 text-sm font-semibold ${mode === m ? "border-brand-500 bg-brand-50 text-brand-700" : "border-stone-300 bg-white"}`}>
                <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)} className="sr-only" data-testid={`sell-mode-${m}`} />{l}
              </label>
            ))}
          </fieldset>
          {mode === "split" && (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Cash (₹)" htmlFor="sell-cash" error={s.fieldErrors?.cash}><input id="sell-cash" name="cash" inputMode="decimal" className="field-input" data-testid="sell-cash" /></Field>
              <Field label="UPI (₹)" htmlFor="sell-upi"><input id="sell-upi" name="upi" inputMode="decimal" className="field-input" data-testid="sell-upi" /></Field>
            </div>
          )}
          {recipients.length > 1 && (
            <Field label="Who received the money?" htmlFor="recipientId" help="The person now holding this money — they hand it over later.">
              <select id="recipientId" name="recipientId" defaultValue={me} className="field-input">
                {recipients.map((r) => <option key={r.id} value={r.id}>{r.id === me ? "Me" : r.name}</option>)}
              </select>
            </Field>
          )}
          <div className="sticky bottom-20 z-10 flex items-center gap-3 rounded-2xl bg-navy-900 p-3 text-white shadow-xl lg:bottom-4">
            <p className="flex-1 text-lg font-bold tabular-nums" data-testid="sell-total">{rupees(total)}</p>
            <SubmitButton pending="Saving…" className="min-h-12">Record Sale</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}

export function UndoSaleForm({ stallId, saleId }: { stallId: number; saleId: number }) {
  return (
    <details className="inline-block">
      <summary className="tap cursor-pointer text-xs font-semibold text-red-700" data-testid={`undo-${saleId}`}>Undo</summary>
      <ActionForm action={reverseSale} className="mt-1 flex gap-1">
        <input type="hidden" name="stallId" value={stallId} />
        <input type="hidden" name="saleId" value={saleId} />
        <input name="reason" className="field-input py-1 text-xs" placeholder="Reason" aria-label="Reason for undo" />
        <SubmitButton size="sm" variant="danger" pending="…">Undo sale</SubmitButton>
      </ActionForm>
    </details>
  );
}

export function CountForm({ stallId, books }: { stallId: number; books: { id: number; title: string; contributed: number; sold: number; left: number; counted?: number }[] }) {
  return (
    <ActionForm action={saveCounts} resetOnSuccess={false} className="space-y-3">
      {(s) => (
        <>
          <input type="hidden" name="stallId" value={stallId} />
          <div className="overflow-x-auto"><table className="data-table">
            <thead><tr><th>Book</th><th className="text-right">Given</th><th className="text-right">Sold</th><th className="text-right">Should be left</th><th className="text-right">Counted left</th></tr></thead>
            <tbody>{books.map((b) => (
              <tr key={b.id}><td>{b.title}</td><td className="text-right">{b.contributed}</td><td className="text-right">{b.sold}</td><td className="text-right">{b.left}</td>
                <td className="text-right"><input name={`left_${b.id}`} inputMode="numeric" defaultValue={b.counted ?? b.left} aria-label={`Counted left of ${b.title}`} className={`field-input ml-auto w-20 text-center ${s.fieldErrors?.[`left_${b.id}`] ? "border-red-500" : ""}`} data-testid={`count-${b.id}`} />
                  {s.fieldErrors?.[`left_${b.id}`] && <p className="text-xs text-red-700">{s.fieldErrors[`left_${b.id}`]}</p>}</td></tr>
            ))}</tbody>
          </table></div>
          <Field label="Note about missing or damaged copies" htmlFor="count-note" error={s.fieldErrors?.note} optional><input id="count-note" name="note" className="field-input" /></Field>
          <SubmitButton pending="Saving…">Save Count & Share Books</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function AllocationEditForm({ stallId, rows, books, owners }: {
  stallId: number; rows: { userId: string; bookId: number; takeHome: number }[]; books: { id: number; title: string; remaining: number }[]; owners: { id: string; name: string }[];
}) {
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [`th_${r.userId}_${r.bookId}`, String(r.takeHome)])));
  return (
    <ActionForm action={editAllocation} resetOnSuccess={false} className="space-y-3">
      {(s) => (
        <>
          <input type="hidden" name="stallId" value={stallId} />
          <div className="overflow-x-auto"><table className="data-table">
            <thead><tr><th>Book</th>{owners.map((o) => <th key={o.id} className="text-right">{o.name}</th>)}<th className="text-right">Must add up to</th></tr></thead>
            <tbody>{books.map((b) => {
              const sum = owners.reduce((a, o) => a + (Number(v[`th_${o.id}_${b.id}`]) || 0), 0);
              return (
                <tr key={b.id}><td>{b.title}</td>
                  {owners.map((o) => { const k = `th_${o.id}_${b.id}`; return k in v ? (
                    <td key={o.id} className="text-right"><input name={k} value={v[k]} onChange={(e) => setV((x) => ({ ...x, [k]: e.target.value }))} inputMode="numeric" aria-label={`${o.name} takes home ${b.title}`} className="field-input ml-auto w-16 text-center" data-testid={k} /></td>
                  ) : <td key={o.id} className="text-right text-ink-400">—</td>; })}
                  <td className={`text-right font-semibold ${sum === b.remaining ? "text-emerald-700" : "text-red-700"}`}>{sum} / {b.remaining}</td></tr>
              );
            })}</tbody>
          </table></div>
          <p className="text-xs text-ink-500">Taking home more than you gave means books move from another owner to you — a real transfer, approved by the Sector Sevak.</p>
          <SubmitButton variant="secondary" pending="Saving…">Save Changes</SubmitButton>
          {s.status === "error" && null}
        </>
      )}
    </ActionForm>
  );
}

export function ConfirmAllocationForm({ stallId, version }: { stallId: number; version: number }) {
  const [dispute, setDispute] = useState(false);
  return (
    <ActionForm action={confirmAllocation} className="space-y-2">
      {(s) => (
        <>
          <input type="hidden" name="stallId" value={stallId} />
          <input type="hidden" name="version" value={version} />
          {dispute && <Field label="What is wrong?" htmlFor="dispute-reason" error={s.fieldErrors?.reason}><input id="dispute-reason" name="reason" className="field-input" /></Field>}
          <div className="flex flex-wrap gap-2">
            {!dispute && <SubmitButton name="decision" value="confirm" variant="success" pending="Confirming…">✓ I confirm</SubmitButton>}
            {dispute ? <SubmitButton name="decision" value="dispute" variant="danger" pending="Sending…">Send concern</SubmitButton>
              : <button type="button" className="btn-secondary" onClick={() => setDispute(true)}>Something is wrong</button>}
          </div>
        </>
      )}
    </ActionForm>
  );
}
