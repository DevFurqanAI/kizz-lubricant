import type { FullCustomer } from "@/lib/customercache";
import { toNum, fmtDate } from "@/lib/utils";

/**
 * Builds an Excel (.xlsx) ledger statement for one customer, matching the
 * classic colour-coded template: a light-blue letterhead banner, a 2x4
 * colour-block info grid (account title / whatsapp / land line / cell /
 * CNIC / e-mail / owner), a red mailing-address band, then a plain
 * bordered transaction table with a running balance.
 *
 * ExcelJS is imported dynamically so it only downloads when someone exports —
 * it never touches the page's initial bundle.
 */

const BUSINESS_NAME = "KIZZ LUBRICANTS";
export const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Template palette (ARGB) — matched to the reference spreadsheet.
const TITLE_BG = "FFD9E5F5";
const ACCOUNT_GREEN = "FF6AA84F";
const VALUE_ORANGE = "FFF1C232";
const CNIC_BLUE = "FF4A86E8";
const OWNER_LIGHTBLUE = "FF9FC5E8";
const WHATSAPP_RED = "FF990000";
const LANDLINE_GRAY = "FF999999";
const CELL_LIGHTGRAY = "FFD9D9D9";
const EMAIL_YELLOW = "FFFFD966";
const MAILING_RED = "FFFF0000";
const TABLE_HEADER_BG = "FFCFE2F3";
const BORDER = "FF000000";
const TEXT = "FF000000";
const WHITE = "FFFFFFFF";

const NUM_FMT = "#,##0";
const grp = (n: number) => n.toLocaleString("en-US");

type BSide = { style: "thin" | "medium"; color: { argb: string } };
type Border = { top?: BSide; left?: BSide; right?: BSide; bottom?: BSide };
type Align = "left" | "center" | "right";

