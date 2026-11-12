import { inr, num } from "@/lib/format";

export const SLOT_LABEL: Record<string, string> = { morning: "🌅 Morning", afternoon: "☀️ Afternoon", evening: "🌇 Evening" };

/** Per-place list of books sold (used on the devotee page and the manager's review page). */
export function VenueBreakdown({
  venues,
  lines,
  titles,
}: {
  venues: { id: number; name: string; area: string | null; timeSlot: string | null }[];
  lines: { venueId: number | null; bookId: number; soldQty: number; amountPaise: number; returnedQty: number; damagedQty: number }[];
  titles: Map<number, string>;
}) {
  const groups = [
    ...venues.map((v) => ({ key: String(v.id), v, ls: lines.filter((l) => l.venueId === v.id && l.soldQty) })),
    { key: "none", v: null, ls: lines.filter((l) => !l.venueId && l.soldQty) },
  ].filter((g) => g.ls.length || g.v);
  const extra = lines.filter((l) => l.returnedQty || l.damagedQty);
  return (
    <div className="space-y-3">
      {groups.map(({ key, v, ls }) => (
        <div key={key} className="rounded-2xl bg-stone-50/80 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold">📍 {v?.name ?? "Sold (no place given)"}</p>
              {(v?.area || v?.timeSlot) && <p className="text-xs text-ink-500">{[v?.area, v?.timeSlot ? SLOT_LABEL[v.timeSlot] : null].filter(Boolean).join(" · ")}</p>}
            </div>
            <p className="shrink-0 text-right text-sm font-bold tabular-nums">
              {num(ls.reduce((a, l) => a + l.soldQty, 0))} · {inr(ls.reduce((a, l) => a + l.amountPaise, 0))}
            </p>
          </div>
          {ls.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm">
              {ls.map((l, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span className="min-w-0 truncate text-ink-700">{titles.get(l.bookId) ?? "Book"}</span>
                  <span className="shrink-0 tabular-nums">× {l.soldQty}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      {extra.length > 0 && (
        <p className="text-sm text-ink-500">
          Also: {extra.map((l) => `${titles.get(l.bookId) ?? "Book"} — ${[l.returnedQty ? `${l.returnedQty} returned` : "", l.damagedQty ? `${l.damagedQty} damaged` : ""].filter(Boolean).join(", ")}`).join("; ")}
        </p>
      )}
    </div>
  );
}
