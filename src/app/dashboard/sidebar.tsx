
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import Image from "next/image";
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
  { href: "/dashboard", label: "Overview", icon: LayoutGrid },
  { href: "/dashboard/customers", label: "Customers", icon: Users },
  { href: "/dashboard/sales", label: "Sales", icon: TrendingUp },
  { href: "/dashboard/purchasing", label: "Purchasing", icon: TrendingDown },
  { href: "/dashboard/expenses", label: "Expenses", icon: Receipt },
  { href: "/dashboard/salary", label: "Salary", icon: Wallet },
  { href: "/dashboard/pnl", label: "Profit & Loss", icon: BarChart3 },
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
            <div className="relative w-24 h-24 flex-shrink-0">
              <svg viewBox="0 0 40 40" className="absolute inset-0 w-full h-full -rotate-90">
                <circle cx="20" cy="20" r="18" fill="none" stroke="#00000010" strokeWidth="1.5" />
                <circle
                  cx="20" cy="20" r="18" fill="none"
                  stroke="#D97706" strokeWidth="1.5" strokeLinecap="round"
                  strokeDasharray="113"
                  strokeDashoffset="34"
                />
              </svg>
              <a className="absolute inset-0 flex items-center justify-center select-none"
                href="/">
                <Image src="/logo.png" alt="Logo" width={60} height={60} className="object-contain" />
              </a>
            </div>
            <div>
              <p className="font-display font-bold text-[#0B0D12] text-[13px] tracking-wider uppercase leading-none">
                Kizz Lubricants
              </p>
              <p className="text-[10px] text-black/55 mt-1 tracking-[0.2em] uppercase font-mono">
                Lubricants Co.
              </p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-5 px-3 space-y-0.5 overflow-y-auto">
          
          {NAV.map(({ href, label, icon: Icon }) => {
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
                    active ? "text-[#F59E0B]" : "text-black/50 group-hover:text-black/60"
                  )}
                  strokeWidth={2}
                />
                <span className="flex-1">{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-3 py-4 border-t border-black/[0.07]">
          <div className="px-3 mb-3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
            <p className="text-[11px] text-black/55 truncate font-mono">{userEmail}</p>
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
          className="w-8 h-8 flex items-center justify-center rounded-lg text-black/55 active:bg-black/[0.06]"
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
                      active ? "text-[#F59E0B]" : "text-black/55"
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