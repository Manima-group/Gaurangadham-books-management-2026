"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";

/** One-row day switcher for phones: ← [date] →, navigates as soon as a date is picked. */
export function DayPicker({
  action,
  date,
  today,
  prev,
  next,
  params = {},
  dhams,
  dham,
}: {
  action: string;
  date: string;
  today: string;
  prev: string;
  next: string;
  params?: Record<string, string>;
  dhams?: { id: number; name: string }[];
  dham?: string;
}) {
  const router = useRouter();
  const url = (over: Record<string, string>) => {
    const q = new URLSearchParams({ ...params, ...(dham ? { dham } : {}), date, ...over });
    for (const [k, v] of [...q.entries()]) if (!v) q.delete(k);
    return `${action}?${q.toString()}`;
  };
  return (
    <div className="mb-4 space-y-2">
      {dhams && (
        <select
          aria-label="Dham"
          value={dham ?? ""}
          onChange={(e) => router.push(url({ dham: e.target.value }))}
          className="field-input"
        >
          {dhams.length > 1 && !dham && <option value="">All Dhams</option>}
          {dhams.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      )}
      <div className="flex items-center gap-2">
        <Link href={url({ date: prev })} aria-label="Previous day" className="btn-secondary h-12 w-12 shrink-0 px-0 text-lg">
          ←
        </Link>
        <input
          type="date"
          aria-label="Day"
          value={date}
          max={today}
          onChange={(e) => e.target.value && router.push(url({ date: e.target.value }))}
          className="field-input min-w-0 flex-1 text-center font-semibold"
        />
        {date < today ? (
          <Link href={url({ date: next })} aria-label="Next day" className="btn-secondary h-12 w-12 shrink-0 px-0 text-lg">
            →
          </Link>
        ) : (
          <span className="btn-secondary pointer-events-none h-12 w-12 shrink-0 px-0 text-lg opacity-40" aria-hidden>
            →
          </span>
        )}
      </div>
      {date !== today && (
        <Link href={url({ date: today })} className="tap text-sm font-semibold text-brand-700 underline">
          Jump to today
        </Link>
      )}
    </div>
  );
}
