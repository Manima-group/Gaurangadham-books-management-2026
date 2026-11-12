import Link from "next/link";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { setupProgress } from "@/lib/setup";
import { Alert, Card, PageHeader } from "@/components/ui";
import { OrgForm } from "./forms";

export default async function SetupPage() {
  await requireUser("admin");
  const [p, [org]] = await Promise.all([setupProgress(), db.select().from(schema.organization).limit(1)]);
  const pct = Math.round((p.done / p.total) * 100);
  const next = p.steps.find((s) => !s.done);
  return (
    <>
      <PageHeader
        title="Setup Progress"
        crumbs={[{ label: "Home", href: "/dashboard" }, { label: "Setup Progress" }]}
        doHere="Complete these steps in order so Managers and Devotees can start using the app."
        next={next ? `Next step: ${next.title}. Tap “${next.action}”.` : "Setup is complete! Receive books and send them to Dhams."}
      />
      <Card className="mb-4">
        <div className="flex items-center justify-between text-sm font-semibold">
          <span>{p.done} of {p.total} steps complete</span>
          <span>{pct}%</span>
        </div>
        <div className="mt-2 h-3 rounded-full bg-stone-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-3 rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
        {p.complete && (
          <div className="mt-4">
            <Alert tone="green" title="Setup is complete! 🎉">
              <span className="mt-2 flex flex-wrap gap-2">
                <Link href="/stock/receive" className="btn-success btn-sm">📥 Receive Books</Link>
                <Link href="/stock/assign-dham" className="btn-secondary btn-sm">🛕 Send them to Dhams</Link>
              </span>
            </Alert>
          </div>
        )}
      </Card>
      <ol className="space-y-2">
        {p.steps.map((s, i) => (
          <li key={s.key} className={`flex items-center gap-4 rounded-2xl border bg-white p-4 shadow-sm ${s === next ? "border-brand-400 ring-4 ring-brand-100" : "border-stone-200"}`}>
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-bold ${s.done ? "bg-emerald-500 text-white" : "bg-stone-100 text-ink-500"}`} aria-hidden>
              {s.done ? "✓" : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{s.title} <span className="sr-only">{s.done ? "(completed)" : "(not completed)"}</span></p>
              <p className="text-sm text-ink-500">{s.desc}{s.done && s.count ? ` · ${s.count} added` : ""}</p>
            </div>
            <Link href={s.href} className={s.done ? "btn-secondary btn-sm" : "btn-primary btn-sm"}>{s.done ? "View" : s.action}</Link>
          </li>
        ))}
      </ol>
      <Card title="Organisation details" className="mt-6 max-w-2xl">
        <div id="organisation" />
        <OrgForm org={org} />
      </Card>
    </>
  );
}
