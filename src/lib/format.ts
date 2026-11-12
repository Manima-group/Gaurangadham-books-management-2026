/** ₹ formatting (Indian digit grouping). Input is paise. */
export function inr(paise: number | null | undefined, opts: { decimals?: boolean } = {}) {
  const rupees = (paise ?? 0) / 100;
  const hasFraction = Math.round(rupees * 100) % 100 !== 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: opts.decimals || hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(rupees);
}

export function num(n: number | null | undefined) {
  return new Intl.NumberFormat("en-IN").format(n ?? 0);
}

/** Convert a rupee string/number typed by a user into paise. */
export function toPaise(v: string | number) {
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[₹,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

/** Today's date in India as YYYY-MM-DD. */
export function todayIST() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

export function addDays(isoDate: string, days: number) {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "11 Nov 2026" */
export function fmtDate(v: string | Date | null | undefined) {
  if (!v) return "—";
  const d = typeof v === "string" ? new Date(v.length === 10 ? v + "T00:00:00+05:30" : v) : v;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(d);
}

/** "11 Nov, 4:05 pm" */
export function fmtDateTime(v: Date | string | null | undefined) {
  if (!v) return "—";
  const d = typeof v === "string" ? new Date(v) : v;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(d);
}

export function timeAgo(v: Date | string) {
  const d = typeof v === "string" ? new Date(v) : v;
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  const days = Math.floor(s / 86400);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