export async function buildLedgerBlob(customer: FullCustomer): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Kizz Lubricants";
  const ws = wb.addWorksheet("Ledger");

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
  };

  const setCell = (row: number, col: number, value: unknown, s: Style = {}) => {
    const cell = ws.getCell(row, col);
    cell.value = value as never;
    cell.font = {
      name: "Calibri",
      size: s.size ?? 11,
      bold: s.bold ?? false,
      italic: s.italic ?? false,
      color: { argb: s.color ?? TEXT },
    };
    cell.alignment = {
      horizontal: s.align ?? "left",
      vertical: "middle",
      wrapText: s.wrap ?? false,
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

  // ── Row 1: letterhead banner ──────────────────────────────
  ws.getRow(1).height = 40;
  merge(1, 1, 1, 9, BUSINESS_NAME, { fill: TITLE_BG, color: TEXT, bold: true, size: 26, align: "center" });

  // ── Rows 2-5: colour-block info grid ──────────────────────
  const acct = customer.accountTitle || customer.name || "—";
  const infoRow = (
    row: number,
    lBg: string, lColor: string, lValue: string,
    rBg: string, rColor: string, rValue: string,
  ) => {
    ws.getRow(row).height = 22;
    merge(row, 1, row, 3, lValue, { fill: lBg, color: lColor, bold: true, align: "center", border: grid });
    setCell(row, 4, "", { fill: WHITE, border: grid });
    merge(row, 5, row, 9, rValue, { fill: rBg, color: rColor, bold: true, align: "center", border: grid });
  };

  infoRow(2, ACCOUNT_GREEN, WHITE, "ACCOUNT TITLE", WHATSAPP_RED, WHITE, `Whatsapp #${customer.whatsapp || "—"}`);
  infoRow(3, VALUE_ORANGE, TEXT, acct, LANDLINE_GRAY, WHITE, "Land Line #");
  infoRow(4, CNIC_BLUE, WHITE, `CNIC:${customer.cnic || "—"}`, CELL_LIGHTGRAY, TEXT, `Cell # ${customer.phone || "—"}`);
  infoRow(5, OWNER_LIGHTBLUE, TEXT, `OWNER : ${customer.owner || "—"}`, EMAIL_YELLOW, TEXT, customer.email ? `E-Mail: ${customer.email}` : "E-Mail");

  // ── Row 6: mailing address banner ─────────────────────────
  ws.getRow(6).height = 28;
  merge(6, 1, 6, 9, `Mailing Address:${customer.address || "—"}`, { fill: MAILING_RED, color: TEXT, bold: true, size: 14, align: "center" });

  // ── Row 7: ledger table header ────────────────────────────
  const HEADER_ROW = 7;
  const headers = ["Date", "Product", "Packing", "Unit", "Qty", "Rate", "Debit", "Credit", "Balance"];
  const aligns: Align[] = ["left", "left", "center", "center", "right", "right", "right", "right", "right"];
  ws.getRow(HEADER_ROW).height = 22;
  headers.forEach((h, i) =>
    setCell(HEADER_ROW, i + 1, h, { fill: TABLE_HEADER_BG, color: TEXT, bold: true, align: aligns[i], border: grid }),
  );

  // Track widest content per column so nothing gets clipped.
  const widths = headers.map((h) => h.length);
  const fit = (col0: number, text: string) => { widths[col0] = Math.max(widths[col0], text.length); };

  // ── Data rows ─────────────────────────────────────────────
  let idx = 0;
  for (const e of customer.entries) {
    const rr = HEADER_ROW + 1 + idx;
    const debit = toNum(e.debit);
    const credit = toNum(e.credit);
    const bal = toNum(e.balance);
    const isPayment = credit > 0 && debit === 0 && (!e.product || e.product === "Payment");

    setCell(rr, 1, fmtDate(e.date), { align: "left", border: grid });
    fit(0, fmtDate(e.date));
    if (isPayment) {
      setCell(rr, 2, "Receiving Amount", { align: "left", border: grid });
      setCell(rr, 3, "", { border: grid });
      setCell(rr, 4, "", { border: grid });
      fit(1, "Receiving Amount");
    } else {
      setCell(rr, 2, e.product || "", { align: "left", border: grid });
      setCell(rr, 3, e.packing || "", { align: "center", border: grid });
      setCell(rr, 4, e.unit || "", { align: "center", border: grid });
      fit(1, e.product || "");
      fit(2, e.packing || "");
      fit(3, e.unit || "");
    }
    setCell(rr, 5, e.qty ? toNum(e.qty) : "", { align: "right", numFmt: NUM_FMT, border: grid });
    setCell(rr, 6, e.rate ? toNum(e.rate) : "", { align: "right", numFmt: NUM_FMT, border: grid });
    setCell(rr, 7, debit > 0 ? debit : "", { align: "right", numFmt: NUM_FMT, border: grid });
    setCell(rr, 8, credit > 0 ? credit : "", { align: "right", numFmt: NUM_FMT, border: grid });
    setCell(rr, 9, bal === 0 ? "nil" : bal, { align: "right", numFmt: NUM_FMT, border: grid });

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
  merge(tr, 1, tr, 6, "TOTAL", { fill: TABLE_HEADER_BG, bold: true, align: "right", border: grid });
  setCell(tr, 7, totalDebit, { fill: TABLE_HEADER_BG, bold: true, align: "right", numFmt: NUM_FMT, border: grid });
  setCell(tr, 8, totalCredit, { fill: TABLE_HEADER_BG, bold: true, align: "right", numFmt: NUM_FMT, border: grid });
  setCell(tr, 9, currentBalance === 0 ? "nil" : currentBalance, { fill: TABLE_HEADER_BG, bold: true, align: "right", numFmt: NUM_FMT, border: grid });
  fit(6, grp(totalDebit));
  fit(7, grp(totalCredit));
  fit(8, currentBalance === 0 ? "nil" : grp(currentBalance));

  // Content-based widths (+padding), clamped to a comfortable range.
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = Math.min(30, Math.max(10, w + 3)); });

  // Landscape + fit-to-width so every column (including Balance) prints on
  // one page — only the row count should ever spill onto a second page.
  ws.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
  };

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: XLSX_MIME });
}
