import "server-only";
import ExcelJS from "exceljs";
import { toPaise } from "./format";

/**
 * Excel / CSV book list import. One row per book.
 * Required: Book Name, Language, Price (₹). Optional: Book Code, Size (Big/Small),
 * Copies Received (added to the Central Store), Cover Image URL.
 * A row whose Book Code (or, without a code, whose name + language) already exists updates that book.
 */
export const COLUMNS = [
  { key: "title", header: "Book Name", required: true, example: "Bhagavad Gita As It Is", help: "Full name of the book." },
  { key: "language", header: "Language", required: true, example: "English", help: "e.g. English, Telugu, Hindi." },
  { key: "price", header: "Price (₹)", required: true, example: 350, help: "Price for one copy in rupees, e.g. 350 or 120.50." },
  { key: "sku", header: "Book Code", required: false, example: "BG-EN", help: "Short unique code. Leave empty to create one automatically." },
  { key: "size", header: "Size", required: false, example: "Big", help: "Big or Small. Empty = Small." },
  { key: "qty", header: "Copies Received", required: false, example: 50, help: "Copies that arrived now. They are added to the Central Store. Empty = 0." },
  { key: "source", header: "Stock Source", required: false, example: "Temple Store", help: "Needed when Copies Received is more than 0: Temple Store or External Central." },
  { key: "coverUrl", header: "Cover Image URL", required: false, example: "", help: "Optional link to a picture of the cover (https://…)." },
] as const;
type Key = (typeof COLUMNS)[number]["key"];

/** Header names people commonly use for each column. */
const ALIASES: Record<Key, string[]> = {
  title: ["book name", "book", "name", "title", "book title"],
  language: ["language", "lang"],
  price: ["price (₹)", "price", "price (rs)", "price rs", "mrp", "rate", "amount", "price(₹)"],
  sku: ["book code", "code", "sku", "book id"],
  size: ["size", "book size", "type"],
  qty: ["copies received", "copies", "quantity", "qty", "stock", "opening stock", "received"],
  source: ["stock source", "source", "origin", "stock origin"],
  coverUrl: ["cover image url", "cover", "cover url", "image", "image url"],
};

/** "Temple Store" / "External Central" (and short forms) → lot source. */
export function parseSource(v: string | undefined): "temple_store" | "external_central" | null | "bad" {
  const s = (v ?? "").trim().toLowerCase().replace(/[^a-z]/g, "");
  if (!s) return null;
  if (["templestore", "temple", "ts"].includes(s)) return "temple_store";
  if (["externalcentral", "external", "ec", "centralexternal"].includes(s)) return "external_central";
  return "bad";
}

export const MAX_ROWS = 1000;
export const MAX_BYTES = 2 * 1024 * 1024;

export type RawRow = { row: number } & Partial<Record<Key, string>>;

const clean = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "object") {
    const o = v as { text?: string; result?: unknown; richText?: { text: string }[]; hyperlink?: string };
    if (o.richText) return o.richText.map((r) => r.text).join("").trim();
    if (o.text != null) return String(o.text).trim();
    if (o.result != null) return String(o.result).trim();
    if (o.hyperlink) return String(o.hyperlink).trim();
  }
  return String(v).trim();
};
const norm = (h: string) => h.toLowerCase().replace(/\*/g, "").replace(/\s+/g, " ").trim();

function mapHeaders(headers: string[]) {
  const map = new Map<number, Key>();
  headers.forEach((h, i) => {
    const n = norm(h);
    for (const [k, list] of Object.entries(ALIASES) as [Key, string[]][]) if (list.includes(n) && ![...map.values()].includes(k)) map.set(i, k);
  });
  return map;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/** Read the first sheet (or a CSV) into rows keyed by column. Throws a friendly message on problems. */
export async function readBookFile(name: string, buf: Buffer): Promise<RawRow[]> {
  let grid: string[][] = [];
  if (/\.csv$/i.test(name)) grid = parseCsv(buf.toString("utf8").replace(/^﻿/, ""));
  else if (/\.xlsx$/i.test(name)) {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buf as unknown as ArrayBuffer);
    } catch {
      throw new Error("This file could not be opened. Please save it as an Excel workbook (.xlsx) and try again.");
    }
    const ws = wb.worksheets.find((w) => w.name.toLowerCase() === "books") ?? wb.worksheets[0];
    if (!ws) throw new Error("The file has no sheets.");
    ws.eachRow({ includeEmpty: true }, (r, n) => {
      const vals: string[] = [];
      for (let c = 1; c <= Math.max(ws.columnCount, COLUMNS.length); c++) vals.push(clean(r.getCell(c).value));
      grid[n - 1] = vals;
    });
    grid = Array.from(grid, (r) => r ?? []);
  } else throw new Error("Please upload an Excel file (.xlsx) or a CSV file. Old .xls files: open in Excel and “Save As” .xlsx.");

  const headerAt = grid.findIndex((r) => r.some((c) => mapHeaders([c]).size > 0) && mapHeaders(r).size >= 2);
  if (headerAt < 0) throw new Error("No column headings found. The first row must have headings like Book Name, Language, Price (₹) — download the sample file.");
  const map = mapHeaders(grid[headerAt]);
  const missing = COLUMNS.filter((c) => c.required && ![...map.values()].includes(c.key)).map((c) => c.header);
  if (missing.length) throw new Error(`Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. Download the sample file to see the headings.`);
  const out: RawRow[] = [];
  for (let i = headerAt + 1; i < grid.length; i++) {
    const r = grid[i] ?? [];
    if (!r.some((c) => c && c.trim())) continue;
    const row: RawRow = { row: i + 1 };
    map.forEach((k, idx) => { row[k] = clean(r[idx]); });
    out.push(row);
  }
  if (!out.length) throw new Error("The file has headings but no book rows.");
  if (out.length > MAX_ROWS) throw new Error(`Too many rows (${out.length}). Please import at most ${MAX_ROWS} books at a time.`);
  return out;
}

