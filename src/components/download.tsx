/** "Download Report" — Excel and PDF of what the page is showing (same filters). */
export function DownloadReport({ kind, params = {}, label = "Download Report" }: { kind: string; params?: Record<string, string | undefined>; label?: string }) {
  const q = (format: string) => {
    const s = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) s.set(k, v);
    s.set("format", format);
    return `/api/export/${kind}?${s.toString()}`;
  };
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={label}>
      <span className="text-sm font-semibold text-ink-700">⬇ {label}:</span>
      <a href={q("xlsx")} download className="btn-secondary btn-sm">📊 Excel</a>
      <a href={q("pdf")} download className="btn-secondary btn-sm">📄 PDF</a>
    </div>
  );
}
