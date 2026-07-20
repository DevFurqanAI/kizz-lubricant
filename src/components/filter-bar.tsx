"use client";

export function FilterBar({
  children,
  active,
  onClear,
}: {
  children: React.ReactNode;
  active: boolean;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {children}
      {active && (
        <button
          type="button"
          onClick={onClear}
          className="text-[12.5px] font-medium text-muted hover:text-danger transition-colors"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
