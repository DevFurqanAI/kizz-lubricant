import type { Metadata } from "next";
import { Inter, IBM_Plex_Mono } from "next/font/google";
// @ts-ignore: side-effect CSS import without explicit type declarations
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

// Absolute base for og:image etc. `.env` is gitignored, so NEXTAUTH_URL isn't
// present at build on Vercel — fall back to Vercel's own build-time domain vars
// so the preview image never resolves to localhost in production.
const siteUrl =
  process.env.NEXTAUTH_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined) ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined) ||
  "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
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
    images: [{ url: "/og-image.png", width: 1000, height: 563, alt: SITE_TITLE }],
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
