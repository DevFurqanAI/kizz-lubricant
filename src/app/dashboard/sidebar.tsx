// "use client";

// import Link from "next/link";
// import { usePathname } from "next/navigation";
// import { signOut } from "next-auth/react";
// import { cn } from "@/lib/utils";

// const NAV = [
//   { href: "/dashboard", label: "Overview", icon: GridIcon },
//   { href: "/dashboard/customers", label: "Customers", icon: UsersIcon },
//   { href: "/dashboard/sales", label: "Sales", icon: TrendUpIcon },
//   { href: "/dashboard/purchasing", label: "Purchasing", icon: TrendDownIcon },
//   { href: "/dashboard/expenses", label: "Expenses", icon: ReceiptIcon },
//   { href: "/dashboard/salary", label: "Salary", icon: WalletIcon },
//   { href: "/dashboard/pnl", label: "Profit & Loss", icon: ChartIcon },
// ];

// export default function Sidebar({ userEmail }: { userEmail: string }) {
//   const path = usePathname();

//   const isActive = (href: string) =>
//     href === "/dashboard" ? path === "/dashboard" : path.startsWith(href);

//   return (
//     <aside className="w-[220px] flex-shrink-0 bg-[#111318] flex flex-col border-r border-white/5">
//       {/* Brand */}
//       <div className="px-5 pt-6 pb-5 border-b border-white/8">
//         <div className="inline-flex items-center gap-2.5">
//           <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#D4A33A] to-[#8F6621] flex items-center justify-center flex-shrink-0">
//             <span className="font-display font-bold text-white text-[10px] tracking-tight">NS</span>
//           </div>
//           <div>
//             <p className="font-display font-semibold text-white text-[13px] tracking-wider uppercase leading-none">
//               New Star
//             </p>
//             <p className="text-[10px] text-white/40 mt-0.5 tracking-widest uppercase font-mono">
//               Lubricants
//             </p>
//           </div>
//         </div>
//       </div>

//       {/* Nav */}
//       <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
//         <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-white/30">
//           Menu
//         </p>
//         {NAV.map(({ href, label, icon: Icon }) => {
//           const active = isActive(href);
//           return (
//             <Link
//               key={href}
//               href={href}
//               className={cn(
//                 "flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150",
//                 active
//                   ? "bg-[#D4A33A]/15 text-[#E8C06A] border border-[#D4A33A]/20"
//                   : "text-white/55 hover:text-white/90 hover:bg-white/5"
//               )}
//             >
//               <Icon className={cn("w-4 h-4 flex-shrink-0", active ? "text-[#D4A33A]" : "text-white/40")} />
//               {label}
//             </Link>
//           );
//         })}
//       </nav>

//       {/* Footer */}
//       <div className="px-3 py-4 border-t border-white/8">
//         <div className="px-3 mb-2">
//           <p className="text-[11px] text-white/35 truncate">{userEmail}</p>
//         </div>
//         <button
//           onClick={() => signOut({ callbackUrl: "/" })}
//           className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium text-white/50 hover:text-white/80 hover:bg-white/5 transition-all"
//         >
//           <LogoutIcon className="w-4 h-4 flex-shrink-0" />
//           Sign out
//         </button>
//       </div>
//     </aside>
//   );
// }

// /* ── Inline SVG icons ─────────────────────────────────────── */
// function GridIcon({ className }: { className?: string }) {
//   return (
//     <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
//       <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
//       <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
//     </svg>
//   );
// }
// function UsersIcon({ className }: { className?: string }) {
//   return (
//     <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
//       <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
//       <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
//     </svg>
//   );
// }
// function TrendUpIcon({ className }: { className?: string }) {
//   return (
//     <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
//       <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
//     </svg>
//   );
// }
// function TrendDownIcon({ className }: { className?: string }) {
//   return (
//     <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
//       <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" /><polyline points="17 18 23 18 23 12" />
//     </svg>
//   );
// }
// function ReceiptIcon({ className }: { className?: string }) {
//   return (
//     <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
//       <path d="M14 2H6a2 2 0 0 0-2 2v16l3-3 3 3 3-3 3 3V4a2 2 0 0 0-2-2z" />
//       <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="9" x2="8" y2="9" />
//     </svg>
//   );
// }
// function WalletIcon({ className }: { className?: string }) {
//   return (
//     <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
//       <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" /><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
//       <path d="M18 12a2 2 0 0 0 0 4h4v-4z" />
//     </svg>
//   );
// }
// function ChartIcon({ className }: { className?: string }) {
//   return (
//     <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
//       <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" />
//       <line x1="6" y1="20" x2="6" y2="14" />
//     </svg>
//   );
// }
// function LogoutIcon({ className }: { className?: string }) {
//   return (
//     <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
//       <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
//       <polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
//     </svg>
//   );
// }
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import {
  LayoutGrid,
  Users,
  TrendingUp,
  TrendingDown,
  Receipt,
  Wallet,
  BarChart3,
  LogOut,
} from "lucide-react";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutGrid, stage: "00" },
  { href: "/dashboard/customers", label: "Customers", icon: Users, stage: "01" },
  { href: "/dashboard/sales", label: "Sales", icon: TrendingUp, stage: "02" },
  { href: "/dashboard/purchasing", label: "Purchasing", icon: TrendingDown, stage: "03" },
  { href: "/dashboard/expenses", label: "Expenses", icon: Receipt, stage: "04" },
  { href: "/dashboard/salary", label: "Salary", icon: Wallet, stage: "05" },
  { href: "/dashboard/pnl", label: "Profit & Loss", icon: BarChart3, stage: "06" },
];

