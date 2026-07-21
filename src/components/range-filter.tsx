"use client";

import { useEffect, useMemo, useState } from "react";
import { monthLabel, cn } from "@/lib/utils";
import type { PnlMonthRow, RangeSelection } from "@/lib/pnl-range";

const PRESETS: { key: "6m" | "12m" | "ytd" | "all"; label: string }[] = [
  { key: "6m", label: "6M" },
  { key: "12m", label: "12M" },
  { key: "ytd", label: "YTD" },
  { key: "all", label: "All" },
];

export function RangeFilter({
  rows,
  value,
  onChange,
}: {
  rows: PnlMonthRow[];
  value: RangeSelection;
  onChange: (v: RangeSelection) => void;
}) {
  const months = useMemo(() => [...rows.map((r) => r.month)].sort(), [rows]);
  const [customFrom, setCustomFrom] = useState(months[0] ?? "");
  const [customTo, setCustomTo] = useState(months[months.length - 1] ?? "");

  const isCustom = value.preset === "custom";

  // Re-sync custom bounds if `rows` changes (e.g. cache-hit render followed by
  // a fresh fetch that adds a newer month) and the current selection is no
  // longer valid against the new `months` list. Don't clobber a still-valid
  // active custom selection.
  useEffect(() => {
    if (months.length === 0) return;
    const first = months[0];
    const last = months[months.length - 1];
    if (!customFrom || !months.includes(customFrom)) setCustomFrom(first);
    if (!customTo || !months.includes(customTo)) setCustomTo(last);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [months]);

  function applyCustom(from: string, to: string) {
    setCustomFrom(from);
    setCustomTo(to);
    onChange({ preset: "custom", from, to });
  }

  if (months.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex items-center rounded-lg border border-line-strong bg-surface p-0.5 shadow-btn">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => onChange({ preset: p.key })}
            aria-pressed={value.preset === p.key}
            className={cn(
              "px-3 py-1.5 text-[12.5px] font-medium rounded-md transition-colors",
              value.preset === p.key ? "bg-accent text-white shadow-btn" : "text-muted hover:text-ink",
            )}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => applyCustom(customFrom || months[0], customTo || months[months.length - 1])}
          aria-pressed={isCustom}
          className={cn(
            "px-3 py-1.5 text-[12.5px] font-medium rounded-md transition-colors",
            isCustom ? "bg-accent text-white shadow-btn" : "text-muted hover:text-ink",
          )}
        >
          Custom
        </button>
      </div>
      {isCustom && (
        <div className="rise flex items-center gap-2">
          <select
            className="select !w-auto !py-1.5 !text-[12.5px]"
            value={customFrom}
            onChange={(e) => applyCustom(e.target.value, customTo)}
          >
            {months.map((m) => (
              <option key={m} value={m}>{monthLabel(m)}</option>
            ))}
          </select>
          <span className="text-faint text-[12px]">to</span>
          <select
            className="select !w-auto !py-1.5 !text-[12.5px]"
            value={customTo}
            onChange={(e) => applyCustom(customFrom, e.target.value)}
          >
            {months.map((m) => (
              <option key={m} value={m}>{monthLabel(m)}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
