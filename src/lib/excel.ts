import type { FullCustomer } from "@/lib/customercache";
import type { PnlMonthRow } from "@/lib/pnl-range";
import { toNum, fmtDate, monthLabel } from "@/lib/utils";

/**
 * The single Excel (.xlsx) export library for the whole app — one customer-
 * ledger statement builder plus one configurable generic-report builder,
 * sharing one palette and one set of cell/merge helpers so every exported
 * sheet (Ledger, Sales, Purchasing, Expenses, Salary, Customers, P&L,
 * Payments) looks like one consistent, branded document: a light-blue
 * letterhead banner, a light-blue table header, plain white bordered rows
 * (no zebra striping), matching the classic reference template.
 *
 * ExcelJS is imported dynamically inside each builder so it only downloads
 * when someone actually exports — it never touches the initial page bundle.
 */

const BUSINESS_NAME = "KIZZ LUBRICANTS";
export const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// ── Shared brand palette (ARGB) — matches the reference template ──────────
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
const MUTED = "FF666666";
const WHITE = "FFFFFFFF";
const GREEN = "FF047857";
const DANGER = "FFB42318";
const AMBER = "FFB45309";

const NUM_FMT = "#,##0";
const grp = (n: number) => n.toLocaleString("en-US");

type Align = "left" | "center" | "right";
type BSide = { style: "thin" | "medium"; color: { argb: string } };
type Border = { top?: BSide; left?: BSide; right?: BSide; bottom?: BSide };
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

// ── Shared low-level helpers (bound to one worksheet at a time) ───────────
function makeCellHelpers(ws: import("exceljs").Worksheet) {
  const fill = (argb: string) =>
    ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb } });

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

  return { setCell, merge };
}

const thin: BSide = { style: "thin", color: { argb: BORDER } };
const grid: Border = { top: thin, left: thin, right: thin, bottom: thin };

// ═══════════════════════════════════════════════════════════════════════
//  Customer ledger statement — the reference-template builder
// ═══════════════════════════════════════════════════════════════════════

export async function buildLedgerBlob(customer: FullCustomer): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Kizz Lubricants";
  const ws = wb.addWorksheet("Ledger");
  const { setCell, merge } = makeCellHelpers(ws);

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

  const widths = headers.map((h) => h.length);
  const fit = (col0: number, text: string) => { widths[col0] = Math.max(widths[col0], text.length); };

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

  widths.forEach((w, i) => { ws.getColumn(i + 1).width = Math.min(30, Math.max(10, w + 3)); });

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

// ═══════════════════════════════════════════════════════════════════════
//  Generic configurable report builder — restyled to match the ledger
// ═══════════════════════════════════════════════════════════════════════

export type ReportColumn<Row> = {
  header: string;
  align?: Align;
  numFmt?: string;
  value: (row: Row) => string | number | null;
  color?: (row: Row) => string | undefined;
  minWidth?: number;
  maxWidth?: number;
};

export type ReportTotal = {
  col: number;
  value: number | string;
  color?: string;
};

export type ReportOptions<Row> = {
  subtitle: string;
  sheetName: string;
  columns: ReportColumn<Row>[];
  rows: Row[];
  totals?: ReportTotal[];
  totalsLabel?: string;
  totalsLabelSpan?: number;
  filterNote?: string;
};

const REPORT_HEADER_ROW = 3; // letterhead (1) + subtitle/date note (2) sit above

