"use client";

import { usePathname } from "next/navigation";

/**
 * Fades the page content in on every route change. Keying on the pathname
 * remounts the wrapper so the `page-enter` animation replays each navigation —
 * turning the abrupt page swap into a smooth fade while data loads.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="page-enter">
      {children}
    </div>
  );
}
