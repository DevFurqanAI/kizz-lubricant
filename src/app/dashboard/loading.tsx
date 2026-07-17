/**
 * Segment-level loading UI. The App Router renders this the instant a nav link
 * is clicked — before the target ledger page mounts — so switching between
 * ledgers shows a structured skeleton instead of a blank flash. Pages that
 * already have warm localCache data paint over it near-instantly.
 */
export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header block */}
      <div className="space-y-2">
        <div className="h-3 w-24 bg-gray-200/70 rounded" />
        <div className="h-7 w-52 bg-gray-200 rounded" />
        <div className="h-3 w-72 bg-gray-100 rounded" />
      </div>

      {/* Controls row (search + total) */}
      <div className="flex items-center justify-between gap-4">
        <div className="h-10 w-full max-w-sm bg-gray-100 rounded-xl" />
        <div className="h-10 w-28 bg-gray-100 rounded-xl flex-shrink-0" />
      </div>

      {/* Table skeleton */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="h-11 bg-gradient-to-r from-[#1C1F27] to-[#0B0D12]" />
        <div className="divide-y divide-gray-50">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="px-4 py-4">
              <div className="h-4 bg-gray-100 rounded" style={{ width: `${90 - i * 6}%` }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