export async function buildReportBlob<Row>(opts: ReportOptions<Row>): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Kizz Lubricants";
  const ws = wb.addWorksheet(opts.sheetName, {
    views: [{ state: "frozen", ySplit: REPORT_HEADER_ROW }],
  });
  const { setCell, merge } = makeCellHelpers(ws);
  const lastCol = opts.columns.length;

  // ── Row 1: letterhead banner — identical treatment to the ledger export ──
  ws.getRow(1).height = 40;
  merge(1, 1, 1, lastCol, BUSINESS_NAME, { fill: TITLE_BG, color: TEXT, bold: true, size: 26, align: "center" });

  // ── Row 2: subtitle + generated-on / filter note ──────────────────────
  const note = [opts.subtitle, `Generated ${fmtDate(new Date().toISOString().slice(0, 10))}`, opts.filterNote]
    .filter(Boolean)
    .join(" · ");
  ws.getRow(2).height = 20;
  merge(2, 1, 2, lastCol, note, { color: MUTED, bold: true, italic: true, size: 10, align: "center" });

  // ── Row 3: table header — identical treatment to the ledger export ────
  ws.getRow(REPORT_HEADER_ROW).height = 22;
  opts.columns.forEach((c, i) =>
    setCell(REPORT_HEADER_ROW, i + 1, c.header, { fill: TABLE_HEADER_BG, color: TEXT, bold: true, size: 11, align: c.align ?? "left", border: grid }),
  );

  const widths = opts.columns.map((c) => c.header.length);
  const fit = (col0: number, text: string) => { widths[col0] = Math.max(widths[col0], text.length); };

  // ── Data rows — plain white, bordered, no zebra striping ──────────────
  opts.rows.forEach((row, idx) => {
    const rr = REPORT_HEADER_ROW + 1 + idx;
    opts.columns.forEach((c, ci) => {
      const v = c.value(row);
      setCell(rr, ci + 1, v ?? "", {
        align: c.align ?? "left",
        numFmt: c.numFmt,
        color: c.color?.(row),
        border: grid,
      });
      fit(ci, v == null ? "" : String(v));
    });
  });

  // ── Totals band — same TABLE_HEADER_BG as the ledger's totals row ─────
  if (opts.totals && opts.totals.length > 0) {
    const tr = REPORT_HEADER_ROW + 1 + opts.rows.length;
    const labelSpan = opts.totalsLabelSpan ?? Math.max(1, opts.totals[0].col);
    merge(tr, 1, tr, labelSpan, opts.totalsLabel ?? "TOTAL", { fill: TABLE_HEADER_BG, bold: true, align: "right", border: grid });
    for (const t of opts.totals) {
      setCell(tr, t.col + 1, t.value, { fill: TABLE_HEADER_BG, bold: true, color: t.color, align: "right", numFmt: typeof t.value === "number" ? NUM_FMT : undefined, border: grid });
      fit(t.col, String(t.value));
    }
  }

  const ensureSpanWidth = (start0: number, end0: number, text: string) => {
    const span = end0 - start0 + 1;
    const perCol = Math.ceil((text.length + 4) / span);
    for (let c = start0; c <= end0; c++) widths[c] = Math.max(widths[c], perCol);
  };
  ensureSpanWidth(0, lastCol - 1, BUSINESS_NAME);

  widths.forEach((w, i) => {
    const col = opts.columns[i];
    ws.getColumn(i + 1).width = Math.min(col.maxWidth ?? 30, Math.max(col.minWidth ?? 10, w + 3));
  });

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

// ── Page-specific report builders — unchanged data/column behavior ───────

export type SalesReportRow = {
  date: string;
  detail: string;
  customerName: string | null;
  packing: string | null;
  unit: string | null;
  qty: string | null;
  rate: string | null;
  amount: string;
  saleKg: string | null;
  saleKgUnit: string | null;
};

export async function buildSalesXlsx(rows: SalesReportRow[], filterNote?: string): Promise<Blob> {
  return buildReportBlob<SalesReportRow>({
    subtitle: "SALES REPORT",
    sheetName: "Sales",
    filterNote,
    columns: [
      { header: "Date", value: (r) => fmtDate(r.date) },
      { header: "Detail", minWidth: 24, maxWidth: 36, value: (r) => r.detail },
      { header: "Customer", value: (r) => r.customerName || "Cash" },
      { header: "Packing", align: "center", value: (r) => r.packing || "" },
      { header: "Unit", align: "center", value: (r) => r.unit || "" },
      { header: "Qty", align: "right", numFmt: NUM_FMT, value: (r) => (r.qty ? toNum(r.qty) : "") },
      { header: "Rate", align: "right", numFmt: NUM_FMT, value: (r) => (r.rate ? toNum(r.rate) : "") },
      { header: "Amount", align: "right", numFmt: NUM_FMT, value: (r) => toNum(r.amount) },
      { header: "Sale Kg/L", align: "right", numFmt: NUM_FMT, value: (r) => (r.saleKg ? toNum(r.saleKg) : "") },
    ],
    totals: [{ col: 7, value: rows.reduce((a, r) => a + toNum(r.amount), 0) }],
    rows,
  });
}

export type AmountEntryRow = { date: string; detail: string; amount: string };

export async function buildPurchasingXlsx(rows: AmountEntryRow[], filterNote?: string): Promise<Blob> {
  return buildReportBlob<AmountEntryRow>({
    subtitle: "PURCHASING REPORT",
    sheetName: "Purchasing",
    filterNote,
    columns: [
      { header: "Date", value: (r) => fmtDate(r.date) },
      { header: "Detail", value: (r) => r.detail },
      { header: "Amount", align: "right", numFmt: NUM_FMT, value: (r) => toNum(r.amount) },
    ],
    totals: [{ col: 2, value: rows.reduce((a, r) => a + toNum(r.amount), 0) }],
    rows,
  });
}

export async function buildExpensesXlsx(rows: AmountEntryRow[], filterNote?: string): Promise<Blob> {
  return buildReportBlob<AmountEntryRow>({
    subtitle: "EXPENSES REPORT",
    sheetName: "Expenses",
    filterNote,
    columns: [
      { header: "Date", value: (r) => fmtDate(r.date) },
      { header: "Detail", minWidth: 26, maxWidth: 38, value: (r) => r.detail },
      { header: "Amount", align: "right", numFmt: NUM_FMT, value: (r) => toNum(r.amount) },
    ],
    totals: [{ col: 2, value: rows.reduce((a, r) => a + toNum(r.amount), 0) }],
    rows,
  });
}

