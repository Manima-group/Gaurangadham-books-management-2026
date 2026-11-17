import "server-only";
import { inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { allHoldings } from "./stock";
import { reservations } from "./transfers";
import type { AppUser } from "./session";

/**
 * Book Availability — who holds which book right now, read from the stock ledger.
 * Chakra Sevak: every Dham. Others: every Dham only when a Chakra Sevak gave them access;
 * a Sector Sevak without access sees their own Dham; a devotee without access sees nothing.
 */
export function availabilityScope(u: AppUser): { allowed: boolean; dhamIds: number[] | null } {
  if (u.canSeeAvailability) return { allowed: true, dhamIds: null };
  if (u.role === "manager" && u.dhamId) return { allowed: true, dhamIds: [u.dhamId] };
  return { allowed: false, dhamIds: [] };
}

export type Holder = { kind: "shelf"; dhamId: number } | { kind: "devotee"; dhamId: number; id: string; name: string; phone: string | null };
export type BookAvail = {
  id: number; title: string; language: string; size: string; pricePaise: number;
  shelf: number; withDevotees: number; inTransit: number;
  byDham: Map<number, { shelf: number; withDevotees: number }>;
  devotees: { id: string; name: string; phone: string | null; dhamId: number; qty: number }[];
};

export async function availability(dhamIds: number[] | null) {
  const [raw, res, books, dhams] = await Promise.all([
    allHoldings(),
    reservations(),
    db.select().from(schema.book),
    db.select().from(schema.dham),
  ]);
  // Copies approved for a Books Transfer are reserved: shown as not available.
  const holdings = raw
    .map((h) => (h.holder.startsWith("transit:") ? h : { ...h, qty: h.qty - (res.get(h.holder)?.get(h.bookId) ?? 0) }))
    .filter((h) => h.qty > 0);
  const inScope = (d: number | null) => d != null && (dhamIds == null || dhamIds.includes(d));
  const devoteeIds = [...new Set(holdings.filter((h) => h.holder.startsWith("devotee:") && inScope(h.dhamId)).map((h) => h.holder.slice(8)))];
  const people = devoteeIds.length
    ? await db.select({ id: schema.user.id, name: schema.user.name, phone: schema.user.phone, dhamId: schema.user.dhamId, isActive: schema.user.isActive }).from(schema.user).where(inArray(schema.user.id, devoteeIds))
    : [];
  const person = new Map(people.map((p) => [p.id, p]));

  const out = new Map<number, BookAvail>();
  for (const b of books)
    out.set(b.id, { id: b.id, title: b.title, language: b.language, size: b.size, pricePaise: b.pricePaise, shelf: 0, withDevotees: 0, inTransit: 0, byDham: new Map(), devotees: [] });

  for (const h of holdings) {
    const b = out.get(h.bookId);
    if (!b || h.qty <= 0) continue;
    if (h.holder.startsWith("transit:")) {
      if (dhamIds == null) b.inTransit += h.qty;
      continue;
    }
    if (!inScope(h.dhamId)) continue;
    const d = b.byDham.get(h.dhamId!) ?? { shelf: 0, withDevotees: 0 };
    if (h.holder.startsWith("dham:")) {
      d.shelf += h.qty;
      b.shelf += h.qty;
    } else {
      d.withDevotees += h.qty;
      b.withDevotees += h.qty;
      const p = person.get(h.holder.slice(8));
      b.devotees.push({ id: h.holder.slice(8), name: p?.name ?? "Devotee", phone: p?.phone ?? null, dhamId: h.dhamId!, qty: h.qty });
    }
    b.byDham.set(h.dhamId!, d);
  }
  for (const b of out.values()) b.devotees.sort((a, z) => z.qty - a.qty || a.name.localeCompare(z.name));
  const list = [...out.values()].filter((b) => b.shelf + b.withDevotees + b.inTransit > 0).sort((a, z) => a.title.localeCompare(z.title) || a.language.localeCompare(z.language));
  const shownDhams = dhams.filter((d) => dhamIds == null || dhamIds.includes(d.id)).sort((a, z) => Number(z.isActive) - Number(a.isActive) || a.name.localeCompare(z.name));
  return { books: list, dhams: shownDhams, dhamName: new Map(dhams.map((d) => [d.id, d.name])) };
}
