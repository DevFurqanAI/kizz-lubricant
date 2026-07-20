"use client";

export function AmountRangeFilter({
  min,
  max,
  onChange,
}: {
  min: string;
  max: string;
  onChange: (min: string, max: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        inputMode="numeric"
        placeholder="Min Rs"
        value={min}
        onChange={(e) => onChange(e.target.value, max)}
        className="input !w-24 !py-1.5 !text-[12.5px] font-mono"
      />
      <span className="text-faint text-[12px]">–</span>
      <input
        type="number"
        inputMode="numeric"
        placeholder="Max Rs"
        value={max}
        onChange={(e) => onChange(min, e.target.value)}
        className="input !w-24 !py-1.5 !text-[12.5px] font-mono"
      />
    </div>
  );
}
