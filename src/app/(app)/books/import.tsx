"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { importBooks, previewBookImport, type ImportPreview, type ImportResult, type PreviewRow } from "@/app/actions/book-import";

const rupees = (p: number) => `₹${(p / 100).toLocaleString("en-IN", { minimumFractionDigits: p % 100 ? 2 : 0 })}`;

type Col = { header: string; required: boolean; example: string | number; help: string };

/**
 * Import books from Excel: download the sample → fill it → upload → check the preview → confirm.
 * Nothing is saved until "Confirm import".
 */
export function BookImport({ columns }: { columns: readonly Col[] }) {
  const [preview, setPreview] = useState<Extract<ImportPreview, { ok: true }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Extract<ImportResult, { ok: true }> | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => { setPreview(null); setError(null); setDone(null); if (fileRef.current) fileRef.current.value = ""; };

  function check(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null); setDone(null); setPreview(null);
    start(async () => {
      try {
        const r = await previewBookImport(fd);
        if (r.ok) setPreview(r); else setError(r.error);
      } catch {
        setError("The file could not be sent. Check your internet connection and try again.");
      }
    });
  }

  function confirm() {
    if (!preview) return;
    const fd = new FormData();
    fd.set("rows", JSON.stringify(preview.raw));
    fd.set("file", preview.file);
    start(async () => {
      try {
        const r = await importBooks(fd);
        if (r.ok) { setDone(r); setPreview(null); if (fileRef.current) fileRef.current.value = ""; }
        else { setError(r.error); if (r.rows) setPreview({ ...preview, rows: r.rows }); }
      } catch {
        setError("The import could not be sent. Nothing was changed — please try again.");
      }
    });
  }

  const rows = preview?.rows ?? [];
  const count = (a: PreviewRow["action"]) => rows.filter((r) => r.action === a).length;
  const errors = count("error");
  const copies = rows.filter((r) => r.action !== "error").reduce((a, r) => a + r.qty, 0);

  return (
    <div className="space-y-4" data-testid="book-import">
      {/* Required fields + sample, side by side */}
      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-start">
        <div>
          <p className="mb-2 text-sm font-semibold text-ink-900">Columns in your Excel file</p>
          <ul className="flex flex-wrap gap-1.5" aria-label="Columns">
            {columns.map((c) => (
              <li key={c.header} title={c.help} className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${c.required ? "bg-brand-50 text-brand-800 ring-brand-200" : "bg-stone-50 text-ink-600 ring-stone-200"}`}>
                {c.header}{c.required ? " *" : ""}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-500"><b className="text-brand-700">*</b> required. Book Code is made automatically if empty. Copies Received are added to the Central Store.</p>
        </div>
        <a href="/api/books/template" download="books-import-sample.xlsx" className="btn-secondary btn-sm justify-self-start whitespace-nowrap" data-testid="sample">⬇ Download sample Excel</a>
      </div>

      <details className="rounded-xl border border-stone-200 bg-stone-50/60 [&_summary::-webkit-details-marker]:hidden">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 text-sm font-semibold text-ink-700">What to type in each column <span aria-hidden>▾</span></summary>
        <div className="overflow-x-auto border-t border-stone-200 p-3">
          <table className="data-table min-w-[520px] text-sm">
            <thead><tr><th>Column</th><th>Required</th><th>Example</th><th>What to type</th></tr></thead>
            <tbody>{columns.map((c) => <tr key={c.header}><td className="font-semibold">{c.header}</td><td>{c.required ? "Yes" : "No"}</td><td>{String(c.example) || "—"}</td><td>{c.help}</td></tr>)}</tbody>
          </table>
        </div>
      </details>

      <form onSubmit={check} className="flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1 text-sm font-semibold text-ink-700">
          Your Excel file (.xlsx or .csv)
          <input ref={fileRef} type="file" name="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" required
            className="mt-1 block w-full rounded-xl border border-stone-300 bg-white text-sm file:mr-3 file:min-h-11 file:border-0 file:bg-stone-100 file:px-4 file:font-semibold file:text-ink-800 hover:file:bg-stone-200" data-testid="import-file" />
        </label>
        <button className="btn-primary btn-sm" disabled={pending} data-testid="check-file">{pending && !preview ? "Checking…" : "Check file"}</button>
      </form>

      {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-sm font-medium text-red-800 ring-1 ring-red-200">⛔ {error}</p>}

      {done && (
        <div role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900 ring-1 ring-emerald-200" data-testid="import-done">
          <p className="font-semibold">✅ Import done: {done.added} book{done.added === 1 ? "" : "s"} added, {done.updated} updated{done.priceChanged ? `, ${done.priceChanged} price${done.priceChanged === 1 ? "" : "s"} changed` : ""}.</p>
          {done.copies > 0 && <p className="mt-1">{done.copies.toLocaleString("en-IN")} copies were received at the Central Store.</p>}
          <p className="mt-2 flex flex-wrap gap-2">
            <Link href="/stock" className="btn-secondary btn-sm">📦 See Book Stock</Link>
            {done.copies > 0 && <Link href="/stock/assign-dham" className="btn-secondary btn-sm">🚚 Send books to a Dham</Link>}
            <button type="button" onClick={reset} className="btn-secondary btn-sm">Import another file</button>
          </p>
        </div>
      )}

      {preview && (
        <div className="space-y-3" data-testid="import-preview">
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-800 ring-1 ring-emerald-200">🆕 {count("new")} new</span>
            <span className="rounded-full bg-blue-50 px-2.5 py-1 font-semibold text-blue-800 ring-1 ring-blue-200">✏️ {count("update")} update</span>
            {errors > 0 && <span className="rounded-full bg-red-50 px-2.5 py-1 font-semibold text-red-800 ring-1 ring-red-200">⛔ {errors} with problems</span>}
            {copies > 0 && <span className="rounded-full bg-stone-100 px-2.5 py-1 font-semibold text-ink-700 ring-1 ring-stone-200">📦 {copies.toLocaleString("en-IN")} copies to Central Store</span>}
          </div>
          <div className="max-h-[26rem] overflow-auto rounded-xl border border-stone-200">
            <table className="data-table min-w-[760px] text-sm">
              <thead className="sticky top-0"><tr><th>Row</th><th>Status</th><th>Book</th><th>Code</th><th>Size</th><th className="text-right">Price</th><th className="text-right">Copies</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.row} className={r.action === "error" ? "bg-red-50/60" : ""}>
                    <td className="tabular-nums text-ink-500">{r.row}</td>
                    <td>{r.action === "new" ? <span className="font-semibold text-emerald-700">New</span> : r.action === "update" ? <span className="font-semibold text-blue-700">Update</span> : <span className="font-semibold text-red-700">Problem</span>}</td>
                    <td>
                      <span className="font-semibold text-ink-900">{r.title || "—"}</span> <span className="text-ink-500">· {r.language || "—"}</span>
                      {r.errors.map((e) => <span key={e} className="block text-xs font-semibold text-red-700">⚠ {e}</span>)}
                    </td>
                    <td className="whitespace-nowrap">{r.sku || "—"}{r.codeMade && <span className="block text-[11px] text-ink-500">made for you</span>}</td>
                    <td>{r.size === "big" ? "Big" : "Small"}</td>
                    <td className="whitespace-nowrap text-right tabular-nums">
                      {r.action === "update" && r.oldPricePaise !== r.pricePaise && r.oldPricePaise != null ? <><span className="text-ink-400 line-through">{rupees(r.oldPricePaise)}</span> → </> : null}
                      {r.pricePaise ? rupees(r.pricePaise) : "—"}
                    </td>
                    <td className="text-right tabular-nums">{r.qty || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {errors > 0 ? (
            <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-900 ring-1 ring-amber-200">
              Fix the rows marked <b>Problem</b> in your Excel file, save it, and press <b>Check file</b> again. Nothing has been saved.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={confirm} disabled={pending} className="btn-success" data-testid="confirm-import">
                {pending ? "Importing…" : `✅ Confirm import (${rows.length} book${rows.length === 1 ? "" : "s"})`}
              </button>
              <button type="button" onClick={reset} disabled={pending} className="btn-secondary">Cancel</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
