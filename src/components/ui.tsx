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
 * Every page starts with this header: where am I (crumbs), the page title and its main actions.
 * "What to do here" and "What happens next" sit in one small, collapsed help panel so the page
 * itself starts with the work. It opens with a tap or the keyboard (native <details>).
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
    <header className="relative mb-5 sm:mb-6">
      {crumbs && crumbs.length > 0 && (
        <nav aria-label="You are here" className="mb-1.5 flex flex-wrap items-center gap-1 text-[13px] font-medium text-ink-500">
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              {c.href ? (
                <Link href={c.href} className="text-ink-500 transition hover:text-brand-700 hover:underline">
                  {c.label}
                </Link>
              ) : (
                <span className="text-ink-700">{c.label}</span>
              )}
              {i < crumbs.length - 1 && <span aria-hidden className="text-ink-400">/</span>}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-2">
          <h1 className="font-display text-[24px] font-extrabold leading-tight tracking-tight text-ink-900 sm:text-[28px]">{title}</h1>
          {(doHere || next) && <PageHelp doHere={doHere} next={next} />}
        </div>
        {actions && <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end [&>*:only-child]:col-span-2 [&>*]:min-w-0 [&>*]:px-3 sm:[&>*]:px-4">{actions}</div>}
      </div>
    </header>
  );
}

/** The page's guidance, folded into a small "ⓘ Help" button next to the title. */
function PageHelp({ doHere, next }: { doHere?: ReactNode; next?: ReactNode }) {
  return (
    <details className="group shrink-0 [&_summary::-webkit-details-marker]:hidden">
      <summary
        className="mt-0.5 inline-flex min-h-9 cursor-pointer list-none items-center gap-1 rounded-full border border-stone-200 bg-white px-2.5 text-xs font-semibold text-ink-500 transition hover:border-brand-300 hover:text-brand-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 group-open:border-brand-300 group-open:bg-brand-50 group-open:text-brand-700 sm:mt-1.5"
        aria-label="How this page works"
      >
        <span aria-hidden className="text-sm leading-none">ⓘ</span> Help
      </summary>
      <div className="absolute inset-x-0 top-full z-40 mt-2 max-w-xl rounded-2xl border border-stone-200 bg-white p-4 text-sm leading-relaxed text-ink-700 shadow-lift">
        {doHere && (
          <p>
            <span className="font-semibold text-ink-900">What to do here: </span>
            {doHere}
          </p>
        )}
        {next && (
          <p className={doHere ? "mt-2 border-t border-stone-100 pt-2" : ""}>
            <span className="font-semibold text-ink-900">What happens next: </span>
            {next}
          </p>
        )}
      </div>
    </details>
  );
}

/**
 * A titled section that opens and closes (native <details>: works by tap and keyboard).
 * Used to keep secondary information one tap away instead of filling the page.
 */
export function Section({
  title,
  hint,
  icon,
  defaultOpen = false,
  children,
  id,
}: {
  title: string;
  hint?: ReactNode;
  icon?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  id?: string;
}) {
  return (
    <details id={id} open={defaultOpen} className="group scroll-mt-20 rounded-2xl border border-stone-200/80 bg-white shadow-card [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-2xl px-4 py-3 transition hover:bg-stone-50/70 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 sm:px-5">
        {icon && <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-lg">{icon}</span>}
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[15px] font-bold text-ink-900">{title}</span>
          {hint && <span className="block truncate text-xs text-ink-500">{hint}</span>}
        </span>
        <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-100 text-ink-500 transition group-open:rotate-180">▾</span>
      </summary>
      <div className="border-t border-stone-100 px-4 py-4 sm:px-5">{children}</div>
    </details>
  );
}

export function Card({
  title,
  subtitle,
  actions,
  children,
  className = "",
  id,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`min-w-0 scroll-mt-20 rounded-2xl border border-stone-200/80 bg-white p-4 shadow-card sm:p-5 ${className}`}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            {title && <h2 className="font-display text-base font-bold text-ink-900 sm:text-[17px]">{title}</h2>}
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
  const valueTone: Record<Tone, string> = {
    gray: "text-ink-900",
    blue: "text-ink-900",
    amber: "text-amber-700",
    green: "text-ink-900",
    red: "text-red-700",
    purple: "text-ink-900",
  };
  const chip: Record<Tone, string> = {
    gray: "bg-stone-100",
    blue: "bg-sky-100",
    amber: "bg-amber-100",
    green: "bg-emerald-100",
    red: "bg-red-100",
    purple: "bg-violet-100",
  };
  const body = (
    <div
      className={`relative h-full rounded-2xl border border-stone-200/80 bg-white p-4 shadow-card ${
        href ? "transition duration-200 group-hover:border-stone-300 group-hover:shadow-lift" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-medium leading-snug text-ink-500">{label}</p>
        {icon && <span aria-hidden className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base ${chip[tone]}`}>{icon}</span>}
      </div>
      <p className={`mt-1 font-display text-[22px] font-extrabold tabular-nums tracking-tight sm:text-[26px] ${valueTone[tone]}`}>{value}</p>
      {hint && <p className="mt-0.5 pr-4 text-xs leading-snug text-ink-500">{hint}</p>}
      {href && <span aria-hidden className="absolute bottom-3 right-3 text-sm text-ink-400 transition group-hover:translate-x-0.5 group-hover:text-brand-600">›</span>}
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
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-stone-300 bg-white/60 px-6 py-10 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-stone-100 text-2xl" aria-hidden>
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
              className="w-full rounded-t bg-brand-400 transition group-hover:bg-brand-600"
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
  const color = { brand: "bg-brand-500", green: "bg-emerald-500", red: "bg-red-500" }[tone];
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="text-ink-700">{label}</span>
        <span className="font-semibold tabular-nums">{format(value)}</span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-stone-100">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${max ? Math.min((value / max) * 100, 100) : 0}%` }} />
      </div>
    </div>
  );
}
