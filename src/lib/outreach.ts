import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import type { AppUser } from "./session";
import type { ReportSpec } from "./export/render";
import { todayIST } from "./format";
import { logActivity } from "./activity";

/**
 * Outreach Contacts — people met at book tables and programmes who want to hear about activities.
 * Completely separate from books, stock, sales and money.
 *
 * Who sees what:
 *  - Contact Collection Sevak: only the records they collected.
 *  - Sector Sevak: records collected for their own Dham.
 *  - Chakra Sevak: everything.
 */
export const INTERESTS = [
  { key: "childrens_club", label: "Children's Club", icon: "🧒" },
  { key: "satsang", label: "Satsang", icon: "🪔" },
  { key: "gita_class", label: "Bhagavad Gita Classes", icon: "📖" },
  { key: "programmes", label: "Spiritual Programmes", icon: "🎉" },
  { key: "book_reading", label: "Book Reading", icon: "📚" },
  { key: "volunteer", label: "Volunteer Seva", icon: "🤝" },
  { key: "other", label: "Other Activities", icon: "✨" },
] as const;
export const INTEREST_LABEL: Record<string, string> = Object.fromEntries(INTERESTS.map((i) => [i.key, i.label]));
export const AGE_GROUPS = ["Under 18 (parent/guardian gives details)", "18–25", "26–40", "41–60", "60+"];
export const DUP_LABEL: Record<string, { label: string; tone: "gray" | "amber" | "red" | "green" }> = {
  none: { label: "Unique", tone: "green" },
  possible: { label: "Possible duplicate", tone: "amber" },
  duplicate: { label: "Duplicate", tone: "red" },
  not_duplicate: { label: "Checked — not a duplicate", tone: "green" },
};

