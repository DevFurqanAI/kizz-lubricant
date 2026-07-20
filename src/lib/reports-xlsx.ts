import { toNum, fmtDate, monthLabel } from "@/lib/utils";

/**
 * One shared builder behind every list-page Excel export (Sales, Purchasing,
 * Expenses, Salary, Profit & Loss) — same branded letterhead + zebra-striped
 * table + totals band as the customer ledger export, just column-configurable.
 *
 * ExcelJS is imported dynamically so it only downloads when someone exports.
 */

const BUSINESS_NAME = "KIZZ LUBRICANTS";
export const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Brand palette (ARGB) — matches src/lib/ledger-xlsx.ts.
const INK = "FF15161A";
const ACCENT = "FFE2540C";
const ACCENT_TINT = "FFFDEEE6";
const STRIPE = "FFF7F8FA";
const BORDER = "FFE2E4E8";
const TEXT = "FF1F2430";
const MUTED = "FF6B7280";
const GREEN = "FF047857";
const DANGER = "FFB42318";
const AMBER = "FFB45309";
const WHITE = "FFFFFFFF";

const NUM_FMT = "#,##0";
const HEADER_ROW = 4; // letterhead (1) + accent rule (2) + subtitle (3) sit above

type Align = "left" | "center" | "right";
type BSide = { style: "thin" | "medium"; color: { argb: string } };
type Border = { top?: BSide; left?: BSide; right?: BSide; bottom?: BSide };

export type ReportColumn<Row> = {
  header: string;
  align?: Align;
  numFmt?: string;
  /** Cell value for a data row. Return "" / null for a blank cell. */
  value: (row: Row) => string | number | null;
  /** Optional text color for this cell, e.g. to flag negative amounts. */
  color?: (row: Row) => string | undefined;
  /** Floor for the auto-fit column width — bump this for free-text columns like "Detail". */
  minWidth?: number;
  /** Ceiling for the auto-fit column width (default 30). */
  maxWidth?: number;
};

export type ReportTotal = {
  /** 0-based column index this total lands under. */
  col: number;
  value: number | string;
  color?: string;
};

export type ReportOptions<Row> = {
  /** Right-hand letterhead label, e.g. "SALES REPORT". */
  subtitle: string;
  /** Worksheet tab name (Excel forbids some characters — keep it short & plain). */
  sheetName: string;
  columns: ReportColumn<Row>[];
  rows: Row[];
  /** Rendered in the bold totals band under the table. */
  totals?: ReportTotal[];
  /** Shown left of the totals band, e.g. "TOTAL" or "GRAND TOTAL". */
  totalsLabel?: string;
  /** How many leading columns the totals label should span. */
  totalsLabelSpan?: number;
  /** Extra note appended above the table, e.g. the active search filter. */
  filterNote?: string;
};

