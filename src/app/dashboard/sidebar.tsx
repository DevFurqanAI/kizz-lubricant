"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { useSearchPalette } from "@/components/command-palette";
import { useConfirm } from "@/components/confirm";
import {
  LayoutGrid,
  Users,
  TrendingUp,
  TrendingDown,
  Receipt,
  Wallet,
  ArrowLeftRight,
  BarChart3,
  LogOut,
  Search,
  ChevronLeft,
} from "lucide-react";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutGrid },
  { href: "/dashboard/customers", label: "Customers", icon: Users },
  { href: "/dashboard/sales", label: "Sales", icon: TrendingUp },
  { href: "/dashboard/purchasing", label: "Purchasing", icon: TrendingDown },
  { href: "/dashboard/expenses", label: "Expenses", icon: Receipt },
  { href: "/dashboard/salary", label: "Salary", icon: Wallet },
  { href: "/dashboard/payments", label: "Payments", icon: ArrowLeftRight },
  { href: "/dashboard/pnl", label: "Profit & Loss", icon: BarChart3 },
];

const COLLAPSE_KEY = "kizz-sidebar-collapsed";

/** Minimal monogram + wordmark. No industrial/oil imagery. */
function Brand({ collapsed }: { collapsed: boolean }) {
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
      {!collapsed && (
        <span className="leading-tight">
          <span className="block text-[15px] font-semibold tracking-tight text-ink">
            Kizz Lubricants
          </span>
        </span>
      )}
    </div>
  );
}

function initialsFrom(email: string) {
  if (!email) return "";
  const name = email.split("@")[0];
  return name.slice(0, 2).toUpperCase();
}

