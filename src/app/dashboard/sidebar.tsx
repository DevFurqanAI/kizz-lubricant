"use client";

import Link from "next/link";
import Image from "next/image";
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
  { href: "/dashboard", label: "Overview", icon: LayoutGrid },
  { href: "/dashboard/customers", label: "Customers", icon: Users },
  { href: "/dashboard/sales", label: "Sales", icon: TrendingUp },
  { href: "/dashboard/purchasing", label: "Purchasing", icon: TrendingDown },
  { href: "/dashboard/expenses", label: "Expenses", icon: Receipt },
  { href: "/dashboard/salary", label: "Salary", icon: Wallet },
  { href: "/dashboard/pnl", label: "Profit & Loss", icon: BarChart3 },
];

/** Minimal monogram + wordmark. No industrial/oil imagery. */
function Brand() {
  return (
    <div className="flex items-center gap-2.5 select-none">
      <Image
        src="/logo.png"
        alt="Kizz Lubricants"
        width={44}
        height={44}
        priority
        className="flex-shrink-0 w-[44px] h-[44px] rounded-lg object-contain"
      />
      <span className="leading-tight">
        <span className="block text-[15px] font-semibold tracking-tight text-ink">
          Kizz Lubricants
        </span>
      </span>
    </div>
  );
}

export default function Sidebar({ userEmail }: { userEmail: string }) {
  const path = usePathname();

  const isActive = (href: string) =>
    href === "/dashboard" ? path === "/dashboard" : path.startsWith(href);

  return (
    <>
      {/* ── Desktop sidebar — soft slate panel ────────────────── */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 z-40 w-[248px] flex-col bg-panel border-r border-line-strong">
        <div className="px-5 h-[68px] flex items-center border-b border-line-strong/70">
          <Link href="/dashboard">
            <Brand />
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          <p className="px-3 pb-2 pt-1 eyebrow">Records</p>
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13.5px] font-medium transition-all duration-150",
                  active
                    ? "bg-surface text-ink shadow-btn"
                    : "text-muted hover:text-ink hover:bg-surface/60",
                )}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-accent" />
                )}
                <Icon
                  className={cn(
                    "w-[18px] h-[18px] flex-shrink-0 transition-colors",
                    active ? "text-accent" : "text-faint group-hover:text-muted",
                  )}
                  strokeWidth={2}
                />
                <span className="flex-1">{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-3 py-4 border-t border-line-strong/70">
          <div className="px-3 mb-2.5 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-success flex-shrink-0 shadow-[0_0_0_3px_rgba(21,145,75,0.14)]" />
            <p className="text-[11.5px] text-muted truncate">{userEmail}</p>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13.5px] font-medium text-muted hover:text-ink hover:bg-surface/60 transition-colors"
          >
            <LogOut className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={2} />
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Mobile top brand bar ──────────────────────────────── */}
      <header className="md:hidden fixed top-0 inset-x-0 z-40 flex items-center justify-between px-4 h-14 bg-surface/90 backdrop-blur-md border-b border-line">
        <Link href="/dashboard">
          <Brand />
        </Link>
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          aria-label="Sign out"
          className="w-9 h-9 flex items-center justify-center rounded-lg text-muted active:bg-black/[0.06]"
        >
          <LogOut className="w-[18px] h-[18px]" strokeWidth={2} />
        </button>
      </header>

      {/* ── Mobile bottom bar ─────────────────────────────────── */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-surface/95 backdrop-blur-md border-t border-line"
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
                aria-current={active ? "page" : undefined}
                className="relative flex-1 flex flex-col items-center justify-center gap-1"
              >
                <span
                  className={cn(
                    "flex items-center justify-center w-9 h-8 rounded-lg transition-colors duration-150",
                    active ? "bg-accent-tint" : "",
                  )}
                >
                  <Icon
                    className={cn(
                      "w-[19px] h-[19px] transition-colors",
                      active ? "text-accent-ink" : "text-faint",
                    )}
                    strokeWidth={2}
                  />
                </span>
                <span
                  className={cn(
                    "text-[9px] font-semibold tracking-tight transition-colors",
                    active ? "text-accent-ink" : "text-transparent",
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