/** 10-digit Indian mobile from any common way of writing it (+91, 0, spaces, dashes); null if not valid. */
export function normalizeMobile(raw: string | null | undefined) {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

export const canManageContacts = (u: AppUser) => u.role === "admin" || u.role === "manager";

/** SQL condition on `c` (outreach_contact) limiting rows to what this person may see. */
export function scopeSql(u: AppUser, mineOnly = false): SQL {
  if (mineOnly || u.role === "contact" || u.role === "devotee") return sql`c.collector_id = ${u.id}`;
  if (u.role === "manager") return sql`c.dham_id = ${u.dhamId ?? -1}`;
  return sql`true`;
}

export function canSeeContact(u: AppUser, c: { collectorId: string; dhamId: number | null }) {
  if (c.collectorId === u.id) return true;
  if (u.role === "admin") return true;
  return u.role === "manager" && c.dhamId === u.dhamId;
}
/** Correct a record: its collector, or a Sector Sevak / Chakra Sevak who may see it. */
export const canEditContact = (u: AppUser, c: { collectorId: string; dhamId: number | null }) => canSeeContact(u, c);
/** Delete: Sector Sevak / Chakra Sevak in scope; a collector only on the day they added it (to fix a mistake). */
export function canDeleteContact(u: AppUser, c: { collectorId: string; dhamId: number | null; createdAt: Date }) {
  if (u.role === "admin" || (u.role === "manager" && c.dhamId === u.dhamId)) return true;
  return c.collectorId === u.id && Date.now() - new Date(c.createdAt).getTime() < 24 * 3600 * 1000;
}

export type ContactFilter = { q?: string; from?: string; to?: string; dham?: string; collector?: string; event?: string; interest?: string; dup?: string; consent?: string; page?: string };

function filters(u: AppUser, f: ContactFilter, mineOnly = false) {
  const c: SQL[] = [scopeSql(u, mineOnly)];
  if (f.q?.trim()) {
    const like = `%${f.q.trim().toLowerCase()}%`;
    const digits = f.q.replace(/\D/g, "");
    c.push(digits.length >= 4 ? sql`(lower(c.full_name) like ${like} or c.mobile like ${"%" + digits + "%"})` : sql`(lower(c.full_name) like ${like} or lower(c.area) like ${like})`);
  }
  if (f.from) c.push(sql`(c.collected_at at time zone 'Asia/Kolkata')::date >= ${f.from}`);
  if (f.to) c.push(sql`(c.collected_at at time zone 'Asia/Kolkata')::date <= ${f.to}`);
  if (f.dham && u.role === "admin") c.push(sql`c.dham_id = ${Number(f.dham)}`);
  if (f.collector) c.push(sql`c.collector_id = ${f.collector}`);
  if (f.event) c.push(sql`c.event_id = ${Number(f.event)}`);
  if (f.interest) c.push(sql`exists (select 1 from outreach_contact_interest i where i.contact_id = c.id and i.interest = ${f.interest})`);
  if (f.dup) c.push(sql`c.dup_status = ${f.dup}`);
  if (f.consent === "yes") c.push(sql`c.consent`);
  if (f.consent === "no") c.push(sql`not c.consent`);
  return sql.join(c, sql` and `);
}

export const PAGE = 50;

export async function listContacts(u: AppUser, f: ContactFilter, mineOnly = false) {
  const where = filters(u, f, mineOnly);
  const page = Math.max(1, Number(f.page) || 1);
  const [{ n }] = (await db.execute(sql`select count(*)::int as n from outreach_contact c where ${where}`)) as unknown as { n: number }[];
  const rows = (await db.execute(sql`
    select c.id, c.full_name, c.mobile, c.area, c.city, c.consent, c.dup_status, c.collected_at, c.location, c.child_name,
      c.collector_id, u.name as collector, d.name as dham, e.name as event,
      coalesce((select array_agg(i.interest order by i.interest) from outreach_contact_interest i where i.contact_id = c.id), '{}') as interests
    from outreach_contact c join "user" u on u.id = c.collector_id left join dham d on d.id = c.dham_id left join outreach_event e on e.id = c.event_id
    where ${where} order by c.collected_at desc, c.id desc limit ${PAGE} offset ${(page - 1) * PAGE}`)) as unknown as {
    id: number; full_name: string; mobile: string; area: string; city: string | null; consent: boolean; dup_status: string; collected_at: Date;
    location: string | null; child_name: string | null; collector_id: string; collector: string; dham: string | null; event: string | null; interests: string[];
  }[];
  return { total: Number(n), page, pages: Math.max(1, Math.ceil(Number(n) / PAGE)), rows };
}

/** Counts for a dashboard or report. */
export async function contactStats(u: AppUser, f: ContactFilter = {}, mineOnly = false) {
  const where = filters(u, f, mineOnly);
  const today = todayIST();
  const [t] = (await db.execute(sql`
    select count(*)::int as total, count(distinct c.mobile)::int as uniq,
      count(*) filter (where (c.collected_at at time zone 'Asia/Kolkata')::date = ${today})::int as today,
      count(*) filter (where to_char(c.collected_at at time zone 'Asia/Kolkata','YYYY-MM') = ${today.slice(0, 7)})::int as month,
      count(*) filter (where c.consent)::int as consent,
      count(*) filter (where c.dup_status = 'possible')::int as to_review,
      count(*) filter (where c.dup_status = 'duplicate')::int as dups
    from outreach_contact c where ${where}`)) as unknown as Record<string, number>[];
  const group = async (expr: SQL, join: SQL = sql``) =>
    ((await db.execute(sql`select ${expr} as k, count(*)::int as n from outreach_contact c ${join} where ${where} group by 1 order by 2 desc, 1 limit 200`)) as unknown as { k: string | null; n: number }[])
      .map((r) => ({ k: r.k ?? "—", n: Number(r.n) }));
  const [interests, daily, monthly, byDham, byCollector, byEvent, byDup] = await Promise.all([
    group(sql`i.interest`, sql`join outreach_contact_interest i on i.contact_id = c.id`),
    group(sql`to_char(c.collected_at at time zone 'Asia/Kolkata','YYYY-MM-DD')`),
    group(sql`to_char(c.collected_at at time zone 'Asia/Kolkata','YYYY-MM')`),
    group(sql`d.name`, sql`left join dham d on d.id = c.dham_id`),
    group(sql`u.name`, sql`join "user" u on u.id = c.collector_id`),
    group(sql`coalesce(e.name, nullif(c.location,''), 'Not given')`, sql`left join outreach_event e on e.id = c.event_id`),
    group(sql`c.dup_status`),
  ]);
  return {
    total: Number(t.total), unique: Number(t.uniq), today: Number(t.today), month: Number(t.month),
    consent: Number(t.consent), toReview: Number(t.to_review), dups: Number(t.dups),
    interests: new Map(interests.map((r) => [r.k, r.n])),
    daily: daily.sort((a, z) => z.k.localeCompare(a.k)).slice(0, 31),
    monthly: monthly.sort((a, z) => z.k.localeCompare(a.k)).slice(0, 12),
    byDham, byCollector, byEvent, byDup,
  };
}

/** Download for Chakra / Sector Sevaks only, scoped like the screen. Each download is logged (without contact details). */
export async function contactsExport(u: AppUser, p: Record<string, string | undefined>): Promise<ReportSpec> {
  if (!canManageContacts(u)) throw new Error("not allowed");
  const f = p as ContactFilter;
  const where = filters(u, f);
  const rows = (await db.execute(sql`
    select to_char(c.collected_at at time zone 'Asia/Kolkata','YYYY-MM-DD') as date, c.full_name as name, c.mobile, coalesce(c.area,'') as area,
      coalesce(c.city,'') as city, coalesce((select string_agg(i.interest, ', ' order by i.interest) from outreach_contact_interest i where i.contact_id = c.id),'') as interests,
      case when c.consent then 'Yes' else 'No' end as consent, coalesce(e.name, c.location, '') as event, u.name as collector, coalesce(d.name,'') as dham, c.dup_status
    from outreach_contact c join "user" u on u.id = c.collector_id left join dham d on d.id = c.dham_id left join outreach_event e on e.id = c.event_id
    where ${where} order by c.collected_at desc limit 5000`)) as unknown as Record<string, unknown>[];
  for (const r of rows) {
    r.interests = String(r.interests).split(", ").filter(Boolean).map((k) => INTEREST_LABEL[k] ?? k).join(", ");
    r.dup_status = DUP_LABEL[String(r.dup_status)]?.label ?? r.dup_status;
  }
  await logActivity(u.id, `${u.name} downloaded ${rows.length} outreach contacts${u.role === "manager" ? ` of ${u.dhamName}` : ""}`, { dhamId: u.dhamId });
  return {
    title: "Outreach Contacts",
    filename: `outreach-contacts-${todayIST()}`,
    meta: [["Scope", u.role === "manager" ? `${u.dhamName ?? "Your Dham"} only` : "All Dhams"], ["Privacy", "Contact details are for inviting people to the activities they chose. Do not share."]],
    sections: [{
      name: "Contacts",
      columns: [
        { header: "Date", key: "date", kind: "date" }, { header: "Name", key: "name", width: 22 }, { header: "Mobile", key: "mobile" },
        { header: "Area", key: "area", width: 18 }, { header: "City", key: "city" }, { header: "Interested in", key: "interests", width: 30 },
        { header: "Consent", key: "consent" }, { header: "Event / place", key: "event", width: 18 }, { header: "Collected by", key: "collector" },
        ...(u.role === "admin" ? [{ header: "Dham", key: "dham" }] : []), { header: "Duplicate check", key: "dup_status" },
      ],
      rows,
    }],
  };
}