export default function Sidebar({ userEmail }: { userEmail: string }) {
  const path = usePathname();

  const isActive = (href: string) =>
    href === "/dashboard" ? path === "/dashboard" : path.startsWith(href);

  return (
    <>
      {/* ── Desktop sidebar (fixed left) ─────────────────────── */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 z-40 w-[248px] flex-col bg-white border-r border-black/[0.07]">
        {/* Brand */}
        <div className="px-5 pt-6 pb-5 border-b border-black/[0.07]">
          <div className="flex items-center gap-3">
            {/* Gauge-ring logo mark */}
            <div className="relative w-10 h-10 flex-shrink-0">
              <svg viewBox="0 0 40 40" className="absolute inset-0 w-full h-full -rotate-90">
                <circle cx="20" cy="20" r="18" fill="none" stroke="#00000010" strokeWidth="1.5" />
                <circle
                  cx="20" cy="20" r="18" fill="none"
                  stroke="#D97706" strokeWidth="1.5" strokeLinecap="round"
                  strokeDasharray="113"
                  strokeDashoffset="34"
                />
              </svg>
              <div className="absolute inset-[5px] rounded-full bg-[#0B0D12] flex items-center justify-center">
                <span className="font-bold text-white text-[10px] tracking-tight">NS</span>
              </div>
            </div>
            <div>
              <p className="font-display font-bold text-[#0B0D12] text-[13px] tracking-wider uppercase leading-none">
                Kizz Lubricants
              </p>
              <p className="text-[10px] text-black/40 mt-1 tracking-[0.2em] uppercase font-mono">
                Lubricants Co.
              </p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-5 px-3 space-y-0.5 overflow-y-auto">
          <p className="px-3 mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-black/30 font-mono">
            Ledger — 01–06
          </p>
          {NAV.map(({ href, label, icon: Icon, stage }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200",
                  active
                    ? "bg-[#0B0D12] text-white shadow-[0_4px_14px_-4px_rgba(217,119,6,0.35)]"
                    : "text-black/55 hover:text-black hover:bg-black/[0.04]"
                )}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-full bg-[#D97706]" />
                )}
                <Icon
                  className={cn(
                    "w-4 h-4 flex-shrink-0 transition-colors",
                    active ? "text-[#F59E0B]" : "text-black/35 group-hover:text-black/60"
                  )}
                  strokeWidth={2}
                />
                <span className="flex-1">{label}</span>
                <span
                  className={cn(
                    "text-[9px] font-mono tracking-wider transition-colors",
                    active ? "text-white/35" : "text-black/20"
                  )}
                >
                  {stage}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-3 py-4 border-t border-black/[0.07]">
          <div className="px-3 mb-3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
            <p className="text-[11px] text-black/45 truncate font-mono">{userEmail}</p>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium text-black/55 hover:text-black hover:bg-black/[0.04] transition-colors"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" strokeWidth={2} />
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Mobile top brand bar ──────────────────────────────── */}
      <header className="md:hidden fixed top-0 inset-x-0 z-40 flex items-center justify-between px-4 h-14 bg-white/90 backdrop-blur-md border-b border-black/[0.07]">
        <div className="flex items-center gap-2.5">
          <div className="relative w-7 h-7 flex-shrink-0">
            <svg viewBox="0 0 40 40" className="absolute inset-0 w-full h-full -rotate-90">
              <circle cx="20" cy="20" r="18" fill="none" stroke="#00000010" strokeWidth="2" />
              <circle cx="20" cy="20" r="18" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeDasharray="113" strokeDashoffset="34" />
            </svg>
            <div className="absolute inset-[4px] rounded-full bg-[#0B0D12] flex items-center justify-center">
              <span className="font-bold text-white text-[8px]">NS</span>
            </div>
          </div>
          <p className="font-display font-bold text-[#0B0D12] text-[12px] tracking-wider uppercase leading-none">
            Kizz Lubricants
          </p>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          aria-label="Sign out"
          className="w-8 h-8 flex items-center justify-center rounded-lg text-black/45 active:bg-black/[0.06]"
        >
          <LogOut className="w-[18px] h-[18px]" strokeWidth={2} />
        </button>
      </header>

      {/* ── Mobile bottom bar (fixed, icons + floating active pill) ── */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-white/95 backdrop-blur-md border-t border-black/[0.07]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Main navigation"
      >
        <div className="flex items-stretch justify-around h-16 px-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                aria-label={label}
                className="relative flex-1 flex flex-col items-center justify-center gap-1"
              >
                <span
                  className={cn(
                    "flex items-center justify-center w-9 h-9 rounded-full transition-all duration-200",
                    active ? "bg-[#0B0D12] shadow-[0_3px_10px_-2px_rgba(217,119,6,0.45)]" : ""
                  )}
                >
                  <Icon
                    className={cn(
                      "w-[19px] h-[19px] transition-colors",
                      active ? "text-[#F59E0B]" : "text-black/40"
                    )}
                    strokeWidth={active ? 2.3 : 2}
                  />
                </span>
                <span
                  className={cn(
                    "text-[9px] font-medium tracking-tight transition-colors",
                    active ? "text-black/80" : "text-black/0"
                  )}
                >
                  {active ? label : ""}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}