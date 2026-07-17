"use client";

import { SessionProvider } from "next-auth/react";
import Sidebar from "./sidebar";
import { ToastProvider } from "@/components/toast";
import { ConfirmProvider } from "@/components/confirm";
import { SearchProvider } from "@/components/command-palette";
import { PageTransition } from "./page-transition";
import { DashboardGuard } from "./guard";

// No server session here — that's what forced a function to run on every visit.
// The shell is now a static file the CDN serves instantly; auth is enforced on
// the client (redirect) and, for real data, on every API route.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ToastProvider>
        <ConfirmProvider>
          <SearchProvider>
            <DashboardGuard>
              <div className="min-h-screen bg-canvas">
                <Sidebar />
                <main className="md:ml-[248px] pt-14 pb-24 md:pt-0 md:pb-0 min-h-screen overflow-y-auto">
                  <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">
                  <PageTransition>{children}</PageTransition>
                </div>
                </main>
              </div>
            </DashboardGuard>
          </SearchProvider>
        </ConfirmProvider>
      </ToastProvider>
    </SessionProvider>
  );
}