export type Existing = { id: number; sku: string; title: string; language: string; pricePaise: number; size: "big" | "small" };
export type PreviewRow = {
  row: number;
  action: "new" | "update" | "error";
  title: string; language: string; sku: string; size: "big" | "small"; pricePaise: number; qty: number; coverUrl: string | null;
  source: "temple_store" | "external_central" | null;
  bookId?: number; oldPricePaise?: number; codeMade?: boolean;
  errors: string[];
};

const initials = (t: string) => {
  const words = t.replace(/[^A-Za-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w && !/^(as|it|is|of|the|and|a|an|to|in|on|sri|srimad|śrī)$/i.test(w));
  // one main word ("Sri Isopanisad") → first 3 letters (ISO); else initials (Bhagavad Gita → BG)
  const code = words.length === 1 ? words[0].slice(0, 3) : words.map((w) => w[0]).join("");
  return code.toUpperCase().slice(0, 4) || "BK";
};

/** Check every row against the rules and the books already in the app. Nothing is saved here. */
export function checkRows(raw: RawRow[], existing: Existing[]): PreviewRow[] {
  const bySku = new Map(existing.map((b) => [b.sku.toUpperCase(), b]));
  const byName = new Map(existing.map((b) => [`${b.title.trim().toLowerCase()}|${b.language.trim().toLowerCase()}`, b]));
  const usedCodes = new Set(existing.map((b) => b.sku.toUpperCase()));
  const seenCodes = new Map<string, number>();
  const seenNames = new Map<string, number>();
  const out: PreviewRow[] = [];
  for (const r of raw) {
    const errors: string[] = [];
    const title = (r.title ?? "").replace(/\s+/g, " ").trim();
    const language = (r.language ?? "").replace(/\s+/g, " ").trim();
    if (title.length < 2) errors.push("Book Name is empty");
    if (title.length > 150) errors.push("Book Name is too long");
    if (language.length < 2) errors.push("Language is empty");
    const pricePaise = toPaise(r.price ?? "");
    if (!r.price) errors.push("Price is empty");
    else if (!(pricePaise > 0)) errors.push(`Price “${r.price}” is not a number above 0`);
    else if (pricePaise > 10_000_000) errors.push("Price looks too high");
    const sizeRaw = (r.size ?? "").toLowerCase();
    const size = sizeRaw.startsWith("b") ? "big" : "small";
    if (sizeRaw && !["big", "small", "b", "s", "big book", "small book"].includes(sizeRaw)) errors.push(`Size “${r.size}” must be Big or Small`);
    const qtyRaw = (r.qty ?? "").replace(/,/g, "");
    const qty = qtyRaw ? Number(qtyRaw) : 0;
    if (qtyRaw && (!Number.isInteger(qty) || qty < 0)) errors.push(`Copies Received “${r.qty}” must be a whole number`);
    if (qty > 1_000_000) errors.push("Copies Received looks too high");
    const source = parseSource(r.source);
    if (source === "bad") errors.push(`Stock Source “${r.source}” must be Temple Store or External Central`);
    else if (qty > 0 && !source) errors.push("Stock Source is empty — write Temple Store or External Central for the copies received");
    const coverUrl = (r.coverUrl ?? "").trim() || null;
    if (coverUrl && !/^https?:\/\/\S+$/i.test(coverUrl)) errors.push("Cover Image URL must start with http:// or https://");

    let sku = (r.sku ?? "").trim().toUpperCase().replace(/\s+/g, "-");
    if (sku && (sku.length < 2 || sku.length > 30)) errors.push("Book Code must be 2–30 characters");
    const nameKey = `${title.toLowerCase()}|${language.toLowerCase()}`;
    const match = (sku && bySku.get(sku)) || (!sku ? byName.get(nameKey) : undefined);
    let codeMade = false;
    if (!sku && match) sku = match.sku;
    if (!sku && title && language) {
      const base = `${initials(title)}-${language.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase() || "XX"}`;
      sku = base;
      for (let n = 2; usedCodes.has(sku) || seenCodes.has(sku); n++) sku = `${base}-${n}`;
      codeMade = true;
    }
    if (sku && seenCodes.has(sku)) errors.push(`Book Code ${sku} is repeated (also on row ${seenCodes.get(sku)})`);
    else if (!sku || !match) {
      if (title && seenNames.has(nameKey)) errors.push(`Same book and language repeated (also on row ${seenNames.get(nameKey)})`);
    }
    if (sku) seenCodes.set(sku, r.row);
    if (title) seenNames.set(nameKey, r.row);
    if (!match && sku && usedCodes.has(sku) && !codeMade) errors.push(`Book Code ${sku} is already used`);
    if (!match && !codeMade && byName.has(nameKey)) errors.push(`“${title}” in ${language} already exists with code ${byName.get(nameKey)!.sku} — use that code to update it`);

    out.push({
      row: r.row,
      action: errors.length ? "error" : match ? "update" : "new",
      title, language, sku, size: size as "big" | "small", pricePaise: Number.isFinite(pricePaise) ? pricePaise : 0, qty: Number.isInteger(qty) ? qty : 0, coverUrl,
      source: source === "bad" ? null : source,
      bookId: match?.id, oldPricePaise: match?.pricePaise, codeMade, errors,
    });
  }
  return out;
}

/** The sample file people download, fill in and upload. */
export async function sampleWorkbook() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Gaurangadham Grantha Seva";
  const ws = wb.addWorksheet("Books", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = COLUMNS.map((c) => ({ header: c.required ? `${c.header} *` : c.header, key: c.key, width: c.key === "title" ? 36 : c.key === "coverUrl" ? 34 : 18 }));
  const head = ws.getRow(1);
  head.height = 22;
  head.eachCell((cell, n) => {
    const req = COLUMNS[n - 1].required;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: req ? "FFD95512" : "FF1D3772" } };
    cell.alignment = { vertical: "middle" };
    cell.note = `${req ? "Required. " : "Optional. "}${COLUMNS[n - 1].help}`;
  });
  const examples = [
    { title: "Bhagavad Gita As It Is", language: "English", price: 350, sku: "BG-EN", size: "Big", qty: 50, source: "Temple Store", coverUrl: "" },
    { title: "Bhagavad Gita As It Is", language: "Telugu", price: 300, sku: "BG-TE", size: "Big", qty: 40, source: "External Central", coverUrl: "" },
    { title: "Sri Isopanisad", language: "Hindi", price: 60, sku: "", size: "Small", qty: 100, source: "Temple Store", coverUrl: "" },
    { title: "The Science of Self-Realization", language: "English", price: 180, sku: "", size: "Small", qty: "", source: "", coverUrl: "" },
  ];
  examples.forEach((e) => ws.addRow(e));
  ws.getColumn("price").numFmt = "#,##0.00";
  ws.getColumn("qty").numFmt = "0";
  for (let r = 2; r <= 500; r++) ws.getCell(`E${r}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"Big,Small"'], showErrorMessage: true, errorTitle: "Size", error: "Choose Big or Small" };
  for (let r = 2; r <= 500; r++) ws.getCell(`G${r}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"Temple Store,External Central"'], showErrorMessage: true, errorTitle: "Stock Source", error: "Choose Temple Store or External Central" };
  const help = wb.addWorksheet("How to fill");
  help.columns = [{ header: "Column", key: "c", width: 22 }, { header: "Required?", key: "r", width: 12 }, { header: "What to type", key: "h", width: 80 }];
  help.getRow(1).font = { bold: true };
  COLUMNS.forEach((c) => help.addRow({ c: c.header, r: c.required ? "Yes" : "No", h: c.help }));
  help.addRow({});
  for (const line of [
    "One row per book. Keep the headings in row 1 exactly as they are.",
    "Same book in two languages = two rows (e.g. Bhagavad Gita English and Bhagavad Gita Telugu).",
    "A row with a Book Code that already exists UPDATES that book (name, language, size, price) and adds its copies.",
    "Delete the example rows before importing, or change them to your books.",
    "After uploading you will see a preview; nothing is saved until you press Confirm import.",
  ]) help.addRow({ c: "•", h: line });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