export type SalaryReportRow = { date: string; employee: string; amount: string; account: string };

export async function buildSalaryXlsx(rows: SalaryReportRow[], filterNote?: string): Promise<Blob> {
  return buildReportBlob<SalaryReportRow>({
    subtitle: "SALARY REPORT",
    sheetName: "Salary",
    filterNote,
    columns: [
      { header: "Date", value: (r) => fmtDate(r.date) },
      { header: "Employee", value: (r) => r.employee },
      { header: "Amount", align: "right", numFmt: NUM_FMT, value: (r) => toNum(r.amount) },
      { header: "Paid Via", value: (r) => r.account || "" },
    ],
    totals: [{ col: 2, value: rows.reduce((a, r) => a + toNum(r.amount), 0) }],
    rows,
  });
}

export type CustomerReportRow = {
  name: string;
  cnic: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  balance?: number;
};

export async function buildCustomersXlsx(rows: CustomerReportRow[], filterNote?: string): Promise<Blob> {
  return buildReportBlob<CustomerReportRow>({
    subtitle: "CUSTOMERS REPORT",
    sheetName: "Customers",
    filterNote,
    columns: [
      { header: "Name", minWidth: 18, value: (r) => r.name },
      { header: "CNIC", value: (r) => r.cnic || "" },
      { header: "Phone", value: (r) => r.phone || "" },
      { header: "Email", value: (r) => r.email || "" },
      { header: "Address", minWidth: 22, maxWidth: 36, value: (r) => r.address || "" },
      {
        header: "Balance",
        align: "right",
        numFmt: NUM_FMT,
        value: (r) => r.balance ?? 0,
        color: (r) => ((r.balance ?? 0) > 0 ? AMBER : (r.balance ?? 0) < 0 ? GREEN : undefined),
      },
    ],
    totals: [{ col: 5, value: rows.reduce((a, r) => a + (r.balance ?? 0), 0) }],
    rows,
  });
}

export type PnlGrand = Omit<PnlMonthRow, "month">;

export async function buildPnlXlsx(rows: PnlMonthRow[], grand: PnlGrand, filterNote?: string): Promise<Blob> {
  const profitColor = (p: number) => (p >= 0 ? GREEN : DANGER);
  return buildReportBlob<PnlMonthRow>({
    subtitle: "PROFIT & LOSS REPORT",
    sheetName: "P&L",
    filterNote,
    columns: [
      { header: "Month", value: (r) => monthLabel(r.month) },
      { header: "Sales", align: "right", numFmt: NUM_FMT, value: (r) => r.sales },
      { header: "Purchasing", align: "right", numFmt: NUM_FMT, value: (r) => r.purchasing },
      { header: "Expenses", align: "right", numFmt: NUM_FMT, value: (r) => r.expenses },
      { header: "Salary", align: "right", numFmt: NUM_FMT, value: (r) => r.salary },
      { header: "Total Cost", align: "right", numFmt: NUM_FMT, value: (r) => r.totalCost },
      { header: "Profit / Loss", align: "right", numFmt: NUM_FMT, value: (r) => r.profit, color: (r) => profitColor(r.profit) },
      { header: "Margin %", align: "right", numFmt: "0.0", value: (r) => Number(r.margin.toFixed(1)) },
    ],
    totalsLabel: "GRAND TOTAL",
    totalsLabelSpan: 1,
    totals: [
      { col: 1, value: grand.sales },
      { col: 2, value: grand.purchasing },
      { col: 3, value: grand.expenses },
      { col: 4, value: grand.salary },
      { col: 5, value: grand.totalCost },
      { col: 6, value: grand.profit, color: profitColor(grand.profit) },
      { col: 7, value: Number(grand.margin.toFixed(1)) },
    ],
    rows,
  });
}

export type PaymentsReportRow = { date: string; partyName: string; partnerName: string; amount: string; note: string | null };

export async function buildPaymentsXlsx(
  rows: PaymentsReportRow[],
  direction: "received" | "sent",
  filterNote?: string,
): Promise<Blob> {
  return buildReportBlob<PaymentsReportRow>({
    subtitle: direction === "received" ? "PAYMENTS RECEIVED REPORT" : "PAYMENTS SENT REPORT",
    sheetName: direction === "received" ? "Payments Received" : "Payments Sent",
    filterNote,
    columns: [
      { header: "Date", value: (r) => fmtDate(r.date) },
      { header: "Party", minWidth: 18, value: (r) => r.partyName },
      { header: "Owner", minWidth: 14, value: (r) => r.partnerName },
      { header: "Amount", align: "right", numFmt: NUM_FMT, value: (r) => toNum(r.amount) },
      { header: "Note", minWidth: 18, maxWidth: 30, value: (r) => r.note || "" },
    ],
    totals: [{ col: 3, value: rows.reduce((a, r) => a + toNum(r.amount), 0) }],
    rows,
  });
}
