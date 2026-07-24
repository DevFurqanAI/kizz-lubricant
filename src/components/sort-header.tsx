import { ChevronUp, ChevronDown, ChevronsUpDown, ArrowDownWideNarrow, ArrowUpNarrowWide } from "lucide-react";

export type Sort = { col: string; dir: "asc" | "desc" };

/** Toggle direction when re-clicking the same column; new column defaults to desc. */
export function nextSort(current: Sort, col: string): Sort {
  if (current.col === col) return { col, dir: current.dir === "asc" ? "desc" : "asc" };
  return { col, dir: "desc" };
}

/** A sortable table header cell. Renders a button that reports its column on click. */
export function SortHeader({
  col,
  label,
  sort,
  onSort,
  align = "left",
}: {
  col: string;
  label: string;
  sort: Sort;
  onSort: (col: string) => void;
  align?: "left" | "right";
}) {
  const active = sort.col === col;
  const Icon = !active ? ChevronsUpDown : sort.dir === "asc" ? ChevronUp : ChevronDown;
  return (
    <th className={`th ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        onClick={() => onSort(col)}
        className={`group inline-flex items-center gap-1 transition-colors hover:text-ink ${
          align === "right" ? "flex-row-reverse" : ""
        } ${active ? "text-ink" : ""}`}
      >
        {label}
        <Icon
          className={`w-3.5 h-3.5 transition-opacity ${active ? "opacity-100 text-accent" : "opacity-40 group-hover:opacity-70"}`}
          strokeWidth={2.2}
        />
      </button>
    </th>
  );
}

/** Per-column wording for the labeled sort-direction toggle below. */
const SORT_LABELS: Record<string, { desc: string; asc: string }> = {
  date: { desc: "Newest first", asc: "Oldest first" },
  amount: { desc: "Highest first", asc: "Lowest first" },
};

/**
 * A labeled "Newest first / Oldest first" style button, for pages whose only
 * sort control is otherwise a subtle column-header click — kept visually
 * consistent with the Salary page's explicit toggle. Flips the direction of
 * whichever column is currently sorted; wording adapts to that column.
 */
export function SortToggleButton({ sort, onSort }: { sort: Sort; onSort: (col: string) => void }) {
  const labels = SORT_LABELS[sort.col] ?? SORT_LABELS.date;
  return (
    <button onClick={() => onSort(sort.col)} className="btn-secondary btn-sm">
      {sort.dir === "desc" ? <ArrowDownWideNarrow className="w-4 h-4" strokeWidth={2} /> : <ArrowUpNarrowWide className="w-4 h-4" strokeWidth={2} />}
      {sort.dir === "desc" ? labels.desc : labels.asc}
    </button>
  );
}