export default function Sidebar() {
  const path = usePathname();
  const { data: session, status } = useSession();
  const userEmail = session?.user?.email ?? "";
  const { open: openSearch } = useSearchPalette();
  const confirmDialog = useConfirm();

  const [collapsed, setCollapsed] = useState(false);
  const [pulseHint, setPulseHint] = useState(true);
  const itemRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [indicator, setIndicator] = useState<{ top: number; height: number } | null>(null);

  // Restore the collapse preference client-side only — avoids an SSR/CSR mismatch.
  useLayoutEffect(() => {
    const saved = window.localStorage.getItem(COLLAPSE_KEY) === "1";
    if (saved) setCollapsed(true);
    document.documentElement.style.setProperty("--sidebar-w", saved ? "76px" : "248px");
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setPulseHint(false), 2600);
    return () => clearTimeout(t);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      document.documentElement.style.setProperty("--sidebar-w", next ? "76px" : "248px");
      return next;
    });
  };

  const isActive = (href: string) =>
    href === "/dashboard" ? path === "/dashboard" : path === href || path.startsWith(href + "/");

  // Slide the active-route indicator to the matched item instead of redrawing it per-row.
  useLayoutEffect(() => {
    const active = NAV.find((n) => isActive(n.href));
    const el = active && itemRefs.current[active.href];
    if (el) setIndicator({ top: el.offsetTop, height: el.offsetHeight });
    else setIndicator(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, collapsed]);

  const handleSignOut = async () => {
    const ok = await confirmDialog({
      title: "Sign out?",
      message: "You'll need to sign in again to access the dashboard.",
      confirmText: "Sign out",
      danger: true,
    });
    if (ok) signOut({ callbackUrl: "/" });
  };

  return (
    <>
      {/* ── Desktop sidebar — soft slate panel ────────────────── */}
      <aside
        className={cn(
          "hidden md:flex fixed inset-y-0 left-0 z-40 flex-col bg-panel border-r border-line-strong transition-[width] duration-200 ease-out",
          collapsed ? "w-[76px]" : "w-[248px]",
        )}
      >
        <button
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute top-[26px] -right-3 w-6 h-6 flex items-center justify-center rounded-full border border-line-strong bg-surface text-faint shadow-btn hover:text-accent hover:border-accent/40 transition-colors"
        >
          <ChevronLeft
            className={cn("w-3.5 h-3.5 transition-transform duration-200", collapsed && "rotate-180")}
            strokeWidth={2.5}
          />
        </button>

        <div className={cn("h-[68px] flex items-center border-b border-line-strong/70", collapsed ? "px-4 justify-center" : "px-5")}>
          <Link href="/dashboard">
            <Brand collapsed={collapsed} />
          </Link>
        </div>

        {/* Search trigger */}
        <div className={cn("pt-3", collapsed ? "px-2" : "px-3")}>
          <button
            onClick={openSearch}
            title="Search"
            className={cn(
              "w-full flex items-center gap-2.5 py-2 rounded-lg border border-line-strong bg-surface/70 text-[13px] text-muted hover:text-ink hover:border-accent/30 hover:bg-surface transition-colors",
              collapsed ? "px-2 justify-center" : "px-3",
            )}
          >
            <Search className="w-4 h-4 flex-shrink-0" strokeWidth={2} />
            {!collapsed && (
              <>
                <span className="flex-1 text-left">Search…</span>
                <kbd
                  className={cn(
                    "text-[10.5px] font-medium text-faint border border-line-strong rounded px-1.5 py-0.5",
                    pulseHint && "animate-pulse border-accent/40 text-accent-ink",
                  )}
                >
                  ⌘K
                </kbd>
              </>
            )}
          </button>
        </div>

        {/* Nav */}
        <nav className={cn("relative flex-1 flex flex-col gap-1 py-4 overflow-y-auto", collapsed ? "px-2" : "px-3")}>
          {indicator && (
            <span
              className="absolute left-0 top-0 w-[3px] rounded-r-full bg-accent transition-[transform,height] duration-200 ease-out"
              style={{ transform: `translateY(${indicator.top}px)`, height: indicator.height }}
            />
          )}
          {!collapsed && <p className="px-3 pb-2 pt-1 eyebrow">Records</p>}
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                ref={(el) => {
                  itemRefs.current[href] = el;
                }}
                aria-current={active ? "page" : undefined}
                title={collapsed ? label : undefined}
                className={cn(
                  "group relative flex items-center gap-3 py-2.5 rounded-lg text-[13.5px] font-medium transition-all duration-150",
                  collapsed ? "px-2.5 justify-center" : "px-3",
                  active
                    ? "bg-gradient-to-r from-accent-tint/70 to-surface text-ink shadow-btn ring-1 ring-accent/10"
                    : "text-muted hover:text-ink hover:bg-surface/60",
                )}
              >
                <Icon
                  className={cn(
                    "w-[18px] h-[18px] flex-shrink-0 transition-colors",
                    active ? "text-accent" : "text-faint group-hover:text-muted",
                  )}
                  strokeWidth={2}
                />
                {!collapsed && <span className="flex-1">{label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className={cn("py-4 border-t border-line-strong/70", collapsed ? "px-2" : "px-3")}>
          <div className={cn("mb-2.5 flex items-center gap-2", collapsed ? "justify-center" : "px-3")}>
            {status === "loading" ? (
              <span className="w-6 h-6 rounded-full bg-surface animate-pulse flex-shrink-0" />
            ) : (
              <span
                className="w-6 h-6 rounded-full bg-accent-tint text-accent-ink text-[10.5px] font-semibold flex items-center justify-center flex-shrink-0"
                title={userEmail}
              >
                {initialsFrom(userEmail)}
              </span>
            )}
            {!collapsed &&
              (status === "loading" ? (
                <span className="h-3 w-28 rounded bg-surface animate-pulse" />
              ) : (
                <p className="text-[11.5px] text-muted truncate" title={userEmail}>
                  {userEmail}
                </p>
              ))}
          </div>
          <button
            onClick={handleSignOut}
            title={collapsed ? "Sign out" : undefined}
            className={cn(
              "w-full flex items-center gap-3 py-2.5 rounded-lg text-[13.5px] font-medium text-muted hover:text-danger hover:bg-danger-tint/60 transition-colors",
              collapsed ? "px-2.5 justify-center" : "px-3",
            )}
          >
            <LogOut className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={2} />
            {!collapsed && "Sign out"}
          </button>
        </div>
      </aside>

      {/* ── Mobile top brand bar ──────────────────────────────── */}
      <header className="md:hidden fixed top-0 inset-x-0 z-40 flex items-center justify-between px-4 h-14 bg-surface/90 backdrop-blur-md border-b border-line">
        <Link href="/dashboard">
          <Brand collapsed={false} />
        </Link>
        <div className="flex items-center gap-1">
          <button
            onClick={openSearch}
            aria-label="Search"
            className="w-9 h-9 flex items-center justify-center rounded-lg text-muted active:bg-black/[0.06]"
          >
            <Search className="w-[18px] h-[18px]" strokeWidth={2} />
          </button>
          <button
            onClick={handleSignOut}
            aria-label="Sign out"
            className="w-9 h-9 flex items-center justify-center rounded-lg text-muted active:bg-danger-tint"
          >
            <LogOut className="w-[18px] h-[18px]" strokeWidth={2} />
          </button>
        </div>
      </header>

      {/* ── Mobile bottom bar ─────────────────────────────────── */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-surface/95 backdrop-blur-md border-t border-line"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Main navigation"
      >
        <div className="flex items-stretch justify-around h-16 px-0.5">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                aria-label={label}
                aria-current={active ? "page" : undefined}
                className="relative flex-1 flex flex-col items-center justify-center gap-1 min-w-0"
              >
                <span
                  className={cn(
                    "flex items-center justify-center w-8 h-8 rounded-lg transition-colors duration-150",
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
