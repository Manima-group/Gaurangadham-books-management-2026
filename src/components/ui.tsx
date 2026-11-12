import Link from "next/link";
import type { ReactNode } from "react";
import type { Tone } from "@/lib/terms";
import { REPORT_STATUS, MONEY_STATUS } from "@/lib/terms";
import { HelpTip } from "./helptip";
export { HelpTip };

const TONES: Record<Tone, string> = {
  gray: "bg-stone-100 text-stone-700 ring-stone-200",
  blue: "bg-sky-50 text-sky-800 ring-sky-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  green: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  red: "bg-red-50 text-red-800 ring-red-200",
  purple: "bg-violet-50 text-violet-800 ring-violet-200",
};

/**
 * Every page starts with this header. It answers the three UX questions:
 * Where am I? What should I do here? What happens after I finish?
 */
export function PageHeader({
  title,
  crumbs,
  doHere,
  next,
  actions,
}: {
  title: string;
  crumbs?: { label: string; href?: string }[];
  doHere?: ReactNode;
  next?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6">
      {crumbs && crumbs.length > 0 && (
        <nav aria-label="You are here" className="mb-2 flex flex-wrap items-center gap-1 text-[13px] font-medium text-ink-500">
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              {c.href ? (
                <Link href={c.href} className="text-brand-700 hover:underline">
                  {c.label}
                </Link>
              ) : (
                <span>{c.label}</span>
              )}
              {i < crumbs.length - 1 && <span aria-hidden>›</span>}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <h1 className="font-display text-[26px] font-extrabold leading-tight tracking-tight text-ink-900 sm:text-[32px]">{title}</h1>
        {actions && <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap [&>*:only-child]:col-span-2 [&>*]:min-w-0 [&>*]:px-3 sm:[&>*]:px-5">{actions}</div>}
      </div>
      {(doHere || next) && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {doHere && (
            <div className="flex gap-3 rounded-2xl border border-brand-200/60 bg-gradient-to-br from-brand-50 to-white px-4 py-3 text-sm leading-relaxed text-ink-700">
              <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-sm">👉</span>
              <p><span className="font-semibold text-brand-800">What to do here: </span>{doHere}</p>
            </div>
          )}
          {next && (
            <>
              <div className="hidden gap-3 rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50/70 to-white px-4 py-3 text-sm leading-relaxed text-ink-700 sm:flex">
                <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-sm">➡️</span>
                <p><span className="font-semibold text-navy-700">What happens next: </span>{next}</p>
              </div>
              <details className="group rounded-2xl border border-blue-100 bg-blue-50/50 text-sm text-ink-700 sm:hidden">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 font-semibold text-navy-700 [&::-webkit-details-marker]:hidden">
                  <span>➡️ What happens next?</span>
                  <span aria-hidden className="transition group-open:rotate-180">▾</span>
                </summary>
                <p className="px-4 pb-3 leading-relaxed">{next}</p>
              </details>
            </>
          )}
        </div>
      )}
    </header>
  );
}

export function Card({
  title,
  subtitle,
  actions,
  children,
  className = "",
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`min-w-0 rounded-2xl border border-stone-200/70 bg-white p-4 shadow-card sm:p-5 ${className}`}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            {title && <h2 className="font-display text-lg font-bold text-ink-900">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "gray",
  href,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  href?: string;
  icon?: string;
}) {
  const chip: Record<Tone, string> = {
    gray: "bg-stone-100",
    blue: "bg-sky-100",
    amber: "bg-amber-100",
    green: "bg-emerald-100",
    red: "bg-red-100",
    purple: "bg-violet-100",
  };
  const bar: Record<Tone, string> = {
    gray: "from-stone-300 to-stone-200",
    blue: "from-sky-500 to-sky-300",
    amber: "from-amber-500 to-amber-300",
    green: "from-emerald-500 to-emerald-300",
    red: "from-red-500 to-red-300",
    purple: "from-violet-500 to-violet-300",
  };
  const body = (
    <div
      className={`relative h-full overflow-hidden rounded-2xl border border-stone-200/70 bg-white p-4 shadow-card ${
        href ? "transition duration-200 hover:-translate-y-0.5 hover:shadow-lift" : ""
      }`}
    >
      <span aria-hidden className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${bar[tone]}`} />
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-semibold leading-snug text-ink-500">{label}</p>
        {icon && <span aria-hidden className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg ${chip[tone]}`}>{icon}</span>}
      </div>
      <p className="mt-1.5 font-display text-2xl font-extrabold tabular-nums tracking-tight text-ink-900 sm:text-[28px]">{value}</p>
      {hint && <p className="mt-1 text-xs leading-snug text-ink-500">{hint}</p>}
      {href && <span aria-hidden className="absolute bottom-3 right-3 text-ink-400 transition group-hover:text-brand-600">→</span>}
    </div>
  );
  return href ? (
    <Link href={href} className="group block rounded-2xl focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200">
      {body}
    </Link>
  ) : (
    body
  );
}

