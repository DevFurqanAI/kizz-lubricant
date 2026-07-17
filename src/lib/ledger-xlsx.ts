import type { FullCustomer } from "@/lib/customercache";
import { toNum, fmtDate } from "@/lib/utils";

/**
 * Builds a polished Excel (.xlsx) ledger statement for one customer:
 * a dark branded letterhead, a clean customer-info grid, then a
 * zebra-striped transaction table with a running balance and totals band.
 *
 * ExcelJS is imported dynamically so it only downloads when someone exports —
 * it never touches the page's initial bundle.
 */

const BUSINESS_NAME = "KIZZ LUBRICANTS";
export const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Brand palette (ARGB).
const INK = "FF111318";
const AMBER = "FFD97706";
const AMBER_TINT = "FFFDF1E3";
const STRIPE = "FFF7F8FA";
const LABEL_BG = "FFEEF0F3";
const BORDER = "FFE2E4E8";
const TEXT = "FF1F2430";
const MUTED = "FF6B7280";
const GREEN = "FF047857";
const WHITE = "FFFFFFFF";

const NUM_FMT = "#,##0";
const grp = (n: number) => n.toLocaleString("en-US");

const HEADER_ROW = 8; // ledger table header row (letterhead + info sit above)

type BSide = { style: "thin" | "medium"; color: { argb: string } };
type Border = { top?: BSide; left?: BSide; right?: BSide; bottom?: BSide };
type Align = "left" | "center" | "right";

