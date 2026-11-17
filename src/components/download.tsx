"use client";

import { useState } from "react";

/**
 * "Download Report" — Excel and PDF of what the page is showing (same filters).
 * The file is fetched first and saved only if the server really sent that file type; an error
 * is shown on screen instead of being saved as a broken file (a .txt named "pdf").
 */
export function DownloadReport({ kind, params = {}, label = "Download Report" }: { kind: string; params?: Record<string, string | undefined>; label?: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const url = (format: string) => {
    const s = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) s.set(k, v);
    s.set("format", format);
    return `/api/export/${kind}?${s.toString()}`;
  };
  const expected = { pdf: "application/pdf", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } as const;

  async function download(e: React.MouseEvent<HTMLAnchorElement>, format: "pdf" | "xlsx") {
    e.preventDefault();
    if (busy) return;
    setBusy(format);
    setError(null);
    try {
      const res = await fetch(url(format), { credentials: "same-origin", cache: "no-store" });
      const type = res.headers.get("content-type") ?? "";
      if (!res.ok || !type.startsWith(expected[format])) {
        let msg = `The ${format === "pdf" ? "PDF" : "Excel file"} could not be made. Please try again.`;
        if (type.includes("json")) msg = (await res.json().catch(() => null))?.error ?? msg;
        throw new Error(msg);
      }
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? `report.${format}`;
      const href = URL.createObjectURL(new Blob([blob], { type: expected[format] }));
      const a = document.createElement("a");
      a.href = href;
      a.download = name.endsWith(`.${format}`) ? name : `${name}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 10_000);
    } catch (err) {
      setError(err instanceof Error && err.message !== "Failed to fetch" ? err.message : "No internet connection. Please try again when online.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={label}>
        <span className="text-sm font-semibold text-ink-700">⬇ {label}:</span>
        <a href={url("xlsx")} onClick={(e) => download(e, "xlsx")} className="btn-secondary btn-sm" aria-busy={busy === "xlsx"} data-testid="dl-xlsx">
          {busy === "xlsx" ? "Preparing…" : "📊 Excel"}
        </a>
        <a href={url("pdf")} onClick={(e) => download(e, "pdf")} className="btn-secondary btn-sm" aria-busy={busy === "pdf"} data-testid="dl-pdf">
          {busy === "pdf" ? "Preparing…" : "📄 PDF"}
        </a>
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-800 ring-1 ring-red-200">⛔ {error}</p>}
    </div>
  );
}