export function Badge({ tone = "gray", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function ReportStatus({ status }: { status: string }) {
  const s = REPORT_STATUS[status] ?? REPORT_STATUS.draft;
  return (
    <Badge tone={s.tone} title={s.help}>
      {s.label}
    </Badge>
  );
}

export function MoneyStatus({ status }: { status: string }) {
  const s = MONEY_STATUS[status] ?? MONEY_STATUS.submitted;
  return (
    <Badge tone={s.tone} title={s.help}>
      {s.label}
    </Badge>
  );
}

export function EmptyState({
  icon = "📚",
  title,
  children,
  action,
}: {
  icon?: string;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border-2 border-dashed border-stone-200 bg-gradient-to-b from-white to-stone-50/60 px-6 py-10 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-3xl ring-1 ring-brand-100" aria-hidden>
        {icon}
      </span>
      <p className="mt-4 font-display text-base font-bold text-ink-900">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-ink-500">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Alert({
  tone = "blue",
  title,
  children,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
}) {
  const icon = { gray: "ℹ️", blue: "ℹ️", amber: "⚠️", green: "✅", red: "⛔", purple: "💡" }[tone];
  return (
    <div role={tone === "red" ? "alert" : "status"} className={`flex gap-3 rounded-xl px-4 py-3 text-sm ring-1 ring-inset ${TONES[tone]}`}>
      <span aria-hidden className="text-base leading-5">
        {icon}
      </span>
      <div>
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? "mt-0.5" : ""}>{children}</div>}
      </div>
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  help,
  error,
  tip,
  optional,
  children,
}: {
  label: string;
  htmlFor?: string;
  help?: ReactNode;
  error?: string;
  tip?: ReactNode;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-ink-900">
        {label}
        {optional && <span className="ml-1 font-normal text-ink-500">(optional)</span>}
        {tip && <HelpTip>{tip}</HelpTip>}
      </label>
      {children}
      {help && !error && <p className="text-xs text-ink-500">{help}</p>}
      {error && <p className="text-sm font-medium text-red-700">{error}</p>}
    </div>
  );
}

export function LinkButton({
  href,
  children,
  variant = "primary",
  size,
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "success" | "warn";
  size?: "sm";
}) {
  return (
    <Link href={href} className={`btn-${variant} ${size === "sm" ? "btn-sm" : ""}`}>
      {children}
    </Link>
  );
}

export function BookCover({ title, url, size = 48 }: { title: string; url?: string | null; size?: number }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" width={size} height={size * 1.4} className="rounded-md object-cover shadow-sm" style={{ width: size, height: size * 1.4 }} />;
  }
  const hue = [...title].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <div
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-md text-center text-[10px] font-bold leading-tight text-white shadow-sm"
      style={{ width: size, height: size * 1.4, background: `linear-gradient(150deg, hsl(${hue} 65% 45%), hsl(${(hue + 40) % 360} 60% 30%))` }}
    >
      {title
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0])
        .join("")
        .toUpperCase()}
    </div>
  );
}

/** Simple, readable bar chart (no library). values are numbers; labels shown below. */
export function BarChart({
  data,
  format,
  height = 160,
  emptyText = "No sales recorded in this period yet.",
}: {
  data: { label: string; value: number; sub?: string }[];
  format: (n: number) => string;
  height?: number;
  emptyText?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 0);
  if (max === 0) return <p className="py-8 text-center text-sm text-ink-500">{emptyText}</p>;
  return (
    <div>
      <div className="flex items-end gap-1 sm:gap-1.5" style={{ height }}>
        {data.map((d, i) => (
          <div key={i} className="group relative flex h-full flex-1 flex-col justify-end">
            <div
              className="w-full rounded-t-md bg-gradient-to-t from-brand-600 to-brand-400 transition group-hover:from-navy-700 group-hover:to-navy-600"
              style={{ height: `${Math.max((d.value / max) * 100, d.value > 0 ? 2 : 0)}%` }}
              title={`${d.label}: ${format(d.value)}${d.sub ? ` · ${d.sub}` : ""}`}
            />
            <span className="pointer-events-none absolute -top-7 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded bg-ink-900 px-2 py-0.5 text-xs text-white group-hover:block">
              {format(d.value)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1 sm:gap-1.5">
        {data.map((d, i) => (
          <span key={i} className="flex-1 truncate text-center text-[10px] text-ink-500">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Horizontal comparison bars, e.g. collected vs submitted per Dham. */
export function HBar({ label, value, max, format, tone = "brand" }: { label: string; value: number; max: number; format: (n: number) => string; tone?: "brand" | "green" | "red" }) {
  const color = { brand: "bg-gradient-to-r from-brand-500 to-brand-400", green: "bg-gradient-to-r from-emerald-500 to-emerald-400", red: "bg-red-500" }[tone];
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="text-ink-700">{label}</span>
        <span className="font-semibold tabular-nums">{format(value)}</span>
      </div>
      <div className="mt-1 h-2.5 rounded-full bg-stone-100">
        <div className={`h-2.5 rounded-full ${color}`} style={{ width: `${max ? Math.min((value / max) * 100, 100) : 0}%` }} />
      </div>
    </div>
  );
}