export async function buildLedgerBlob(customer: FullCustomer): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Kizz Lubricants";
  const ws = wb.addWorksheet("Ledger", {
    views: [{ state: "frozen", ySplit: HEADER_ROW }],
  });

  const fill = (argb: string) =>
    ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb } });
  const thin: BSide = { style: "thin", color: { argb: BORDER } };
  const grid: Border = { top: thin, left: thin, right: thin, bottom: thin };

  type Style = {
    fill?: string;
    color?: string;
    bold?: boolean;
    italic?: boolean;
    size?: number;
    align?: Align;
    numFmt?: string;
    border?: Border;
    wrap?: boolean;
    indent?: number;
  };

  const setCell = (row: number, col: number, value: unknown, s: Style = {}) => {
    const cell = ws.getCell(row, col);
    cell.value = value as never;
    cell.font = {
      name: "Calibri",
      size: s.size ?? 10,
      bold: s.bold ?? false,
      italic: s.italic ?? false,
      color: { argb: s.color ?? TEXT },
    };
    cell.alignment = {
      horizontal: s.align ?? "left",
      vertical: "middle",
      wrapText: s.wrap ?? false,
      indent: s.indent ?? 0,
    };
    if (s.fill) cell.fill = fill(s.fill);
    if (s.numFmt) cell.numFmt = s.numFmt;
    if (s.border) cell.border = s.border;
    return cell;
  };

  const merge = (r1: number, c1: number, r2: number, c2: number, value: unknown, s: Style = {}) => {
    ws.mergeCells(r1, c1, r2, c2);
    setCell(r1, c1, value, s);
    if (s.border) {
      for (let r = r1; r <= r2; r++)
        for (let c = c1; c <= c2; c++) ws.getCell(r, c).border = s.border;
    }
  };

  // ── Row 1: dark letterhead banner ─────────────────────────
  ws.getRow(1).height = 30;
  merge(1, 1, 1, 6, BUSINESS_NAME, { fill: INK, color: WHITE, bold: true, size: 16, align: "left", indent: 1 });
  merge(1, 7, 1, 9, "LEDGER STATEMENT", { fill: INK, color: "FFF0B267", bold: true, size: 9, align: "right", indent: 1 });

  // ── Row 2: thin amber accent rule ─────────────────────────
  ws.getRow(2).height = 5;
  merge(2, 1, 2, 9, "", { fill: AMBER });

  // ── Rows 4-7: customer info grid (label | value pairs) ────
  const info = (row: number, lLabel: string, lValue: string, rLabel: string, rValue: string) => {
    setCell(row, 1, lLabel, { fill: LABEL_BG, color: MUTED, bold: true, size: 9, align: "right", border: grid });
    merge(row, 2, row, 4, lValue, { color: TEXT, align: "left", indent: 1, border: grid, wrap: true });
    setCell(row, 5, rLabel, { fill: LABEL_BG, color: MUTED, bold: true, size: 9, align: "right", border: grid });
    merge(row, 6, row, 9, rValue, { color: TEXT, align: "left", indent: 1, border: grid, wrap: true });
  };
  const acct = customer.accountTitle || customer.name || "—";
  info(4, "Account Title", acct, "WhatsApp", customer.whatsapp || "—");
  info(5, "Owner", customer.owner || "—", "Cell", customer.phone || "—");
  info(6, "CNIC", customer.cnic || "—", "Email", customer.email || "—");
  info(7, "Address", customer.address || "—", "Statement", fmtDate(new Date().toISOString().slice(0, 10)));

  // ── Row 8: ledger table header ────────────────────────────
  const headers = ["Date", "Product", "Packing", "Unit", "Qty", "Rate", "Debit", "Credit", "Balance"];
  const aligns: Align[] = ["left", "left", "center", "center", "right", "right", "right", "right", "right"];
  ws.getRow(HEADER_ROW).height = 22;
  headers.forEach((h, i) =>
    setCell(HEADER_ROW, i + 1, h, { fill: INK, color: WHITE, bold: true, size: 10, align: aligns[i], border: grid }),
  );

  // Track widest content per column so nothing gets clipped.
  const widths = headers.map((h) => h.length);
  const fit = (col0: number, text: string) => { widths[col0] = Math.max(widths[col0], text.length); };

  // ── Data rows ─────────────────────────────────────────────
  const balColor = (b: number) => (b > 0 ? AMBER : b < 0 ? GREEN : MUTED);
  let idx = 0;
  for (const e of customer.entries) {
    const rr = HEADER_ROW + 1 + idx;
    const bg = idx % 2 === 1 ? STRIPE : WHITE;
    const debit = toNum(e.debit);
    const credit = toNum(e.credit);
    const bal = toNum(e.balance);
    const isPayment = !e.product && credit > 0 && debit === 0;

    setCell(rr, 1, fmtDate(e.date), { fill: bg, align: "left", border: grid });
    fit(0, fmtDate(e.date));
    if (isPayment) {
      merge(rr, 2, rr, 4, "Receiving Amount", { fill: bg, color: MUTED, italic: true, align: "left", border: grid });
    } else {
      setCell(rr, 2, e.product || "", { fill: bg, align: "left", border: grid });
      setCell(rr, 3, e.packing || "", { fill: bg, align: "center", border: grid });
      setCell(rr, 4, e.unit || "", { fill: bg, align: "center", border: grid });
      fit(1, e.product || "");
      fit(2, e.packing || "");
      fit(3, e.unit || "");
    }
    setCell(rr, 5, e.qty ? toNum(e.qty) : "", { fill: bg, align: "right", numFmt: NUM_FMT, border: grid });
    setCell(rr, 6, e.rate ? toNum(e.rate) : "", { fill: bg, align: "right", numFmt: NUM_FMT, border: grid });
    setCell(rr, 7, debit > 0 ? debit : "", { fill: bg, align: "right", numFmt: NUM_FMT, border: grid });
    setCell(rr, 8, credit > 0 ? credit : "", { fill: bg, color: GREEN, align: "right", numFmt: NUM_FMT, border: grid });
    setCell(rr, 9, bal === 0 ? "nil" : bal, { fill: bg, color: balColor(bal), bold: true, align: "right", numFmt: NUM_FMT, border: grid });

    if (e.qty) fit(4, grp(toNum(e.qty)));
    if (e.rate) fit(5, grp(toNum(e.rate)));
    if (debit > 0) fit(6, grp(debit));
    if (credit > 0) fit(7, grp(credit));
    fit(8, bal === 0 ? "nil" : grp(bal));
    idx++;
  }

  // ── Totals band ───────────────────────────────────────────
  const totalDebit = customer.entries.reduce((a, e) => a + toNum(e.debit), 0);
  const totalCredit = customer.entries.reduce((a, e) => a + toNum(e.credit), 0);
  const last = customer.entries[customer.entries.length - 1];
  const currentBalance = last ? toNum(last.balance) : 0;
  const tr = HEADER_ROW + 1 + idx;
  const topMed: Border = { top: { style: "medium", color: { argb: INK } }, left: thin, right: thin, bottom: thin };
  merge(tr, 1, tr, 6, "TOTAL", { fill: AMBER_TINT, bold: true, size: 10, align: "right", indent: 1, border: topMed });
  setCell(tr, 7, totalDebit, { fill: AMBER_TINT, bold: true, align: "right", numFmt: NUM_FMT, border: topMed });
  setCell(tr, 8, totalCredit, { fill: AMBER_TINT, bold: true, color: GREEN, align: "right", numFmt: NUM_FMT, border: topMed });
  setCell(tr, 9, currentBalance === 0 ? "nil" : currentBalance, { fill: AMBER_TINT, bold: true, color: balColor(currentBalance), align: "right", numFmt: NUM_FMT, border: topMed });
  fit(6, grp(totalDebit));
  fit(7, grp(totalCredit));
  fit(8, currentBalance === 0 ? "nil" : grp(currentBalance));

  // ── Footer note ───────────────────────────────────────────
  merge(tr + 2, 1, tr + 2, 9, `Generated ${fmtDate(new Date().toISOString().slice(0, 10))} · Kizz Lubricants`, { color: MUTED, italic: true, size: 8, align: "right" });

  // Content-based widths (+padding), clamped to a comfortable range.
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = Math.min(30, Math.max(10, w + 3)); });

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: XLSX_MIME });
}
