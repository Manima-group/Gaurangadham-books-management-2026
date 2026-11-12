"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

type Opt = { value: string | number; label: string };

/**
 * Mobile-first filter bar.
 * - Status is shown as tappable chips (no dropdown) — one tap to filter.
 * - Other filters fold into a "Filters" panel on phones; always visible on larger screens.
 * Filters live in the URL, so they can be shared and work without JavaScript.
 */
export function FilterBar({
  action,
  values,
  dhams,
  drives,
  devotees,
  statuses,
  dates = true,
  extra,
}: {
  action: string;
  values: Record<string, string | undefined>;
  dhams?: Opt[];
  drives?: Opt[];
  devotees?: Opt[];
  statuses?: Opt[];
  dates?: boolean;
  extra?: ReactNode;
}) {
  const otherKeys = ["dham", "drive", "devotee", "from", "to", "book", "kind"];
  const activeCount = otherKeys.filter((k) => values[k]).length;
  const [open, setOpen] = useState(false);
  const hasOther = !!(dhams || drives || devotees || dates || extra);

  const href = (status?: string) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(values)) if (v && k !== "status" && k !== "page") q.set(k, v);
    if (status) q.set("status", status);
    const s = q.toString();
    return s ? `${action}?${s}` : action;
  };

  const sel = (name: string, label: string, opts: Opt[], all: string) => (
    <label className="flex flex-col gap-1 text-xs font-semibold text-ink-500">
      {label}
      <select name={name} defaultValue={values[name] ?? ""} className="field-input py-2.5 text-sm font-normal">
        <option value="">{all}</option>
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="space-y-3">
      {statuses && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]" role="group" aria-label="Filter by status">
          {[{ value: "", label: "All" }, ...statuses].map((o) => {
            const active = (values.status ?? "") === String(o.value);
            return (
              <Link
                key={o.value}
                href={href(String(o.value) || undefined)}
                aria-current={active ? "true" : undefined}
                className={`inline-flex min-h-10 shrink-0 items-center rounded-full px-4 text-sm font-semibold transition ${
                  active
                    ? "bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow-[0_6px_14px_-8px_rgb(217_85_18/0.9)]"
                    : "border border-stone-300 bg-white text-ink-700 hover:bg-stone-50"
                }`}
              >
                {o.label}
              </Link>
            );
          })}
        </div>
      )}

      {hasOther && (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="btn-secondary btn-sm w-full justify-between md:hidden"
          >
            <span>🔍 Filters{activeCount ? ` (${activeCount} on)` : ""}</span>
            <span aria-hidden>{open ? "▲" : "▼"}</span>
          </button>
          <form action={action} className={`${open ? "grid" : "hidden"} gap-3 sm:grid-cols-2 md:grid md:grid-cols-3 lg:grid-cols-5`}>
            {values.status && <input type="hidden" name="status" value={values.status} />}
            {dhams && sel("dham", "Dham", dhams, "All Dhams")}
            {drives && sel("drive", "Distribution Drive", drives, "All drives")}
            {devotees && sel("devotee", "Devotee", devotees, "All devotees")}
            {dates && (
              <div className="grid grid-cols-2 gap-3 sm:col-span-2 md:col-span-1 lg:col-span-2">
                <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold text-ink-500">
                  From
                  <input type="date" name="from" defaultValue={values.from} className="field-input min-w-0 py-2.5 text-sm font-normal" />
                </label>
                <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold text-ink-500">
                  To
                  <input type="date" name="to" defaultValue={values.to} className="field-input min-w-0 py-2.5 text-sm font-normal" />
                </label>
              </div>
            )}
            {extra}
            <div className="flex items-end gap-2 sm:col-span-2 md:col-span-1">
              <button className="btn-primary btn-sm flex-1">Apply Filters</button>
              <a href={values.status ? `${action}?status=${encodeURIComponent(values.status)}` : action} className="btn-secondary btn-sm">
                Clear
              </a>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
