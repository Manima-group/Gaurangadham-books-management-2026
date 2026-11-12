import "server-only";
import path from "node:path";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";

export type ColKind = "text" | "int" | "money" | "date";
export type Column = { header: string; key: string; kind?: ColKind; width?: number };
export type Section = {
  name: string;
  note?: string;
  columns: Column[];
  rows: Record<string, unknown>[];
  /** Columns to sum into a bold totals row (int / money columns). */
  totals?: string[];
};
export type ReportSpec = {
  title: string;
  filename: string; // without extension
  meta: [string, string][]; // "Dham: Hyderabad", "Period: Today"…
  sections: Section[];
};

const SAFFRON = "FFD95512";
const NAVY = "FF0F1D3A";
const fmtDate = (v: string) => {
  const d = new Date(v.length === 10 ? v + "T00:00:00+05:30" : v);
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(d);
};
const inr = (paise: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2, minimumFractionDigits: paise % 100 ? 2 : 0 }).format(paise / 100);
const generatedAt = () =>
  new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date());

function sumOf(s: Section, key: string) {
  return s.rows.reduce((a, r) => a + Number(r[key] ?? 0), 0);
}

/* ------------------------------------------------------------------ */
/* Excel                                                                */
/* ------------------------------------------------------------------ */

export async function toXlsx(spec: ReportSpec): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = APP_NAME;
  wb.created = new Date();
  for (const s of spec.sections) {
    const headerRow = 3 + spec.meta.length + (s.note ? 1 : 0) + 1;
    const ws = wb.addWorksheet(s.name.slice(0, 31).replace(/[\\/?*[\]:]/g, "-"), { views: [{ state: "frozen", ySplit: headerRow }] });
    const ncol = s.columns.length;
    ws.columns = s.columns.map((c) => ({ key: c.key, width: c.width ?? (c.kind === "text" || !c.kind ? 26 : 15) }));
    // Title block
    ws.mergeCells(1, 1, 1, Math.max(ncol, 2));
    const t = ws.getCell(1, 1);
    t.value = spec.title;
    t.font = { bold: true, size: 15, color: { argb: NAVY } };
    ws.mergeCells(2, 1, 2, Math.max(ncol, 2));
    ws.getCell(2, 1).value = `${APP_NAME} · ${APP_TAGLINE} · Generated ${generatedAt()}`;
    ws.getCell(2, 1).font = { size: 9, color: { argb: "FF5D6985" } };
    spec.meta.forEach(([k, v], i) => {
      ws.getCell(3 + i, 1).value = k;
      ws.getCell(3 + i, 1).font = { bold: true, size: 10 };
      ws.getCell(3 + i, 2).value = v;
    });
    if (s.note) {
      ws.getCell(3 + spec.meta.length, 1).value = s.note;
      ws.getCell(3 + spec.meta.length, 1).font = { italic: true, size: 9, color: { argb: "FF5D6985" } };
    }
    const r0 = headerRow - 1; // header sits on r0 + 1, one blank row after the meta/note
    // Header
    const hdr = ws.getRow(r0 + 1);
    s.columns.forEach((c, i) => {
      const cell = hdr.getCell(i + 1);
      cell.value = c.header;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SAFFRON } };
      cell.alignment = { vertical: "middle", horizontal: c.kind === "text" || !c.kind ? "left" : "right", wrapText: true };
    });
    hdr.height = 22;
    // Rows
    s.rows.forEach((row, ri) => {
      const xr = ws.getRow(r0 + 2 + ri);
      s.columns.forEach((c, i) => {
        const v = row[c.key];
        const cell = xr.getCell(i + 1);
        if (v == null || v === "") cell.value = null;
        else if (c.kind === "money") { cell.value = Number(v) / 100; cell.numFmt = '"₹"#,##,##0.00'; }
        else if (c.kind === "int") { cell.value = Number(v); cell.numFmt = "#,##,##0"; }
        else if (c.kind === "date") { cell.value = new Date(String(v).slice(0, 10) + "T00:00:00Z"); cell.numFmt = "dd mmm yyyy"; }
        else cell.value = String(v);
        if (ri % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF6ED" } };
      });
    });
    const last = r0 + 1 + s.rows.length;
    if (s.rows.length) ws.autoFilter = { from: { row: r0 + 1, column: 1 }, to: { row: last, column: ncol } };
    if (s.totals?.length && s.rows.length) {
      const tr = ws.getRow(last + 1);
      tr.getCell(1).value = "Total";
      s.columns.forEach((c, i) => {
        if (!s.totals!.includes(c.key)) return;
        const cell = tr.getCell(i + 1);
        cell.value = c.kind === "money" ? sumOf(s, c.key) / 100 : sumOf(s, c.key);
        cell.numFmt = c.kind === "money" ? '"₹"#,##,##0.00' : "#,##,##0";
      });
      tr.font = { bold: true };
      tr.eachCell((cell) => (cell.border = { top: { style: "thin", color: { argb: NAVY } } }));
    }
    if (!s.rows.length) ws.getCell(r0 + 2, 1).value = "No records for these filters.";
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/* ------------------------------------------------------------------ */
/* PDF                                                                  */
/* ------------------------------------------------------------------ */

const FONT = path.join(process.cwd(), "assets", "fonts", "NotoSans-Regular.ttf");
const FONT_BOLD = path.join(process.cwd(), "assets", "fonts", "NotoSans-Bold.ttf");

function cellText(c: Column, v: unknown) {
  if (v == null || v === "") return "";
  if (c.kind === "money") return inr(Number(v));
  if (c.kind === "int") return Number(v).toLocaleString("en-IN");
  if (c.kind === "date") return fmtDate(String(v));
  return String(v);
}

export async function toPdf(spec: ReportSpec): Promise<Buffer> {
  const wide = spec.sections.some((s) => s.columns.length > 6);
  const doc = new PDFDocument({ size: "A4", layout: wide ? "landscape" : "portrait", margin: 36, bufferPages: true, info: { Title: spec.title, Author: APP_NAME } });
  doc.registerFont("R", FONT);
  doc.registerFont("B", FONT_BOLD);
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((res) => doc.on("end", () => res(Buffer.concat(chunks))));

  const W = doc.page.width - 72;
  const bottom = () => doc.page.height - 50;

  // Header band
  doc.rect(0, 0, doc.page.width, 6).fill("#d95512");
  doc.fillColor("#0f1d3a").font("B").fontSize(17).text(spec.title, 36, 26, { width: W });
  doc.font("R").fontSize(8.5).fillColor("#5d6985").text(`${APP_NAME} · ${APP_TAGLINE} · Generated ${generatedAt()}`, { width: W });
  doc.moveDown(0.6);
  for (const [k, v] of spec.meta) {
    doc.font("B").fontSize(9.5).fillColor("#0f1d3a").text(`${k}: `, { continued: true }).font("R").text(v);
  }
  doc.moveDown(0.6);

  for (const s of spec.sections) {
    if (doc.y > bottom() - 80) doc.addPage();
    doc.font("B").fontSize(12).fillColor("#0f1d3a").text(s.name, 36, doc.y);
    if (s.note) doc.font("R").fontSize(8.5).fillColor("#5d6985").text(s.note, { width: W });
    doc.moveDown(0.3);

    // Column widths: text columns share what's left after numeric ones.
    // Numbers get a fixed width; text columns share the rest in proportion to their `width` hint.
    const widths = s.columns.map((c) => (c.kind && c.kind !== "text" ? (c.kind === "date" ? 78 : 70) : (c.width ?? 26) * 3.2));
    const scale = W / widths.reduce((a, b) => a + b, 0);
    const ws = widths.map((w) => w * scale);

    const drawHeader = () => {
      const y = doc.y;
      doc.rect(36, y, W, 20).fill("#d95512");
      let x = 36;
      s.columns.forEach((c, i) => {
        doc.font("B").fontSize(8.5).fillColor("#ffffff").text(c.header, x + 4, y + 5, { width: ws[i] - 8, align: c.kind && c.kind !== "text" ? "right" : "left", lineBreak: false, ellipsis: true });
        x += ws[i];
      });
      doc.y = y + 20;
    };
    drawHeader();

    const rowsToDraw = [...s.rows];
    if (!rowsToDraw.length) {
      doc.font("R").fontSize(9).fillColor("#5d6985").text("No records for these filters.", 40, doc.y + 6);
      doc.moveDown(1.2);
      continue;
    }
    const totalRow = s.totals?.length ? Object.fromEntries(s.columns.map((c) => [c.key, s.totals!.includes(c.key) ? sumOf(s, c.key) : c === s.columns[0] ? "Total" : ""])) : null;
    const all = totalRow ? [...rowsToDraw, totalRow] : rowsToDraw;
    all.forEach((row, ri) => {
      const isTotal = totalRow && ri === all.length - 1;
      doc.font(isTotal ? "B" : "R").fontSize(8.5);
      const texts = s.columns.map((c, i) => (isTotal && i === 0 ? "Total" : cellText(c, row[c.key])));
      const h = Math.max(16, ...texts.map((t, i) => doc.heightOfString(t, { width: ws[i] - 8 }) + 6));
      if (doc.y + h > bottom()) {
        doc.addPage();
        drawHeader();
      }
      const y = doc.y;
      if (isTotal) doc.rect(36, y, W, h).fill("#ffead5");
      else if (ri % 2 === 1) doc.rect(36, y, W, h).fill("#fff6ed");
      let x = 36;
      texts.forEach((t, i) => {
        const c = s.columns[i];
        doc.fillColor("#1b2b4f").font(isTotal ? "B" : "R").fontSize(8.5).text(t, x + 4, y + 3, { width: ws[i] - 8, align: c.kind && c.kind !== "text" ? "right" : "left" });
        x += ws[i];
      });
      doc.y = y + h;
    });
    doc.moveDown(1.2);
  }

  // Footer on every page
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.font("R").fontSize(8).fillColor("#8792ab").text(`${APP_NAME} · ${spec.title} · Page ${i + 1} of ${range.count}`, 36, doc.page.height - 30, { width: W, align: "center", lineBreak: false });
  }
  doc.end();
  return done;
}
