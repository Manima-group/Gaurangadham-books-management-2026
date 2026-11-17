import Link from "next/link";
import { fmtDateTime } from "@/lib/format";
import { DUP_LABEL, INTEREST_LABEL, type listContacts } from "@/lib/outreach";
import { Badge, EmptyState } from "@/components/ui";
import { Pager, withQuery } from "@/components/tabs";

type Data = Awaited<ReturnType<typeof listContacts>>;

/** Contact rows: name, mobile, area, interests, when and by whom. */
export function ContactList({ data, base, keep, showCollector }: { data: Data; base: string; keep: Record<string, string | undefined>; showCollector: boolean }) {
  if (!data.rows.length) return <EmptyState icon="📇" title="No contacts here yet.">Contacts you add appear here.</EmptyState>;
  return (
    <>
      <ul className="space-y-2" data-testid="contact-list">
        {data.rows.map((c) => (
          <li key={c.id}>
            <Link href={`/contacts/${c.id}`} className="block rounded-2xl border border-stone-200/80 bg-white p-3.5 shadow-card transition hover:border-brand-300" data-testid="contact-row">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-ink-900">{c.full_name}{c.child_name ? <span className="font-normal text-ink-500"> (parent of {c.child_name})</span> : null}</p>
                  <p className="text-sm text-ink-600"><span className="tabular-nums">{c.mobile}</span> · {c.area}{c.city ? `, ${c.city}` : ""}</p>
                </div>
                <span className="flex flex-wrap gap-1.5">
                  {c.dup_status !== "none" && <Badge tone={DUP_LABEL[c.dup_status]?.tone ?? "gray"}>{DUP_LABEL[c.dup_status]?.label}</Badge>}
                  {!c.consent && <Badge tone="red">No consent</Badge>}
                </span>
              </div>
              <p className="mt-1.5 flex flex-wrap gap-1">{c.interests.map((i) => <span key={i} className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-ink-700">{INTEREST_LABEL[i] ?? i}</span>)}</p>
              <p className="mt-1.5 text-xs text-ink-500">{fmtDateTime(c.collected_at)}{c.event || c.location ? ` · ${c.event ?? c.location}` : ""}{showCollector ? ` · by ${c.collector}${c.dham ? ` (${c.dham})` : ""}` : ""}</p>
            </Link>
          </li>
        ))}
      </ul>
      <Pager page={data.page} pages={data.pages} href={(p) => withQuery(base, { ...keep, page: p > 1 ? p : undefined })} />
    </>
  );
}