export async function buildReportBlob<Row>(opts: ReportOptions<Row>): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Kizz Lubricants";
  const ws = wb.addWorksheet(opts.sheetName, {
    views: [{ state: "frozen", ySplit: HEADER_ROW }],
  });

  const fill = (argb: string) =>
    ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb } });
  const thin: BSide = { style: "thin", color: { argb: BORDER } };
  const grid: Border = { top: thin, left: thin, right: thin, bottom: thin };
  const lastCol = opts.columns.length;

  type Style = {
    fill?: string;
    color?: string;
    bold?: boolean;
    italic?: boolean;
    size?: number;
    align?: Align;
    numFmt?: string;
    border?: Border;
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
    cell.alignment = { horizontal: s.align ?? "left", vertical: "middle" };
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
  // Business name always gets at least 2 columns (A+B combined) so it never
  // renders squeezed into column A alone on narrow (3-4 column) reports.
  const nameEnd = Math.max(2, lastCol - 3);
  const subtitleStart = nameEnd + 1;
  ws.getRow(1).height = 30;
  merge(1, 1, 1, nameEnd, BUSINESS_NAME, { fill: INK, color: WHITE, bold: true, size: 16 });
  merge(1, subtitleStart, 1, lastCol, opts.subtitle, { fill: INK, color: "FFB9B0F7", bold: true, size: 9, align: "right" });

  // ── Row 2: thin accent rule ───────────────────────────────
  ws.getRow(2).height = 5;
  merge(2, 1, 2, lastCol, "", { fill: ACCENT });

  // ── Row 3: generated-on / filter note ─────────────────────
  const note = [`Generated ${fmtDate(new Date().toISOString().slice(0, 10))}`, opts.filterNote]
    .filter(Boolean)
    .join(" · ");
  merge(3, 1, 3, lastCol, note, { color: MUTED, italic: true, size: 8, align: "right" });

  // ── Row 4: table header ───────────────────────────────────
  ws.getRow(HEADER_ROW).height = 22;
  opts.columns.forEach((c, i) =>
    setCell(HEADER_ROW, i + 1, c.header, { fill: INK, color: WHITE, bold: true, size: 10, align: c.align ?? "left", border: grid }),
  );

  const widths = opts.columns.map((c) => c.header.length);
  const fit = (col0: number, text: string) => { widths[col0] = Math.max(widths[col0], text.length); };

  // ── Data rows ─────────────────────────────────────────────
  opts.rows.forEach((row, idx) => {
    const rr = HEADER_ROW + 1 + idx;
    const bg = idx % 2 === 1 ? STRIPE : WHITE;
    opts.columns.forEach((c, ci) => {
      const v = c.value(row);
      setCell(rr, ci + 1, v ?? "", {
        fill: bg,
        align: c.align ?? "left",
        numFmt: c.numFmt,
        color: c.color?.(row),
        border: grid,
      });
      fit(ci, v == null ? "" : String(v));
    });
  });

  // ── Totals band ────────────────────────────────────────────
  if (opts.totals && opts.totals.length > 0) {
    const tr = HEADER_ROW + 1 + opts.rows.length;
    const topMed: Border = { top: { style: "medium", color: { argb: INK } }, left: thin, right: thin, bottom: thin };
    const labelSpan = opts.totalsLabelSpan ?? Math.max(1, opts.totals[0].col);
    merge(tr, 1, tr, labelSpan, opts.totalsLabel ?? "TOTAL", { fill: ACCENT_TINT, bold: true, size: 10, align: "right", border: topMed });
    for (let c = labelSpan; c < lastCol; c++) {
      if (c >= labelSpan) ws.getCell(tr, c + 1).border = topMed;
    }
    for (const t of opts.totals) {
      setCell(tr, t.col + 1, t.value, { fill: ACCENT_TINT, bold: true, color: t.color, align: "right", numFmt: typeof t.value === "number" ? NUM_FMT : undefined, border: topMed });
      fit(t.col, String(t.value));
    }
  }

  // Guarantee the letterhead banners aren't clipped by the columns they span —
  // spread the extra width they need evenly across that span.
  const ensureSpanWidth = (start0: number, end0: number, text: string) => {
    const span = end0 - start0 + 1;
    const perCol = Math.ceil((text.length + 4) / span);
    for (let c = start0; c <= end0; c++) widths[c] = Math.max(widths[c], perCol);
  };
  ensureSpanWidth(0, nameEnd - 1, BUSINESS_NAME);
  ensureSpanWidth(subtitleStart - 1, lastCol - 1, opts.subtitle);

  // Content-based widths (+padding), clamped to a comfortable per-column range.
  widths.forEach((w, i) => {
    const col = opts.columns[i];
    ws.getColumn(i + 1).width = Math.min(col.maxWidth ?? 30, Math.max(col.minWidth ?? 10, w + 3));
  });

  // Landscape + fit-to-width so every column prints on one page — only the
  // row count should ever spill onto a second printed page, never a column.
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

// ── Page-specific report builders ─────────────────────────────────────

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

export type PnlMonthRow = {
  month: string;
  sales: number;
  purchasing: number;
  expenses: number;
  salary: number;
  totalCost: number;
  profit: number;
  margin: number;
};
export type PnlGrand = Omit<PnlMonthRow, "month">;

export async function buildPnlXlsx(rows: PnlMonthRow[], grand: PnlGrand): Promise<Blob> {
  const profitColor = (p: number) => (p >= 0 ? GREEN : DANGER);
  return buildReportBlob<PnlMonthRow>({
    subtitle: "PROFIT & LOSS REPORT",
    sheetName: "P&L",
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
