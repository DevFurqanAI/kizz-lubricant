import type { Metadata } from "next";
import { Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

// Kept for tabular figures on numbers / IDs only.
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

const SITE_TITLE = "Kizz Lubricants";
const SITE_DESC = "Business ledger admin panel for Kizz Lubricants";

export const metadata: Metadata = {
  // Absolute base for og:image etc. In production this MUST be the real https
  // domain (via NEXTAUTH_URL) or link previews get a broken image URL.
  metadataBase: new URL(process.env.NEXTAUTH_URL ?? "http://localhost:3000"),
  title: SITE_TITLE,
  description: SITE_DESC,
  icons: {
    icon: '/favicon.png',
  },
  // Link-unfurl preview (WhatsApp, Slack, iMessage, etc.). The crawler is
  // unauthenticated, so this only renders for the PUBLIC pages (the sign-in
  // page at "/"); dashboard routes are behind auth and won't unfurl.
  openGraph: {
    type: "website",
    siteName: SITE_TITLE,
    title: SITE_TITLE,
    description: SITE_DESC,
    images: [{ url: "/og-image.png", width: 1920, height: 1080, alt: SITE_TITLE }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESC,
    images: ["/og-image.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${plexMono.variable}`}>
      <body className="font-body antialiased bg-canvas text-ink">{children}</body>
    </html>
  );
}
