"use client";

import { cn } from "@/lib/utils";
import type { DateRangeSelection } from "@/lib/date-range";

const PRESETS: { key: "7d" | "30d" | "90d" | "ytd" | "all"; label: string }[] = [
  { key: "7d", label: "7D" },
  { key: "30d", label: "30D" },
  { key: "90d", label: "90D" },
  { key: "ytd", label: "YTD" },
  { key: "all", label: "All" },
];

export function DateRangeFilter({
  value,
  onChange,
}: {
  value: DateRangeSelection;
  onChange: (v: DateRangeSelection) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const isCustom = value.preset === "custom";
  const customFrom = isCustom ? value.from : today;
  const customTo = isCustom ? value.to : today;

  function applyCustom(from: string, to: string) {
    onChange({ preset: "custom", from, to });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex items-center rounded-lg border border-line-strong bg-surface p-0.5 shadow-btn">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
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
          type="button"
          onClick={() => applyCustom(customFrom, customTo)}
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
          <input
            type="date"
            className="input !w-auto !py-1.5 !text-[12.5px]"
            value={customFrom}
            onChange={(e) => applyCustom(e.target.value, customTo)}
          />
          <span className="text-faint text-[12px]">to</span>
          <input
            type="date"
            className="input !w-auto !py-1.5 !text-[12.5px]"
            value={customTo}
            onChange={(e) => applyCustom(customFrom, e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
