import type { Metadata } from "next";
import { Inter, Oswald, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const oswald = Oswald({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-oswald" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-plex-mono" });

export const metadata: Metadata = {
  title: "  Kizz Lubricants — Admin",
  description: "Business ledger admin panel for Kizz Lubricants",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${oswald.variable} ${plexMono.variable} font-body antialiased`}>
        {children}
      </body>
    </html>
  );
}
